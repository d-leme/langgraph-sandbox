import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import {
  END,
  MessagesAnnotation,
  START,
  StateGraph,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatOpenAI } from "@langchain/openai";
import { NextResponse } from "next/server";
import { z } from "zod";

const PLAYWRIGHT = {
  transport: "stdio" as const,
  command: "bash",
  args: [
    "-lc",
    `DISPLAY=${process.env.DISPLAY} WAYLAND_DISPLAY=${process.env.WAYLAND_DISPLAY || ""} \
     npx -y @playwright/mcp@latest \
     --blocked-origins "file:;data:"`,
  ],
};

const FILESYSTEM = {
  transport: "stdio" as const,
  command: "npx",
  args: [
    "-y",
    "@modelcontextprotocol/server-filesystem@latest",
    process.cwd() + "/ai-context",
  ],
};

class WebAgent {
  tools: any;
  close: () => Promise<void>;
  model: any;
  toolNode: any;

  static async create() {
    const client = new MultiServerMCPClient({
      mcpServers: { playwright: PLAYWRIGHT },
      useStandardContentBlocks: true,
      throwOnLoadError: true,
    });
    const tools = await client.getTools();
    return new WebAgent(tools, () => client.close());
  }

  constructor(tools: any, close: () => Promise<void>) {
    this.tools = tools;
    this.close = close;
    this.model = new ChatOpenAI({ model: "gpt-4o", temperature: 0 }).bindTools(
      tools,
    );
    this.toolNode = new ToolNode(tools);
  }

  async agent(state: typeof MessagesAnnotation.State) {
    const sys = new SystemMessage(
      `You are the Web Agent. Your only task is to use the Playwright MCP browser tools to navigate to the target web page specified by the user and extract its content.
       You can navigate through the pages to achieve your goal.
       Return ONLY summary of your findings in a descriptive way in Markdown.`,
    );
    const resp = await this.model.invoke([sys, ...state.messages]);

    return {
      messages: [
        new AIMessage({
          content: resp.content,
          name: "scraped_content",
          tool_calls: resp.tool_calls,
        }),
      ],
    };
  }

  shouldContinue({ messages }: typeof MessagesAnnotation.State) {
    const last = messages[messages.length - 1] as AIMessage;
    return last.tool_calls?.length ? "web_tools" : END;
  }
}

class FsAgent {
  tools: any;
  close: () => Promise<void>;
  model: any;
  toolNode: any;

  static async create() {
    const client = new MultiServerMCPClient({
      mcpServers: { filesystem: FILESYSTEM },
      useStandardContentBlocks: true,
    });
    const tools = await client.getTools();
    return new FsAgent(tools, () => client.close());
  }

  constructor(tools: any, close: () => Promise<void>) {
    this.tools = tools;
    this.close = close;
    this.model = new ChatOpenAI({ model: "gpt-4o", temperature: 0 }).bindTools(
      tools,
    );
    this.toolNode = new ToolNode(tools);
  }

  async agent(state: typeof MessagesAnnotation.State) {
    const htmlMsg = (() => {
      for (let i = state.messages.length - 1; i >= 0; i--) {
        if ((state.messages[i] as any).name === "scraped_content") {
          return state.messages[i];
        }
      }
      return undefined;
    })();

    const sys = new SystemMessage(
      `You are the Filesystem Agent. You will receive content from a website in summary form.
       Then save the summary to a file named 'ai-context/{name_of_company}.md' 
       in the root directory using the Filesystem MCP tools. Respond with a confirmation message after saving.`,
    );

    const resp = await this.model.invoke([
      sys,
      ...state.messages,
      new HumanMessage({
        content: htmlMsg?.content ?? "",
        name: "html_for_summary",
      }),
    ]);
    return {
      messages: [
        new AIMessage({
          content: resp.content,
          name: "html_summarized",
          tool_calls: resp.tool_calls,
        }),
      ],
    };
  }

