import { describe, expect, it } from "vitest";
import {
  ingestDocumentSchema,
  ingestFileSchema,
  ingestTextSchema,
  ragQuerySchema,
  searchQuerySchema,
} from "./embeddings";

describe('ingestTextSchema (mode: "text")', () => {
  it("accepts valid text mode input", () => {
    const result = ingestTextSchema.safeParse({
      mode: "text",
      title: "My Doc",
      content: "Some content here",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional source", () => {
    const result = ingestTextSchema.safeParse({
      mode: "text",
      title: "My Doc",
      content: "Some content here",
      source: "https://example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = ingestTextSchema.safeParse({
      mode: "text",
      title: "",
      content: "content",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty content", () => {
    const result = ingestTextSchema.safeParse({
      mode: "text",
      title: "Title",
      content: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects title over 512 chars", () => {
    const result = ingestTextSchema.safeParse({
      mode: "text",
      title: "a".repeat(513),
      content: "content",
    });
    expect(result.success).toBe(false);
  });
});

describe('ingestFileSchema (mode: "file")', () => {
  it("accepts a single File in an array", () => {
    const file = new File(["data"], "report.pdf", { type: "application/pdf" });
    const result = ingestFileSchema.safeParse({
      mode: "file",
      title: "PDF Doc",
      file: [file],
    });
    expect(result.success).toBe(true);
  });

  it("accepts multiple Files in the array", () => {
    const files = [
      new File(["a"], "a.pdf"),
      new File(["b"], "b.docx"),
      new File(["c"], "c.csv"),
    ];
    const result = ingestFileSchema.safeParse({
      mode: "file",
      title: "Batch",
      file: files,
    });
    expect(result.success).toBe(true);
  });

  it("accepts omitted title (title is optional in file mode)", () => {
    const file = new File(["data"], "report.pdf");
    const result = ingestFileSchema.safeParse({
      mode: "file",
      file: [file],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty string title (treated as absent)", () => {
    const file = new File(["data"], "report.pdf");
    const result = ingestFileSchema.safeParse({
      mode: "file",
      title: "",
      file: [file],
    });
    // empty string passes max(512) with no min constraint in file mode
    expect(result.success).toBe(true);
  });

  it("rejects title over 512 chars", () => {
    const file = new File(["data"], "report.pdf");
    const result = ingestFileSchema.safeParse({
      mode: "file",
      title: "a".repeat(513),
      file: [file],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty file array", () => {
    const result = ingestFileSchema.safeParse({
      mode: "file",
      title: "Doc",
      file: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing file field", () => {
    const result = ingestFileSchema.safeParse({
      mode: "file",
      title: "PDF Doc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a bare File (not wrapped in array)", () => {
    const file = new File(["data"], "report.pdf");
    const result = ingestFileSchema.safeParse({
      mode: "file",
      title: "PDF Doc",
      file,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an array containing a non-File value", () => {
    const result = ingestFileSchema.safeParse({
      mode: "file",
      title: "PDF Doc",
      file: ["not-a-file"],
    });
    expect(result.success).toBe(false);
  });
});

describe("ingestDocumentSchema (discriminated union)", () => {
  it("accepts text mode", () => {
    const result = ingestDocumentSchema.safeParse({
      mode: "text",
      title: "My Doc",
      content: "Some content",
    });
    expect(result.success).toBe(true);
  });

  it("accepts file mode with a File array", () => {
    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    const result = ingestDocumentSchema.safeParse({
      mode: "file",
      title: "PDF",
      file: [file],
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown mode", () => {
    const result = ingestDocumentSchema.safeParse({
      mode: "url",
      title: "Doc",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing mode", () => {
    const result = ingestDocumentSchema.safeParse({
      title: "Doc",
      content: "text",
    });
    expect(result.success).toBe(false);
  });
});

describe("searchQuerySchema", () => {
  it("accepts valid query", () => {
    const result = searchQuerySchema.safeParse({
      query: "what is RAG?",
      top_k: 5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects query shorter than 3 chars", () => {
    const result = searchQuerySchema.safeParse({ query: "ab", top_k: 5 });
    expect(result.success).toBe(false);
  });

  it("rejects top_k > 20", () => {
    const result = searchQuerySchema.safeParse({
      query: "valid query",
      top_k: 21,
    });
    expect(result.success).toBe(false);
  });

  it("rejects top_k < 1", () => {
    const result = searchQuerySchema.safeParse({
      query: "valid query",
      top_k: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("ragQuerySchema", () => {
  it("is the same shape as searchQuerySchema", () => {
    const result = ragQuerySchema.safeParse({
      query: "explain transformers",
      top_k: 3,
    });
    expect(result.success).toBe(true);
  });
});
