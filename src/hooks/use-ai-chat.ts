import { useMutation } from "@tanstack/react-query";

// Types
export interface AiChatInput {
  message: string;
}

export interface AiChatResponse {
  message: string;
  response: string;
  processedBy?: string;
  selectedAgent?: string;
  reasoning?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

// Generic API function for any AI chat endpoint
const createAiChatFunction =
  (endpoint: string) =>
  async (input: AiChatInput): Promise<ApiResponse<AiChatResponse>> => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error("Failed to send message to AI");
    }
    const data = await response.json();
    return data as ApiResponse<AiChatResponse>;
  };

// Custom hook for AI chat with configurable endpoint
export const useAiChat = (endpoint: string) => {
  return useMutation({
    mutationFn: createAiChatFunction(endpoint),
  });
};

// Legacy hook for backward compatibility (demo1)
export const useAiChatLegacy = () => {
  return useAiChat("/api/ai-chat");
};
