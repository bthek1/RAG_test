import { createFileRoute } from "@tanstack/react-router";
import { ChatLayout } from "@/components/chat/ChatLayout";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
});

function ChatPage() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <ChatLayout />
    </div>
  );
}
