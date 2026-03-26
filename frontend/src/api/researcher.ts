import { apiClient } from "@/api/client";
import type { SearchRequest, SearchResult } from "@/types/researcher";

export async function runSearch(
  payload: SearchRequest,
): Promise<SearchResult[]> {
  const { data } = await apiClient.post<SearchResult[]>(
    "/api/researcher/search/",
    payload,
  );
  return data;
}
