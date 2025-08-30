import { NextResponse } from "next/server";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// Define the state schema using Annotation
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

// Agent 1: GPT-4 Agent (Most capable, creative responses)
async function gpt4Agent(state: GraphState): Promise<Partial<GraphState>> {
  try {
    console.log("GPT-4 Agent: Processing with GPT-4...");

    const model = new ChatOpenAI({
      modelName: "gpt-4",
      temperature: 0.8,
    });

    const response = await model.invoke([
      new SystemMessage(
        "You are a creative and comprehensive AI assistant powered by GPT-4. Provide detailed, thoughtful responses with rich context and creative insights. Focus on depth and nuanced understanding.",
      ),
      new HumanMessage(state.message),
    ]);

    return { gpt4Response: response.content as string };
  } catch (error) {
    console.error("GPT-4 Agent error:", error);
    return {
      gpt4Response: "GPT-4 Agent encountered an error processing your request.",
    };
  }
}

// Agent 2: GPT-o3-mini Agent (Fast and reliable, balanced responses)
async function gpto3MiniAgent(state: GraphState): Promise<Partial<GraphState>> {
  try {
    console.log("GPT-o3-mini Agent: Processing with GPT-o3-mini...");

    const model = new ChatOpenAI({
      model: "o3-mini",
    });

    const response = await model.invoke([
      new SystemMessage(
        "You are an efficient and balanced AI assistant powered by GPT-o3-mini. Provide clear, well-structured responses that are concise yet informative. Focus on practical and actionable insights.",
      ),
      new HumanMessage(state.message),
    ]);

    return { gpto3Mini: response.content as string };
  } catch (error) {
    console.error("GPT-o3-mini Agent error:", error);
    return {
      gpto3Mini:
        "GPT-o3-mini Agent encountered an error processing your request.",
    };
  }
}

// Agent 3: GPT-4o-Mini Agent (Fast, concise responses)
async function gpt4MiniAgent(state: GraphState): Promise<Partial<GraphState>> {
  try {
    console.log("GPT-4o-Mini Agent: Processing with GPT-4o-Mini...");

    const model = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.4,
    });

    const response = await model.invoke([
      new SystemMessage(
        "You are a fast and precise AI assistant powered by GPT-4o-Mini. Provide quick, accurate, and concise responses. Focus on efficiency and direct answers while maintaining helpfulness.",
      ),
      new HumanMessage(state.message),
    ]);

    return { gpt4MiniResponse: response.content as string };
  } catch (error) {
    console.error("GPT-4o-Mini Agent error:", error);
    return {
      gpt4MiniResponse:
        "GPT-4o-Mini Agent encountered an error processing your request.",
    };
  }
}

// Aggregator Agent: Evaluates all responses and selects the best one
async function aggregatorAgent(
  state: GraphState,
): Promise<Partial<GraphState>> {
  try {
    console.log("Aggregator Agent: Evaluating responses from all models...");

    // Initialize the evaluator model (using GPT-4 for evaluation)
    const evaluatorModel = new ChatOpenAI({
      modelName: "gpt-4o-mini",
      temperature: 0.2, // Low temperature for consistent evaluation
    });

    // Create evaluation context
    const evaluationPrompt = `
You are an expert AI response evaluator. You need to analyze three different responses to the same user query and determine which one is the best.

User Query: "${state.message}"

Response A (GPT-4): ${state.gpt4Response}

Response B (GPT-o3-mini): ${state.gpto3Mini}

Response C (GPT-4o-Mini): ${state.gpt4MiniResponse}

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

    const evaluation = await evaluatorModel.invoke([
      new SystemMessage(
        "You are a precise AI response evaluator. Analyze the responses objectively and select the best one based on quality, relevance, and helpfulness.",
      ),
      new HumanMessage(evaluationPrompt),
    ]);

    const evaluationText = evaluation.content as string;

    // Parse the evaluation result
    const selectedMatch = evaluationText.match(/SELECTED:\s*([ABC])/);
    const reasoningMatch = evaluationText.match(
      /REASONING:\s*(.*?)(?=WINNING_RESPONSE:|$)/s,
    );
    const winningResponseMatch = evaluationText.match(
      /WINNING_RESPONSE:\s*(.*?)$/s,
    );

    let selectedAgent = "Unknown";
    let finalResponse = "";
    let reasoning = "Evaluation failed";

    if (selectedMatch && reasoningMatch && winningResponseMatch) {
      const selection = selectedMatch[1];
      reasoning = reasoningMatch[1]?.trim() || "No reasoning provided";
      finalResponse = winningResponseMatch[1]?.trim() || "No response found";

      switch (selection) {
        case "A":
          selectedAgent = "GPT-4";
          finalResponse = state.gpt4Response;
          break;
        case "B":
          selectedAgent = "GPT-o3-mini";
          finalResponse = state.gpto3Mini;
          break;
        case "C":
          selectedAgent = "GPT-4o-Mini";
          finalResponse = state.gpt4MiniResponse;
          break;
      }
    } else {
      // Fallback: use GPT-4 response if evaluation fails
      selectedAgent = "GPT-4 (Fallback)";
      finalResponse = state.gpt4Response;
      reasoning = "Evaluation parsing failed, defaulted to GPT-4 response";
    }

    return {
      finalResponse,
      selectedAgent,
      reasoning,
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json(
        {
          success: false,
          message: "Message is required",
        },
        { status: 400 },
      );
    }

    // Create a LangGraph workflow with fan-in/fan-out pattern for model comparison
    const workflow = new StateGraph(StateAnnotation)
      // Add the three parallel agents with different models
      .addNode("gpt4Agent", gpt4Agent)
      .addNode("gpt03MiniAgent", gpto3MiniAgent)
      .addNode("gpt4MiniAgent", gpt4MiniAgent)
      // Add the aggregator agent that evaluates and selects the best response
      .addNode("aggregator", aggregatorAgent)

      // Fan-out: START connects to all three model agents in parallel
      .addEdge(START, "gpt4Agent")
      .addEdge(START, "gpt03MiniAgent")
      .addEdge(START, "gpt4MiniAgent")

      // Fan-in: All three agents connect to the aggregator
      .addEdge("gpt4Agent", "aggregator")
      .addEdge("gpt03MiniAgent", "aggregator")
      .addEdge("gpt4MiniAgent", "aggregator")

      // End the workflow
      .addEdge("aggregator", END);

    // Compile the graph
    const app = workflow.compile();

    // Run the workflow
    const result = await app.invoke({
      message: message,
      gpt4Response: "",
      gpto3Mini: "",
      gpt4MiniResponse: "",
      finalResponse: "",
      selectedAgent: "",
      reasoning: "",
    });

    return NextResponse.json({
      success: true,
      data: {
        message: message,
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
  } catch (error) {
    console.error("Error in AI chat endpoint:", error);
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
