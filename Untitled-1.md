// multi_agent.ts
// Run: npx tsx multi_agent.ts
process.env.OPENAI_API_KEY ||= "<your-openai-key>";

import { z } from "zod";
import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

// ---------- Models ----------
const MODEL = process.env.LLM_MODEL ?? "gpt-4o-mini";
const ORCH_MODEL = process.env.ORCH_MODEL ?? MODEL;

// ---------- MCP servers (launched via stdio) ----------
const PLAYWRIGHT = {
  transport: "stdio" as const,
  command: "npx",
  args: ["-y", "@playwright/mcp@latest",
    "--blocked-origins", "file:;data:",
    "--block-service-workers",
    // Example: "--allowed-origins", "https://example.com;https://news.ycombinator.com",
  ],
};

const FILESYSTEM = {
  transport: "stdio" as const,
  command: "npx",
  args: [
    "-y",
    "@modelcontextprotocol/server-filesystem@latest",
    "--root",
    process.cwd() + "/sandbox", // change or add more --root entries
    // "--readOnly", // uncomment to enforce read-only FS access
  ],
};

// Create separate MCP clients so we can keep tool sets distinct
async function loadWebTools() {
  const client = new MultiServerMCPClient({
    mcpServers: { playwright: PLAYWRIGHT },
    useStandardContentBlocks: true,
  });
  const tools = await client.getTools();
  return { tools, close: () => client.close() };
}
async function loadFsTools() {
  const client = new MultiServerMCPClient({
    mcpServers: { filesystem: FILESYSTEM },
    useStandardContentBlocks: true,
  });
  const tools = await client.getTools();
  return { tools, close: () => client.close() };
}

// ---------- Build graph ----------
async function buildGraph() {
  // Load MCP tools
  const web = await loadWebTools();
  const fs = await loadFsTools();

  // --- Web agent (Playwright MCP) ---
  const webModel = new ChatOpenAI({ model: MODEL, temperature: 0 }).bindTools(web.tools);
  const webToolNode = new ToolNode(web.tools);

  async function webAgent(state: typeof MessagesAnnotation.State) {
    const sys = new SystemMessage(
      "You are the Web Agent. Use Playwright MCP browser tools to navigate, click, type, wait, " +
      "snapshot, and screenshot pages. Return concise results."
    );
    const resp = await webModel.invoke([sys, ...state.messages]);
    return { messages: [resp] };
  }
  function webShouldContinue({ messages }: typeof MessagesAnnotation.State) {
    const last = messages[messages.length - 1] as AIMessage;
    return last.tool_calls?.length ? "web_tools" : "__end__";
  }

  // --- FS agent (Filesystem MCP) ---
  const fsModel = new ChatOpenAI({ model: MODEL, temperature: 0 }).bindTools(fs.tools);
  const fsToolNode = new ToolNode(fs.tools);

  async function fsAgent(state: typeof MessagesAnnotation.State) {
    const sys = new SystemMessage(
      "You are the Filesystem Agent. Use the Filesystem MCP tools only. " +
      "Stay strictly within the configured roots. Prefer list/read before writes."
    );
    const resp = await fsModel.invoke([sys, ...state.messages]);
    return { messages: [resp] };
  }
  function fsShouldContinue({ messages }: typeof MessagesAnnotation.State) {
    const last = messages[messages.length - 1] as AIMessage;
    return last.tool_calls?.length ? "fs_tools" : "__end__";
  }

  // --- Orchestrator (router) ---
  const RouteSchema = z.object({
    route: z.enum(["web", "fs", "final"]),
    rationale: z.string(),
  });
  const orchBase = new ChatOpenAI({ model: ORCH_MODEL, temperature: 0 });

  async function orchestrator(state: typeof MessagesAnnotation.State) {
    const sys = new SystemMessage(
      "You are the Orchestrator. " +
        "route='web' for browsing/automation/screenshots/forms. " +
        "route='fs' for reading/writing/listing local files. " +
        "route='final' if you can answer without tools. " +
        "Return JSON with {route, rationale}."
    );
    const orch = orchBase.withStructuredOutput(RouteSchema);
    const { route, rationale } = await orch.invoke([sys, ...state.messages]);
    // Emit a router message we can inspect for edges
    return { messages: [new AIMessage({ content: `[router] route=${route} | ${rationale}`, name: "router" })] };
  }
  function pickRoute({ messages }: typeof MessagesAnnotation.State) {
    const last = messages[messages.length - 1] as BaseMessage;
    const text = String(last.content);
    if (text.includes("route=web")) return "web_agent";
    if (text.includes("route=fs")) return "fs_agent";
    return "__end__";
  }

  // --- Graph wiring ---
  const g = new StateGraph(MessagesAnnotation)
    .addNode("orchestrator", orchestrator)

    .addNode("web_agent", webAgent)
    .addNode("web_tools", webToolNode)
    .addConditionalEdges("web_agent", webShouldContinue, { web_tools: "web_tools" })
    .addEdge("web_tools", "web_agent")

    .addNode("fs_agent", fsAgent)
    .addNode("fs_tools", fsToolNode)
    .addConditionalEdges("fs_agent", fsShouldContinue, { fs_tools: "fs_tools" })
    .addEdge("fs_tools", "fs_agent")

    .addEdge("__start__", "orchestrator")
    .addConditionalEdges("orchestrator", pickRoute, {
      web_agent: "web_agent",
      fs_agent: "fs_agent",
    });

  const app = g.compile();

  // Provide a cleanup for MCP clients when you’re done
  async function close() {
    await web.close();
    await fs.close();
  }

  return { app, close };
}

// ---------- Demo ----------
async function main() {
  const { app, close } = await buildGraph();

  console.log("\n=== Demo: Web ===");
  const r1 = await app.invoke({
    messages: [
      new HumanMessage(
        "Open https://example.com, wait for load, take a screenshot, and summarize the H1."
      ),
    ],
  });
  console.log(r1.messages[r1.messages.length - 1].content);

  console.log("\n=== Demo: FS ===");
  const r2 = await app.invoke({
    messages: [
      new HumanMessage(
        "List the 'sandbox' folder then read 'sandbox/README.md' if present and quote its first line."
      ),
    ],
  });
  console.log(r2.messages[r2.messages.length - 1].content);

  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
