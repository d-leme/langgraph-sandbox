import { NextResponse } from "next/server";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const StateAnnotation = Annotation.Root({
  message: Annotation<string>,
  gpt4Response: Annotation<string>,
  gpto3Mini: Annotation<string>,
  gpt4MiniResponse: Annotation<string>,
  finalResponse: Annotation<string>,
  selectedAgent: Annotation<string>,
  reasoning: Annotation<string>,
});

type GraphState = typeof StateAnnotation.State;

const MODEL_CONFIGS = {
  GPT4: {
    name: "gpt-4",
    temperature: 0.8,
    systemPrompt:
      "You are a creative and comprehensive AI assistant powered by GPT-4. Provide detailed, thoughtful responses with rich context and creative insights. Focus on depth and nuanced understanding.",
    agentName: "GPT-4",
    stateKey: "gpt4Response" as keyof GraphState,
  },
  GPT_O3_MINI: {
    name: "o3-mini",
    temperature: undefined,
    systemPrompt:
      "You are an efficient and balanced AI assistant powered by GPT-o3-mini. Provide clear, well-structured responses that are concise yet informative. Focus on practical and actionable insights.",
    agentName: "GPT-o3-mini",
    stateKey: "gpto3Mini" as keyof GraphState,
  },
  GPT4_MINI: {
    name: "gpt-4o-mini",
    temperature: 0.4,
    systemPrompt:
      "You are a fast and precise AI assistant powered by GPT-4o-Mini. Provide quick, accurate, and concise responses. Focus on efficiency and direct answers while maintaining helpfulness.",
    agentName: "GPT-4o-Mini",
    stateKey: "gpt4MiniResponse" as keyof GraphState,
  },
} as const;

interface EvaluationResult {
  selectedAgent: string;
  finalResponse: string;
  reasoning: string;
}

function createAgent(
  config: (typeof MODEL_CONFIGS)[keyof typeof MODEL_CONFIGS],
) {
  return async (state: GraphState): Promise<Partial<GraphState>> => {
    try {
      console.log(
        `${config.agentName} Agent: Processing with ${config.name}...`,
      );

      const model = new ChatOpenAI({
        modelName: config.name,
        temperature: config.temperature,
      });

      const response = await model.invoke([
        new SystemMessage(config.systemPrompt),
        new HumanMessage(state.message),
      ]);

      return { [config.stateKey]: response.content as string };
    } catch (error) {
      console.error(`${config.agentName} Agent error:`, error);
      return {
        [config.stateKey]: `${config.agentName} Agent encountered an error processing your request.`,
      };
    }
  };
}

// Create individual agents using the factory
const gpt4Agent = createAgent(MODEL_CONFIGS.GPT4);
const gpto3MiniAgent = createAgent(MODEL_CONFIGS.GPT_O3_MINI);
const gpt4MiniAgent = createAgent(MODEL_CONFIGS.GPT4_MINI);

function createEvaluationPrompt(state: GraphState): string {
  return `
You are an expert AI response evaluator. You need to analyze three different responses to the same user query and determine which one is the best.

User Query: "${state.message}"

Response A: ${state.gpt4Response}

Response B: ${state.gpto3Mini}

Response C: ${state.gpt4MiniResponse}

Evaluate each response based on:
1. Relevance to the user's query
2. Accuracy and factual correctness
3. Completeness and depth
4. Clarity and readability
5. Helpfulness and actionability

Choose the BEST response and provide your reasoning. Respond in this exact format:
SELECTED: [A, B, or C]
REASONING: [Your detailed reasoning for why this response is best]
WINNING_RESPONSE: [Copy the full text of the winning response]
`;
}

/**
 * Parses the evaluation response and returns structured result
 */
