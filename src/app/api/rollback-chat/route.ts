import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { NextResponse } from "next/server";

export const snapshots = new Map<
  string,
  Array<{
    version: number;
    state: Array<{ role: string; content: string }>;
  }>
>();

const ConvState = Annotation.Root({
  threadId: Annotation<string>,
  message: Annotation<string>,
  history: Annotation<
    Array<{ role: "system" | "user" | "assistant"; content: string }>
  >,
  response: Annotation<string>,
});
type GraphState = typeof ConvState.State;

async function replyNode(state: GraphState): Promise<Partial<GraphState>> {
  const model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.6 });

  const previousSnapshots = snapshots.get(state.threadId) ?? [];
  const latestSnapshot = previousSnapshots[previousSnapshots.length - 1];

  const chatMessages =
    latestSnapshot?.state.map((m) =>
      m.role === "user"
        ? new HumanMessage(m.content)
        : m.role === "assistant"
          ? new AIMessage(m.content)
          : new SystemMessage(m.content),
    ) ?? [];

  const history = [
    new SystemMessage(
      "You are a helpful demo assistant. Keep replies short and actionable.",
    ),
    ...chatMessages,
    new HumanMessage(state.message),
  ];

  const result = await model.invoke(history);
  const assistantText = String(result.content ?? "");

  return {
    response: assistantText,
  };
}

// Body: { threadId?: string, message: string }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { threadId, message } = body ?? {};

    const graph = new StateGraph(ConvState)
      .addNode("reply", replyNode)
      .addEdge(START, "reply")
      .addEdge("reply", END)
      .compile();

    // Invoke with current turn
    const result = await graph.invoke({
      threadId,
      message,
      response: "",
    });

    const previousSnapshots = snapshots.get(threadId) ?? [];
    const latestSnapshot = previousSnapshots[previousSnapshots.length - 1];
    const latestVersion = latestSnapshot?.version ?? 0;
    const latestState = latestSnapshot?.state ?? [];

    const newState = [
      ...latestState,
      { role: "user", content: message },
      { role: "assistant", content: result.response },
    ];

    snapshots.set(threadId, [
      ...previousSnapshots,
      { version: (latestVersion ?? 0) + 1, state: newState },
    ]);

    return NextResponse.json({
      success: true,
      data: {
        threadId,
        version: latestVersion + 1,
        response: result.response,
      },
      message: "Turn processed, state snapshotted.",
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        message: "Failed to process chat turn.",
        error: String(err?.message ?? err),
      },
      { status: 500 },
    );
  }
}
