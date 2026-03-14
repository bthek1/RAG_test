export const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
    register: ["auth", "register"] as const,
  },
  health: ["health"] as const,
} as const;
