import { useMutation } from "@tanstack/react-query";
import { ragQuery, searchSimilar } from "@/api/embeddings";
import type { RAGRequest, SimilaritySearchRequest } from "@/types/embeddings";

export function useSearch() {
  return useMutation({
    mutationFn: (data: SimilaritySearchRequest) => searchSimilar(data),
  });
}

export function useRAGQuery() {
  return useMutation({
    mutationFn: (data: RAGRequest) => ragQuery(data),
  });
}
