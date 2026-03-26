export interface SearchRequest {
  query: string;
  max_results?: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  scraped_text: string;
}
