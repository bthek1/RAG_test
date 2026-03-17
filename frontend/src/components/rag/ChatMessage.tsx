import { Accordion } from "@/components/ui/accordion";
import { TypingIndicator } from "./TypingIndicator";
import { SourceCitation } from "./SourceCitation";
import type { RAGSource } from "@/types/embeddings";
import { cn } from "@/lib/utils";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: RAGSource[];
  isLoading?: boolean;
}

interface ChatMessageProps {
  message: ChatMessageData;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {isUser ? "You" : "🤖"}
      </div>

      {/* Bubble */}
      <div
        className={cn("flex max-w-[80%] flex-col gap-2", isUser && "items-end")}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm",
            isUser
              ? "rounded-tr-sm bg-primary text-primary-foreground"
              : "rounded-tl-sm bg-muted text-foreground",
          )}
        >
          {message.isLoading ? (
            <TypingIndicator />
          ) : (
            <p className="whitespace-pre-wrap leading-relaxed">
              {message.content}
            </p>
          )}
        </div>

        {/* Sources */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="w-full max-w-lg">
            <p className="mb-1 text-xs text-muted-foreground">
              📎 Sources ({message.sources.length} chunk
              {message.sources.length !== 1 ? "s" : ""} used):
            </p>
            <Accordion type="multiple" className="space-y-1">
              {message.sources.map((src, i) => (
                <SourceCitation key={src.chunk_id} source={src} index={i} />
              ))}
            </Accordion>
            <details className="mt-2">
              <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                Why am I seeing these results?
              </summary>
              <p className="mt-1 text-[10px] text-muted-foreground">
                These chunks had the lowest cosine distance to your query
                embedding in the HNSW vector index — meaning they are
                semantically closest to what you asked.
              </p>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
