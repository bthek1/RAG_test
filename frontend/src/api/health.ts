import type { GpuStatus } from "@/types/gpu";
import { apiClient } from "./client";

export async function getHealth(): Promise<{ status: string }> {
  const { data } = await apiClient.get<{ status: string }>("/api/health/");
  return data;
}

export async function getGpuStatus(): Promise<GpuStatus> {
  const { data } = await apiClient.get<GpuStatus>("/api/gpu-status/");
  return data;
}
