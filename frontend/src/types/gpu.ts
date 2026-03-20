export interface GpuStatus {
  available: boolean;
  device: string;
  device_name: string;
  vram_total_mb: number | null;
  vram_used_mb: number | null;
  vram_free_mb: number | null;
  embedding_model: string;
}