  shouldContinue({ messages }: typeof MessagesAnnotation.State) {
    const last = messages[messages.length - 1] as AIMessage;
    return last.tool_calls?.length ? "fs_tools" : END;
  }
}

class OrchestratorAgent {
  private readonly model = new ChatOpenAI({ model: "gpt-4o", temperature: 0 });
  private readonly routeSchema = z.object({
    route: z.enum(["web", "fs", "final"]),
    rationale: z.string(),
  });

  async agent(state: typeof MessagesAnnotation.State) {
    const last = state.messages[state.messages.length - 1];
    if (last?.name === "html_summarized") {
      return {
        messages: [
          new AIMessage({ content: `Process complete`, name: "router" }),
        ],
      };
    }

    const sys = new SystemMessage(
      "You are the Orchestrator. " +
        "route='web' for scraping the content from web pages. " +
        "route='fs' for summarizing and saving the content to a file. " +
        "route='final' if you can answer without tools. " +
        "If the scrapper ran successfully send it over to route='fs'. " +
        "Return JSON with {route, rationale}.",
    );
    const orch = this.model.withStructuredOutput(this.routeSchema);
    const { route, rationale } = await orch.invoke([sys, ...state.messages]);
    return {
      messages: [
        new AIMessage({
          content: `[router] route=${route} | ${rationale}`,
          name: "router",
        }),
      ],
    };
  }

  pickRoute({ messages }: typeof MessagesAnnotation.State) {
    const last = messages[messages.length - 1] as BaseMessage;
    const text = String(last.content);
    if (text.includes("route=web")) return "web_agent";
    if (text.includes("route=fs")) return "fs_agent";
    return END;
  }
}

async function buildGraph() {
  const webAgent = await WebAgent.create();
  const fsAgent = await FsAgent.create();
  const orchestrator = new OrchestratorAgent();

  const g = new StateGraph(MessagesAnnotation)
    .addNode("orchestrator", orchestrator.agent.bind(orchestrator))
    .addNode("web_agent", webAgent.agent.bind(webAgent))
    .addNode("web_tools", webAgent.toolNode)
    .addNode("fs_agent", fsAgent.agent.bind(fsAgent))
    .addNode("fs_tools", fsAgent.toolNode)
    .addConditionalEdges("web_agent", webAgent.shouldContinue.bind(webAgent), {
      web_tools: "web_tools",
      [END]: "orchestrator",
    })
    .addEdge("web_tools", "web_agent")
    .addConditionalEdges("fs_agent", fsAgent.shouldContinue.bind(fsAgent), {
      fs_tools: "fs_tools",
      [END]: "orchestrator",
    })
    .addEdge("fs_tools", "fs_agent")
    .addEdge(START, "orchestrator")
    .addConditionalEdges(
      "orchestrator",
      orchestrator.pickRoute.bind(orchestrator),
      {
        web_agent: "web_agent",
        fs_agent: "fs_agent",
        [END]: END,
      },
    );

  const app = g.compile();

  async function close() {
    await webAgent.close();
    await fsAgent.close();
  }

  return { app, close };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message } = body;
    if (!message) {
      return NextResponse.json(
        { success: false, message: "Message is required" },
        { status: 400 },
      );
    }
    const { app, close } = await buildGraph();
    const result = await app.invoke({ messages: [new HumanMessage(message)] });
    await close();
    // Return the last message content as the result
    const lastMsg = result.messages?.[result.messages?.length - 1];
    return NextResponse.json({
      success: true,
      data: {
        response: lastMsg?.content ?? "No response generated.",
        messages:
          result.messages?.map((m: any) => ({
            role: m._getType?.(),
            content: m.content,
            name: m.name,
          })) ?? [],
      },
      message: "AI response generated using multi-agent LangGraph orchestrator",
    });
  } catch (error) {
    console.error("Error in multi-agent endpoint:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to process AI request",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
