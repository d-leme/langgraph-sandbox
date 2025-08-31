"use client";

import { useState, useEffect, useRef } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import {
  Loader2,
  MessageSquare,
  Bot,
  User,
  Send,
  RotateCcw,
} from "lucide-react";
import { Textarea } from "~/components/ui/textarea";

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
  version?: number; // for rollback support
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

export interface ChatMessage {
  type: "user" | "ai";
  message: string;
  timestamp: Date;
  processedBy?: string;
  selectedAgent?: string;
  reasoning?: string;
}

export interface AiChatProps {
  /** The mutation hook for sending messages - provided by the parent component */
  mutation: UseMutationResult<ApiResponse<AiChatResponse>, Error, AiChatInput>;
  /** Title for the chat interface */
  title?: string;
  /** Description for the empty state */
  description?: string;
  /** Footer text */
  footerText?: string;
  /** Additional CSS classes for the container */
  className?: string;
  /** Initial chat history */
  initialHistory?: ChatMessage[];
  /** Callback when a message is sent */
  onMessageSent?: (message: string) => void;
  /** Callback when a response is received */
  onResponseReceived?: (response: AiChatResponse) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Enable file upload */
  enableFileUpload?: boolean;
  /** Callback when a file is uploaded */
  onFileUploaded?: (fileInfo: any) => void;
}

// Rollback support additions
import { v4 as uuidv4 } from "uuid";

