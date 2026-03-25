export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
}

export interface ChatResponse {
  reply: string;
}

export interface OllamaModel {
  name: string;
  model: string;
  size: number;
  details: {
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaRunningModel {
  name: string;
  model: string;
  size: number;
  size_vram: number;
  details: {
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
  expires_at: string;
  processor: string;
}

export interface OllamaStatus {
  connected: boolean;
  base_url: string;
  models: OllamaModel[];
  running_models: OllamaRunningModel[];
}
