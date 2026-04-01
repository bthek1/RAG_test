export interface SearchRequest {
  query: string;
  max_results?: number;
  type?: "web" | "news" | "video" | "image" | "all";
  sort?: "relevance" | "date" | "popularity";
}

// Base result type with common fields
export interface SearchResultBase {
  title: string;
  url: string;
  snippet: string;
  scraped_text?: string;
}

// Web result (standard search result)
export interface WebResult extends SearchResultBase {
  type: "web";
}

// News result with publication metadata
export interface NewsResult extends SearchResultBase {
  type: "news";
  source?: string;
  published_at?: string;
  author?: string;
}

// Video result with media metadata
export interface VideoResult extends SearchResultBase {
  type: "video";
  video_url?: string;
  thumbnail_url?: string;
  duration?: string;
  channel?: string;
}

// Image result with gallery
export interface ImageResult extends SearchResultBase {
  type: "image";
  images?: string[];
  original_url?: string;
  thumbnail_size?: {
    width: number;
    height: number;
  };
}

// Discriminated union of all result types
export type SearchResult = WebResult | NewsResult | VideoResult | ImageResult;
