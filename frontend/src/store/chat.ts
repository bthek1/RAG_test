import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { ChatMessage } from "@/types/chat";

export interface ChatConversation {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  createdAt: string;
}

interface ChatState {
  conversations: ChatConversation[];
  activeId: string | null;
  selectedModel: string;
  newConversation: (model: string) => string;
  setActive: (id: string) => void;
  addMessage: (conversationId: string, msg: ChatMessage) => void;
  appendToken: (conversationId: string, token: string) => void;
  deleteConversation: (id: string) => void;
  setModel: (model: string) => void;
}

export const useChatStore = create<ChatState>()(
  immer((set) => ({
    conversations: [],
    activeId: null,
    selectedModel: "analysis-assistant",

    newConversation: (model: string) => {
      const id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
            });
      set((s) => {
        s.conversations.unshift({
          id,
          title: "New conversation",
          model,
          messages: [],
          createdAt: new Date().toISOString(),
        });
        s.activeId = id;
      });
      return id;
    },

    setActive: (id: string) =>
      set((s) => {
        s.activeId = id;
      }),

    addMessage: (conversationId: string, msg: ChatMessage) =>
      set((s) => {
        const conv = s.conversations.find((c) => c.id === conversationId);
        if (!conv) return;
        // Update title from first user message
        if (msg.role === "user" && conv.messages.length === 0) {
          conv.title = msg.content.slice(0, 50);
        }
        conv.messages.push(msg);
      }),

    appendToken: (conversationId: string, token: string) =>
      set((s) => {
        const conv = s.conversations.find((c) => c.id === conversationId);
        if (!conv) return;
        const last = conv.messages[conv.messages.length - 1];
        if (last && last.role === "assistant") {
          last.content += token;
        } else {
          conv.messages.push({ role: "assistant", content: token });
        }
      }),

    deleteConversation: (id: string) =>
      set((s) => {
        s.conversations = s.conversations.filter((c) => c.id !== id);
        if (s.activeId === id) {
          s.activeId = s.conversations[0]?.id ?? null;
        }
      }),

    setModel: (model: string) =>
      set((s) => {
        s.selectedModel = model;
      }),
  })),
);
