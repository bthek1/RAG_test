import { useState } from "react";
import { useChatStore } from "@/store/chat";
import { useStreamingChat } from "@/hooks/useOllamaChat";
import { ConversationSidebar } from "./ConversationSidebar";
import { MessageThread } from "./MessageThread";
import { ChatInput } from "./ChatInput";
import type { ChatMessage } from "@/types/chat";

export function ChatLayout() {
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeId);
  const selectedModel = useChatStore((s) => s.selectedModel);
  const newConversation = useChatStore((s) => s.newConversation);

  const [isStreaming, setIsStreaming] = useState(false);
  const { send } = useStreamingChat();

  const activeConv = conversations.find((c) => c.id === activeId);

  const handleSend = async (text: string) => {
    let convId = activeId;
    if (!convId) {
      convId = newConversation(selectedModel);
    }

    const userMsg: ChatMessage = { role: "user", content: text };
    const messages: ChatMessage[] = [...(activeConv?.messages ?? []), userMsg];

    setIsStreaming(true);
    try {
      await send(convId, messages, selectedModel);
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      <ConversationSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {activeConv ? (
          <>
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <h2 className="flex-1 truncate text-sm font-medium">
                {activeConv.title}
              </h2>
              <span className="text-xs text-muted-foreground">
                {activeConv.model}
              </span>
            </div>
            <MessageThread
              messages={activeConv.messages}
              isStreaming={isStreaming}
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
            <p className="text-lg font-medium text-foreground">Ollama Chat</p>
            <p className="text-sm">
              Start a new conversation or select one from the sidebar.
            </p>
          </div>
        )}
        <ChatInput onSend={handleSend} disabled={isStreaming} />
      </div>
    </div>
  );
}
