import { cn } from "@/lib/utils";

export type PipelineStepState = "idle" | "active" | "done";

interface PipelineStepProps {
  icon: string;
  label: string;
  description?: string;
  state?: PipelineStepState;
  highlighted?: boolean;
  className?: string;
}

export function PipelineStep({
  icon,
  label,
  description,
  state = "idle",
  highlighted = false,
  className,
}: PipelineStepProps) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-all duration-500",
        highlighted && "ring-2 ring-primary ring-offset-2",
        state === "active" && "animate-pulse border-primary bg-primary/10",
        state === "done" && "border-green-500 bg-green-50 dark:bg-green-950/20",
        state === "idle" && "border-border bg-card",
        className,
      )}
    >
      <span className="text-2xl" role="img" aria-label={label}>
        {icon}
      </span>
      <span className="text-xs font-semibold leading-tight">{label}</span>
      {description && (
        <span className="text-[10px] text-muted-foreground leading-tight">
          {description}
        </span>
      )}
      {state === "done" && (
        <span className="absolute -right-1 -top-1 rounded-full bg-green-500 px-1 text-[9px] text-white">
          ✓
        </span>
      )}
    </div>
  );
}

export function PipelineArrow({ active = false }: { active?: boolean }) {
  return (
    <div className="flex items-center justify-center py-1">
      <div
        className={cn(
          "h-6 w-0.5 transition-colors duration-300",
          active ? "bg-primary" : "bg-border",
        )}
      />
      <div
        className={cn(
          "absolute h-0 w-0 border-x-4 border-t-4 border-x-transparent transition-colors duration-300",
          active ? "border-t-primary" : "border-t-border",
        )}
        style={{ marginTop: "20px" }}
      />
    </div>
  );
}