export function AiChat({
  mutation,
  title = "AI Chat",
  description = "Start a conversation with our AI assistant. Ask questions, get help, or just chat!",
  footerText = "AI responses are generated using advanced AI models",
  className = "",
  initialHistory = [],
  onMessageSent,
  onResponseReceived,
  onError,
  enableFileUpload = false,
  onFileUploaded,
}: AiChatProps) {
  // --- Rollback state ---
  const [threadId, setThreadId] = useState<string>(() => uuidv4());
  const [version, setVersion] = useState<number>(0);
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(initialHistory);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<any>(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [rollbackError, setRollbackError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File upload handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUploadedFile(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload-file", {
        method: "POST",
        body: formData,
      });
      const result = await res.json();
      if (!result.success) {
        setUploadError(result.message || "Upload failed");
      } else {
        setUploadedFile(result.data);
        onFileUploaded?.(result.data);
      }
    } catch (err: any) {
      setUploadError(err?.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // --- Send message with threadId ---
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;

    // Add user message to history
    const userMessage: ChatMessage = {
      type: "user",
      message: chatMessage,
      timestamp: new Date(),
    };
    setChatHistory((prev) => [...prev, userMessage]);

    const currentMessage = chatMessage;
    setChatMessage("");

    // Call onMessageSent callback
    onMessageSent?.(currentMessage);

    try {
      const result = await mutation.mutateAsync({
        message: currentMessage,
        threadId,
      } as any); // allow threadId

      // Add AI response to history
      const aiMessage: ChatMessage = {
        type: "ai",
        message: result.data.response,
        timestamp: new Date(),
        processedBy: result.data.processedBy,
        selectedAgent: result.data.selectedAgent,
        reasoning: result.data.reasoning,
      };
      setChatHistory((prev) => [...prev, aiMessage]);
      setVersion(result.data.version || version + 1);

      // Call onResponseReceived callback
      onResponseReceived?.(result.data);
    } catch (error) {
      console.error("Failed to send message:", error);
      const errorMessage: ChatMessage = {
        type: "ai",
        message: "Sorry, I encountered an error while processing your message.",
        timestamp: new Date(),
      };
      setChatHistory((prev) => [...prev, errorMessage]);

      // Call onError callback
      onError?.(error as Error);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      await handleSendMessage(e);
    }
  };

  // --- Rollback handler ---
  const handleRollback = async (rollbackVersion: number) => {
    setRollbackLoading(true);
    setRollbackError(null);
    try {
      const res = await fetch("/api/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, version: rollbackVersion }),
      });
      const result = await res.json();
      if (!result.success) {
        setRollbackError(result.message || "Rollback failed");
        return;
      }
      // Convert restoredState to ChatMessage[]
      const restored: ChatMessage[] = (result.data.restoredState || []).map(
        (msg: any) => ({
          type: msg.role === "user" ? "user" : "ai",
          message: msg.content,
          timestamp: new Date(),
        }),
      );
      setChatHistory(restored);
      setVersion(result.data.rolledBackToVersion);
    } catch (err: any) {
      setRollbackError(err?.message || "Rollback failed");
    } finally {
      setRollbackLoading(false);
    }
  };

  // --- UI ---
  return (
    <TooltipProvider>
      <div
        className={`bg-background -m-6 flex h-[calc(100vh-theme(spacing.12))] flex-col overflow-hidden ${className}`}
      >
        {/* Rollback controls */}
        <div className="flex items-center gap-2 px-4 pt-4">
          <span className="text-muted-foreground text-xs">
            Thread ID: {threadId.slice(0, 8)}... | Version: {version}
          </span>
          {rollbackError && (
            <span className="text-xs text-red-500">{rollbackError}</span>
          )}
        </div>
        {/* Chat Messages */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="mx-auto min-h-full max-w-3xl px-4 py-6">
              {chatHistory.length === 0 ? (
                <div className="flex min-h-full items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-600">
                      <MessageSquare className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold">
                      Welcome to {title}
                    </h3>
                    <p className="text-muted-foreground">{description}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 pb-4">
                  {chatHistory.map((entry, index) => {
                    const isAi = entry.type === "ai";
                    // Version: AI messages are at even indexes (user, ai, user, ai...)
                    // But user may have sent multiple messages in a row, so we need to count ai messages up to this point
                    const aiVersion = chatHistory
                      .slice(0, index + 1)
                      .filter((m) => m.type === "ai").length;
                    return (
                      <div
                        key={index}
                        className={`flex gap-3 ${
                          entry.type === "user"
                            ? "justify-end"
                            : "justify-start"
                        } items-center`}
                      >
                        {isAi && (
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-600 text-white">
                              <Bot className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                        )}

                        <div
                          className={`group max-w-[80%] space-y-1 ${
                            entry.type === "user" ? "text-right" : "text-left"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {entry.type === "user" ? (
                              <>
                                <span className="text-sm font-medium">You</span>
                              </>
                            ) : (
                              <>
                                <span className="text-sm font-medium">
                                  AI Assistant
                                </span>
                                {entry.selectedAgent && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge
                                        variant="secondary"
                                        className="cursor-help text-xs"
                                      >
                                        {entry.selectedAgent}
                                      </Badge>
                                    </TooltipTrigger>
                                    {entry.reasoning && (
                                      <TooltipContent className="max-w-xs">
                                        <p className="text-sm">
                                          {entry.reasoning}
                                        </p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                )}
                                {entry.processedBy && !entry.selectedAgent && (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    {entry.processedBy}
                                  </Badge>
                                )}
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <div
                              className={`rounded-2xl px-4 py-3 ${
                                entry.type === "user"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              }`}
                            >
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                {entry.message}
                              </p>
                            </div>
                            {/* Rollback button for AI messages */}
                            {isAi && aiVersion < version && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="border-muted-foreground/20 hover:bg-accent hover:text-accent-foreground ml-1 border transition-colors"
                                    disabled={rollbackLoading}
                                    onClick={() => handleRollback(aiVersion)}
                                    aria-label={`Rollback to version ${aiVersion}`}
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  Rollback to this answer (version {aiVersion})
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>

                          <p className="text-muted-foreground text-xs opacity-0 transition-opacity group-hover:opacity-100">
                            {entry.timestamp.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>

                        {entry.type === "user" && (
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              <User className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    );
                  })}

                  {/* Loading indicator */}
                  {mutation.isPending && (
                    <div className="flex justify-start gap-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-600 text-white">
                          <Bot className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="max-w-[80%] space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            AI Assistant
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            Processing...
                          </Badge>
                        </div>
                        <div className="bg-muted rounded-2xl px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-muted-foreground text-sm">
                              Thinking...
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="bg-background/95 supports-[backdrop-filter]:bg-background/60 shrink-0 border-t backdrop-blur">
          <div className="mx-auto max-w-3xl p-4">
            {/* File upload (optional) */}
            {enableFileUpload && (
              <div className="mb-3 flex items-center gap-2">
                <label
                  htmlFor="file-upload"
                  className="text-muted-foreground hover:bg-muted cursor-pointer rounded-md border px-3 py-1 text-sm transition"
                >
                  {uploading ? "Uploading..." : "Upload file"}
                </label>
                <input
                  id="file-upload"
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  disabled={uploading}
                  aria-label="Upload file"
                />
                {uploading && (
                  <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                )}
                {uploadedFile && (
                  <Badge variant="secondary" className="text-xs">
                    Uploaded: {uploadedFile.originalName}
                  </Badge>
                )}
                {uploadError && (
                  <span className="text-xs text-red-500">{uploadError}</span>
                )}
              </div>
            )}
            <form onSubmit={handleSendMessage} className="flex gap-3">
              <div className="flex-1">
                <Textarea
                  ref={textareaRef}
                  placeholder="Type your message... (Press Enter to send, Shift+Enter for new line)"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="focus:border-primary max-h-32 min-h-[44px] resize-none rounded-2xl border-2 px-4 py-3"
                  rows={1}
                />
              </div>
              <Button
                type="submit"
                size="sm"
                className="h-11 w-11 shrink-0 rounded-full p-0"
                disabled={mutation.isPending || !chatMessage.trim()}
              >
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
            <p className="text-muted-foreground mt-2 text-center text-xs">
              {footerText}
            </p>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
