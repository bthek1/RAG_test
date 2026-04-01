import { z } from "zod";

export const searchSchema = z.object({
  query: z.string().min(1, "Query is required").max(500),
  max_results: z.coerce.number().int().min(1).max(20).default(5).catch(5),
  type: z.enum(["web", "news", "video", "image", "all"]).default("all"),
  sort: z.enum(["relevance", "date", "popularity"]).default("relevance"),
});

export type SearchSchema = z.infer<typeof searchSchema>;
