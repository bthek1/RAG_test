import { cn } from "@/lib/utils";

interface StreamingIndicatorProps {
  className?: string;
}

export function StreamingIndicator({ className }: StreamingIndicatorProps) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-0.5 animate-pulse bg-current align-middle",
        className,
      )}
      aria-label="Streaming"
    />
  );
}
