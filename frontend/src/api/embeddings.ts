import { apiClient } from "./client";
import type {
  Chunk,
  Document,
  DocumentListItem,
  IngestDocumentRequest,
  RAGRequest,
  RAGResponse,
  SimilaritySearchRequest,
} from "@/types/embeddings";

export async function listDocuments(): Promise<DocumentListItem[]> {
  const { data } = await apiClient.get<DocumentListItem[]>(
    "/api/embeddings/documents/",
  );
  return data;
}

export async function getDocument(id: string): Promise<Document> {
  const { data } = await apiClient.get<Document>(
    `/api/embeddings/documents/${id}/`,
  );
  return data;
}

export async function ingestDocument(
  payload: IngestDocumentRequest,
): Promise<Document> {
  if (payload.file) {
    const form = new FormData();
    form.append("title", payload.title);
    form.append("file", payload.file);
    if (payload.source) form.append("source", payload.source);
    const { data } = await apiClient.post<Document>(
      "/api/embeddings/documents/",
      form,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return data;
  }
  // Plain-text path — unchanged
  const { data } = await apiClient.post<Document>(
    "/api/embeddings/documents/",
    { title: payload.title, content: payload.content, source: payload.source },
  );
  return data;
}

export async function deleteDocument(id: string): Promise<void> {
  await apiClient.delete(`/api/embeddings/documents/${id}/`);
}

export async function searchSimilar(
  payload: SimilaritySearchRequest,
): Promise<Chunk[]> {
  const { data } = await apiClient.post<Chunk[]>(
    "/api/embeddings/search/",
    payload,
  );
  return data;
}

export async function ragQuery(payload: RAGRequest): Promise<RAGResponse> {
  const { data } = await apiClient.post<RAGResponse>(
    "/api/embeddings/rag/",
    payload,
  );
  return data;
}
