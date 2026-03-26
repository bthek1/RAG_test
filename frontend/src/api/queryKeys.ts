export const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
    register: ["auth", "register"] as const,
  },
  health: ["health"] as const,
  gpuStatus: ["gpu-status"] as const,
  embeddings: {
    documents: {
      all: ["embeddings", "documents"] as const,
      detail: (id: string) => ["embeddings", "documents", id] as const,
      chunks: (id: string) =>
        ["embeddings", "documents", id, "chunks"] as const,
    },
  },
  tasks: {
    detail: (id: string) => ["tasks", id] as const,
  },
  chat: {
    models: ["chat", "models"] as const,
    status: ["chat", "status"] as const,
  },
  researcher: {
    search: (query: string) => ["researcher", "search", query] as const,
  },
} as const;
