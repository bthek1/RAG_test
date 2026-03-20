import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGpuStatus } from "@/hooks/useGpuStatus";

function formatVram(mb: number | null): string {
  if (mb === null) return "—";
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

export function GpuStatusIndicator() {
  const { gpuStatus, isAvailable, isPending, isError } = useGpuStatus();

  const dotClass = isPending
    ? "bg-yellow-400"
    : isError
      ? "bg-red-500"
      : isAvailable
        ? "bg-green-500"
        : "bg-zinc-400";

  const label = isPending
    ? "Checking…"
    : isError
      ? "GPU unknown"
      : isAvailable
        ? "GPU active"
        : "CPU only";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 rounded-md px-2 py-1 cursor-default">
          <span className={`h-2 w-2 rounded-full ${dotClass}`} />
          <span className="hidden text-xs text-muted-foreground sm:block">
            {label}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="space-y-1 text-xs">
        {isPending && <p>Checking GPU availability…</p>}
        {isError && <p>Could not retrieve GPU status from the backend.</p>}
        {!isPending && !isError && gpuStatus && (
          <>
            <p className="font-semibold">
              {gpuStatus.available ? "GPU Available" : "No GPU — Running on CPU"}
            </p>
            <p>
              Device: <span className="font-mono">{gpuStatus.device}</span>
            </p>
            <p>
              Model: <span className="font-mono">{gpuStatus.device_name}</span>
            </p>
            <p>
              Embedding model:{" "}
              <span className="font-mono">{gpuStatus.embedding_model}</span>
            </p>
            {gpuStatus.available && gpuStatus.vram_total_mb !== null && (
              <>
                <hr className="border-border my-1" />
                <p>VRAM total: {formatVram(gpuStatus.vram_total_mb)}</p>
                <p>VRAM used: {formatVram(gpuStatus.vram_used_mb)}</p>
                <p>VRAM free: {formatVram(gpuStatus.vram_free_mb)}</p>
              </>
            )}
            {gpuStatus.available && gpuStatus.vram_total_mb === null && (
              <p className="text-muted-foreground">
                VRAM stats not available (MPS)
              </p>
            )}
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
