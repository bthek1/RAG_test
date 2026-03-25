import { apiClient } from "./client";
import type {
  ChatRequest,
  ChatResponse,
  OllamaModel,
  OllamaStatus,
} from "@/types/chat";

export async function listModels(): Promise<OllamaModel[]> {
  const { data } = await apiClient.get<{ models: OllamaModel[] }>(
    "/api/chat/models/",
  );
  return data.models;
}

export async function getOllamaStatus(): Promise<OllamaStatus> {
  const { data } = await apiClient.get<OllamaStatus>("/api/chat/status/");
  return data;
}

export async function sendChat(payload: ChatRequest): Promise<ChatResponse> {
  const { data } = await apiClient.post<ChatResponse>("/api/chat/", payload);
  return data;
}
