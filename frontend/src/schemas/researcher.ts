import { z } from "zod";

export const searchSchema = z.object({
  query: z.string().min(1, "Query is required").max(500),
  max_results: z.coerce.number().int().min(1).max(20).default(5),
});

export type SearchSchema = z.infer<typeof searchSchema>;
