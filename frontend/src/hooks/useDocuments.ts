import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteDocument,
  getDocument,
  ingestDocument,
  listDocuments,
} from "@/api/embeddings";
import { queryKeys } from "@/api/queryKeys";
import type { IngestDocumentRequest } from "@/types/embeddings";

export function useDocuments() {
  return useQuery({
    queryKey: queryKeys.embeddings.documents.all,
    queryFn: listDocuments,
  });
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: queryKeys.embeddings.documents.detail(id),
    queryFn: () => getDocument(id),
    enabled: !!id,
  });
}

export function useIngestDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: IngestDocumentRequest) => ingestDocument(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.embeddings.documents.all,
      });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.embeddings.documents.all,
      });
    },
  });
}
