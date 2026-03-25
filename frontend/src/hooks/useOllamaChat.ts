import { useMutation, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/api/queryKeys";
import { listModels, sendChat } from "@/api/chat";
import { useChatStore } from "@/store/chat";
import type { ChatMessage } from "@/types/chat";

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL;

export function useModels() {
  return useQuery({
    queryKey: queryKeys.chat.models,
    queryFn: listModels,
    staleTime: 60_000,
  });
}

export function useSendChat() {
  return useMutation({
    mutationFn: sendChat,
  });
}

export function useStreamingChat() {
  const addMessage = useChatStore((s) => s.addMessage);
  const appendToken = useChatStore((s) => s.appendToken);

  const send = async (
    conversationId: string,
    messages: ChatMessage[],
    model?: string,
  ) => {
    addMessage(conversationId, messages[messages.length - 1]);

    // Seed an empty assistant message so appendToken can extend it
    addMessage(conversationId, { role: "assistant", content: "" });

    const token = localStorage.getItem("access_token");
    const response = await fetch(`${BASE_URL}/api/chat/stream/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ messages, model }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Stream request failed: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const parsed = JSON.parse(payload) as { token: string };
          if (parsed.token) {
            appendToken(conversationId, parsed.token);
          }
        } catch {
          // skip malformed lines
        }
      }
    }
  };

  return { send };
}
