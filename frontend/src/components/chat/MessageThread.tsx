import { useEffect, useRef } from "react";
import { ChatBubble } from "./ChatBubble";
import type { ChatMessage } from "@/types/chat";

interface MessageThreadProps {
  messages: ChatMessage[];
  isStreaming?: boolean;
}

export function MessageThread({
  messages,
  isStreaming = false,
}: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <p className="text-sm">Send a message to start the conversation.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      {messages.map((msg, idx) => {
        const isLastMessage = idx === messages.length - 1;
        return (
          <ChatBubble
            key={idx}
            message={msg}
            isStreaming={
              isStreaming && isLastMessage && msg.role === "assistant"
            }
          />
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
