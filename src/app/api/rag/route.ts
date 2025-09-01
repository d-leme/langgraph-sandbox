import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { Document } from "@langchain/core/documents";
import { END, START, StateGraph, Annotation } from "@langchain/langgraph";

const RagStateAnnotation = Annotation.Root({
  folderPath: Annotation<string>,
  message: Annotation<string>,
  rawDocs: Annotation<any[]>,
  splitDocs: Annotation<Document[]>,
  vectorStore: Annotation<MemoryVectorStore>,
  context: Annotation<string>,
  response: Annotation<string>,
});

type RagGraphState = typeof RagStateAnnotation.State;

async function loadDocumentsNode(
  state: RagGraphState,
): Promise<Partial<RagGraphState>> {
  const files = await fs.readdir(state.folderPath);
  const docs = [];
  for (const file of files) {
    if (file.endsWith(".md")) {
      const filePath = path.join(state.folderPath, file);
      const content = await fs.readFile(filePath, "utf8");
      docs.push({ content, metadata: { source: file } });
    }
  }
  return { rawDocs: docs };
}

async function splitDocumentsNode(
  state: RagGraphState,
): Promise<Partial<RagGraphState>> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 800,
    chunkOverlap: 100,
  });
  const splitDocs: Document[] = [];
  for (const doc of state.rawDocs) {
    const splits = await splitter.splitText(doc.content);
    for (const chunk of splits) {
      splitDocs.push({ pageContent: chunk, metadata: doc.metadata });
    }
  }
  return { splitDocs };
}

async function vectorizeNode(
  state: RagGraphState,
): Promise<Partial<RagGraphState>> {
  const embeddings = new OpenAIEmbeddings({ model: "text-embedding-ada-002" });
  const vectorStore = await MemoryVectorStore.fromDocuments(
    state.splitDocs,
    embeddings,
  );
  return { vectorStore };
}

async function retrieveNode(
  state: RagGraphState,
): Promise<Partial<RagGraphState>> {
  const relevantDocs = await state.vectorStore.similaritySearch(
    state.message,
    4,
  );
  const context = relevantDocs.map((d) => d.pageContent).join("\n---\n");
  return { context };
}

async function answerNode(
  state: RagGraphState,
): Promise<Partial<RagGraphState>> {
  const model = new ChatOpenAI({ modelName: "gpt-4o", temperature: 0.3 });
  const prompt = [
    new SystemMessage(
      "You are a helpful assistant. Use ONLY the provided context to answer the user's question. If the answer is not in the context, say you don't know. Context:\n" +
        state.context,
    ),
    new HumanMessage(state.message),
  ];
  const response = await model.invoke(prompt);
  return { response: response.content as string };
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

    const folderPath = path.resolve(process.cwd(), "ai-context");
    const workflow = new StateGraph(RagStateAnnotation)
      .addNode("load", loadDocumentsNode)
      .addNode("split", splitDocumentsNode)
      .addNode("vectorize", vectorizeNode)
      .addNode("retrieve", retrieveNode)
      .addNode("answer", answerNode)
      .addEdge(START, "load")
      .addEdge("load", "split")
      .addEdge("split", "vectorize")
      .addEdge("vectorize", "retrieve")
      .addEdge("retrieve", "answer")
      .addEdge("answer", END);

    const app = workflow.compile();

    // Run the workflow
    const result = await app.invoke({
      folderPath,
      message,
      rawDocs: [],
      splitDocs: [],
      vectorStore: undefined,
      context: "",
      response: "",
    });

    return NextResponse.json({
      success: true,
      data: {
        message,
        response: result.response,
        context: result.context,
        processedBy:
          "RAG (Retrieval-Augmented Generation) with InMemory VectorStore + LangGraph",
      },
    });
  } catch (error) {
    console.error("Error in RAG endpoint:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to process RAG request",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
