import { apiClient } from "./client";
import type { ChatRequest, ChatResponse, OllamaModel } from "@/types/chat";

export async function listModels(): Promise<OllamaModel[]> {
  const { data } = await apiClient.get<{ models: OllamaModel[] }>(
    "/api/chat/models/",
  );
  return data.models;
}

export async function sendChat(payload: ChatRequest): Promise<ChatResponse> {
  const { data } = await apiClient.post<ChatResponse>("/api/chat/", payload);
  return data;
}
