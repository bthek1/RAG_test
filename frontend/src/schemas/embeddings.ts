import { z } from "zod";

const _baseIngestSchema = z.object({
  title: z.string().min(1, "Title is required").max(512),
  source: z.string().optional(),
});

export const ingestTextSchema = _baseIngestSchema.extend({
  mode: z.literal("text"),
  content: z.string().min(1, "Content is required"),
});

export const ingestFileSchema = _baseIngestSchema.extend({
  mode: z.literal("file"),
  file: z.instanceof(File, { message: "A PDF file is required" }),
});

export const ingestDocumentSchema = z.discriminatedUnion("mode", [
  ingestTextSchema,
  ingestFileSchema,
]);

export type IngestDocumentFormData = z.infer<typeof ingestDocumentSchema>;

// Keep legacy alias so any existing imports don’t break
export type IngestDocumentSchema = IngestDocumentFormData;

export const searchQuerySchema = z.object({
  query: z.string().min(3, "Query must be at least 3 characters"),
  top_k: z.number().int().min(1).max(20),
});

export type SearchQuerySchema = z.infer<typeof searchQuerySchema>;

export const ragQuerySchema = searchQuerySchema;

export type RAGQuerySchema = z.infer<typeof ragQuerySchema>;
