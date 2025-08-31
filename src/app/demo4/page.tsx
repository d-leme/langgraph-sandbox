"use client";
import { AiChat } from "~/components/ai-chat";
import { useAiChat } from "~/hooks/use-ai-chat";

export default function Demo4Page() {
  const mutation = useAiChat("/api/rollback-chat");

  return (
    <AiChat
      mutation={mutation}
      title="LangGraph AI Chat"
      description="Start a conversation with our AI assistant. Ask questions, get help, or just chat!"
      footerText="AI responses are generated using LangGraph and OpenAI"
      onMessageSent={(message) => {
        console.log("Message sent:", message);
      }}
      onResponseReceived={(response) => {
        console.log("Response received:", response);
      }}
      onError={(error) => {
        console.error("Chat error:", error);
      }}
    />
  );
}