function parseEvaluationResult(
  evaluationText: string,
  state: GraphState,
): EvaluationResult {
  const selectedMatch = evaluationText.match(/SELECTED:\s*([ABC])/);
  const reasoningMatch = evaluationText.match(
    /REASONING:\s*(.*?)(?=WINNING_RESPONSE:|$)/s,
  );
  const winningResponseMatch = evaluationText.match(
    /WINNING_RESPONSE:\s*(.*?)$/s,
  );

  if (!selectedMatch || !reasoningMatch || !winningResponseMatch) {
    // Fallback to GPT-4 response if parsing fails
    return {
      selectedAgent: "GPT-4 (Fallback)",
      finalResponse: state.gpt4Response,
      reasoning: "Evaluation parsing failed, defaulted to GPT-4 response",
    };
  }

  const selection = selectedMatch[1];
  const reasoning = reasoningMatch[1]?.trim() || "No reasoning provided";

  console.log(
    `Evaluation Results:
    - GPT-4 Response (A): ${state.gpt4Response}
    - GPT-o3-mini Response (B): ${state.gpto3Mini}
    - GPT-4o-Mini Response (C): ${state.gpt4MiniResponse}
    - Selected: ${selection}
    - Reasoning: ${reasoning}
  `,
  );

  switch (selection) {
    case "A":
      return {
        selectedAgent: "GPT-4",
        finalResponse: state.gpt4Response,
        reasoning,
      };
    case "B":
      return {
        selectedAgent: "GPT-o3-mini",
        finalResponse: state.gpto3Mini,
        reasoning,
      };
    case "C":
      return {
        selectedAgent: "GPT-4o-Mini",
        finalResponse: state.gpt4MiniResponse,
        reasoning,
      };
    default:
      return {
        selectedAgent: "GPT-4 (Fallback)",
        finalResponse: state.gpt4Response,
        reasoning: "Unknown selection, defaulted to GPT-4 response",
      };
  }
}

async function aggregatorAgent(
  state: GraphState,
): Promise<Partial<GraphState>> {
  try {
    console.log("Aggregator Agent: Evaluating responses from all models...");

    const evaluatorModel = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.2,
    });

    const evaluationPrompt = createEvaluationPrompt(state);

    const evaluation = await evaluatorModel.invoke([
      new SystemMessage(
        "You are a precise AI response evaluator. Analyze the responses objectively and select the best one based on quality, relevance, and helpfulness.",
      ),
      new HumanMessage(evaluationPrompt),
    ]);

    const evaluationResult = parseEvaluationResult(
      evaluation.content as string,
      state,
    );

    return {
      finalResponse: evaluationResult.finalResponse,
      selectedAgent: evaluationResult.selectedAgent,
      reasoning: evaluationResult.reasoning,
    };
  } catch (error) {
    console.error("Aggregator Agent error:", error);
    return {
      finalResponse: state.gpt4Response || "All agents failed to respond",
      selectedAgent: "Error - GPT-4 Fallback",
      reasoning: "Aggregator evaluation failed, using GPT-4 as fallback",
    };
  }
}

function createSuccessResponse(message: string, result: GraphState) {
  return NextResponse.json({
    success: true,
    data: {
      message,
      response: result.finalResponse,
      selectedAgent: result.selectedAgent,
      reasoning: result.reasoning,
      processedBy:
        "LangGraph Fan-in/Fan-out Pattern (3 Different OpenAI Models)",
      allResponses: {
        gpt4: result.gpt4Response,
        gpt03Mini: result.gpto3Mini,
        gpt4Mini: result.gpt4MiniResponse,
      },
    },
    message:
      "AI response generated and evaluated using LangGraph model comparison",
  });
}

/**
 * Creates error response
 */
function createErrorResponse(
  message: string,
  status: number = 500,
  error?: string,
) {
  return NextResponse.json(
    {
      success: false,
      message,
      ...(error && { error }),
    },
    { status },
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message } = body;

    const app = new StateGraph(StateAnnotation)
      .addNode("gpt4Agent", gpt4Agent)
      .addNode("gpt03MiniAgent", gpto3MiniAgent)
      .addNode("gpt4MiniAgent", gpt4MiniAgent)
      .addNode("aggregator", aggregatorAgent)
      .addEdge(START, "gpt4Agent")
      .addEdge(START, "gpt03MiniAgent")
      .addEdge(START, "gpt4MiniAgent")
      .addEdge("gpt4Agent", "aggregator")
      .addEdge("gpt03MiniAgent", "aggregator")
      .addEdge("gpt4MiniAgent", "aggregator")

      // End the workflow
      .addEdge("aggregator", END)
      .compile();

    const result = await app.invoke({
      message,
      gpt4Response: "",
      gpto3Mini: "",
      gpt4MiniResponse: "",
      finalResponse: "",
      selectedAgent: "",
      reasoning: "",
    });

    return createSuccessResponse(message, result);
  } catch (error) {
    console.error("Error in AI chat endpoint:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return createErrorResponse(
      "Failed to process AI request",
      500,
      errorMessage,
    );
  }
}
