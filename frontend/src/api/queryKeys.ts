export const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
    register: ["auth", "register"] as const,
  },
  health: ["health"] as const,
  embeddings: {
    documents: {
      all: ["embeddings", "documents"] as const,
      detail: (id: string) => ["embeddings", "documents", id] as const,
    },
  },
} as const;
