import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useOllamaStatus } from "@/hooks/useOllamaStatus";

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
  return `${bytes} B`;
}

export function OllamaStatusIndicator() {
  const { ollamaStatus, isConnected, isPending, isError } = useOllamaStatus();

  const dotClass = isPending
    ? "bg-yellow-400"
    : isError || !isConnected
      ? "bg-red-500"
      : "bg-green-500";

  const label = isPending
    ? "Checking…"
    : isError
      ? "Ollama unknown"
      : isConnected
        ? "Ollama ready"
        : "Ollama offline";

  const runningNames = new Set(
    ollamaStatus?.running_models.map((m) => m.name) ?? [],
  );

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
      <TooltipContent side="bottom" className="max-w-xs space-y-1 text-xs">
        {isPending && <p>Checking Ollama connection…</p>}
        {isError && <p>Could not retrieve Ollama status from the backend.</p>}
        {!isPending && !isError && ollamaStatus && (
          <>
            <p className="font-semibold">
              {isConnected ? "Ollama Connected" : "Ollama Offline"}
            </p>
            <p className="font-mono text-muted-foreground">
              {ollamaStatus.base_url}
            </p>
            {isConnected && (
              <>
                {ollamaStatus.models.length === 0 ? (
                  <p className="text-muted-foreground">No models installed</p>
                ) : (
                  <>
                    <hr className="border-border my-1" />
                    <p className="font-medium">
                      Models ({ollamaStatus.models.length})
                    </p>
                    {ollamaStatus.models.map((m) => {
                      const runningModel = ollamaStatus.running_models.find(
                        (r) => r.name === m.name,
                      );
                      const isRunning = runningNames.has(m.name);
                      const isGpu =
                        isRunning && runningModel?.processor?.startsWith("gpu");
                      return (
                        <div
                          key={m.name}
                          className="flex items-center justify-between gap-4"
                        >
                          <span className="font-mono">{m.name}</span>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <span>{formatBytes(m.size)}</span>
                            {isRunning && (
                              <span
                                className={
                                  isGpu ? "text-green-500" : "text-yellow-500"
                                }
                              >
                                {isGpu ? "GPU" : "CPU"}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            )}
            {!isConnected && (
              <p className="text-muted-foreground">
                Cannot reach Ollama — check that it is running at{" "}
                <span className="font-mono">{ollamaStatus.base_url}</span>
              </p>
            )}
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
