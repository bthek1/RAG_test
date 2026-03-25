import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/store/chat";
import { ModelSelector } from "./ModelSelector";
import { Button } from "@/components/ui/button";

export function ConversationSidebar() {
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeId);
  const selectedModel = useChatStore((s) => s.selectedModel);
  const newConversation = useChatStore((s) => s.newConversation);
  const setActive = useChatStore((s) => s.setActive);
  const deleteConversation = useChatStore((s) => s.deleteConversation);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-muted/40">
      <div className="flex flex-col gap-3 p-3 border-b">
        <Button
          className="w-full justify-start gap-2"
          variant="outline"
          onClick={() => newConversation(selectedModel)}
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
        <ModelSelector />
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            No conversations yet
          </p>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={cn(
              "group flex items-center justify-between rounded-md px-3 py-2 text-sm cursor-pointer hover:bg-muted",
              activeId === conv.id && "bg-muted font-medium",
            )}
            onClick={() => setActive(conv.id)}
          >
            <span className="flex-1 truncate">{conv.title}</span>
            <button
              className="ml-1 hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
              aria-label="Delete conversation"
              onClick={(e) => {
                e.stopPropagation();
                deleteConversation(conv.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </nav>
    </aside>
  );
}
