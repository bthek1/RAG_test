export interface Document {
  id: string;
  title: string;
  source: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  chunk_count: number;
}

export interface DocumentListItem {
  id: string;
  title: string;
  source: string | null;
  created_at: string;
  updated_at: string;
  chunk_count: number;
}

export interface Chunk {
  id: string;
  document: string;
  document_title?: string;
  content: string;
  chunk_index: number;
  created_at: string;
  distance?: number;
}

export interface SimilaritySearchRequest {
  query: string;
  top_k: number;
}

export interface RAGRequest {
  query: string;
  top_k: number;
}

export interface RAGSource {
  chunk_id: string;
  document_title: string;
  content: string;
  distance: number;
}

export interface RAGResponse {
  answer: string;
  sources: RAGSource[];
}

export interface IngestDocumentRequest {
  title: string;
  content?: string;
  source?: string;
  file?: File;
}
