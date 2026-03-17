import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Send, Settings2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  ChatMessage,
  type ChatMessageData,
} from "@/components/rag/ChatMessage";
import { useRAGQuery } from "@/hooks/useRAG";
import { z } from "zod";

export const Route = createFileRoute("/rag/chat")({
  component: ChatPage,
});

const chatInputSchema = z.object({
  query: z.string().min(1),
});

type ChatInput = z.infer<typeof chatInputSchema>;

function ChatPage() {
  const ragQuery = useRAGQuery();
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [topK, setTopK] = useState(5);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const form = useForm<ChatInput>({
    resolver: zodResolver(chatInputSchema),
    defaultValues: { query: "" },
  });

  function scrollToBottom() {
    setTimeout(() => {
      if (scrollAreaRef.current) {
        const el = scrollAreaRef.current.querySelector(
          "[data-radix-scroll-area-viewport]",
        );
        if (el) el.scrollTop = el.scrollHeight;
      }
    }, 50);
  }

  function onSubmit(values: ChatInput) {
    setLastError(null);
    const userMsg: ChatMessageData = {
      id: crypto.randomUUID(),
      role: "user",
      content: values.query,
    };
    const loadingMsg: ChatMessageData = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    form.reset();
    scrollToBottom();

    ragQuery.mutate(
      { query: values.query, top_k: topK },
      {
        onSuccess: (data) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.isLoading
                ? {
                    ...m,
                    isLoading: false,
                    content: data.answer,
                    sources: data.sources,
                  }
                : m,
            ),
          );
          scrollToBottom();
        },
        onError: () => {
          setMessages((prev) => prev.filter((m) => !m.isLoading));
          setLastError("Failed to get a response. Please try again.");
        },
      },
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold">RAG Chat</h1>
          <p className="text-xs text-muted-foreground">
            Ask questions — Claude answers using your documents as context
          </p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Settings2 className="h-3.5 w-3.5" />
              Top-k: {topK}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 space-y-3 p-4">
            <p className="text-xs font-semibold">Chunks to retrieve</p>
            <Slider
              min={1}
              max={20}
              step={1}
              value={[topK]}
              onValueChange={([v]) => setTopK(v)}
            />
            <p className="text-[10px] text-muted-foreground">
              More chunks = more context for Claude, but slower and higher token
              cost.
            </p>
          </PopoverContent>
        </Popover>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollAreaRef}>
        <div className="space-y-6 p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-sm text-muted-foreground">
              <p className="text-2xl mb-2">💬</p>
              <p className="font-medium">Ask something about your documents</p>
              <p className="mt-1 text-xs max-w-sm">
                Claude will retrieve the most relevant chunks from your document
                store and generate a grounded answer with citations.
              </p>
            </div>
          ) : (
            messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
          )}
        </div>
      </ScrollArea>

      {/* Error */}
      {lastError && (
        <div className="px-4">
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-xs">{lastError}</AlertDescription>
          </Alert>
        </div>
      )}

      {/* Input */}
      <Separator />
      <div className="p-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-2">
            <FormField
              control={form.control}
              name="query"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormControl>
                    <Input
                      placeholder="Ask something about your documents…"
                      autoComplete="off"
                      disabled={ragQuery.isPending}
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button type="submit" size="icon" disabled={ragQuery.isPending}>
              {ragQuery.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
