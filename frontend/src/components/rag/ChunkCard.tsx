import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getSimilarityColor, toSimilarityPercent } from "@/lib/similarity";
import type { Chunk } from "@/types/embeddings";
import { cn } from "@/lib/utils";

interface ChunkCardProps {
  chunk: Chunk;
  totalChunks?: number;
  showDocument?: boolean;
  defaultExpanded?: boolean;
  /** Max content length in the current result set — used to proportion the length bar. */
  maxChars?: number;
}

export function ChunkCard({
  chunk,
  totalChunks,
  showDocument = true,
  defaultExpanded = false,
  maxChars,
}: ChunkCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentId = `chunk-content-${chunk.id}`;

  const pct =
    chunk.distance != null ? toSimilarityPercent(chunk.distance) : null;
  const colorClass =
    pct != null ? getSimilarityColor(pct) : "text-muted-foreground";

  const lengthBarValue =
    maxChars && maxChars > 0
      ? Math.round((chunk.content.length / maxChars) * 100)
      : 100;

  const positionLabel =
    totalChunks != null
      ? `${chunk.chunk_index + 1} / ${totalChunks}`
      : `${chunk.chunk_index + 1}`;

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      {/* Header row */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs font-bold text-muted-foreground">
          #{positionLabel}
        </span>

        {showDocument && chunk.document_title && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="max-w-[200px] truncate text-xs font-semibold text-foreground">
                  {chunk.document_title}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{chunk.document_title}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {chunk.content.length.toLocaleString()} chars
        </span>
      </div>

      {/* character-length bar */}
      <Progress value={lengthBarValue} className="mb-3 h-1" />

      {/* similarity row — only when distance is present */}
      {pct != null && (
        <div className="mb-3 flex items-center gap-2">
          <Progress value={pct} className="h-2 flex-1" />
          <span
            className={cn(
              "shrink-0 text-xs font-semibold tabular-nums",
              colorClass,
            )}
          >
            {pct}% similar
          </span>
          <Badge variant="outline" className="shrink-0 font-mono text-xs">
            d={chunk.distance!.toFixed(3)}
          </Badge>
        </div>
      )}

      {/* content area */}
      <div>
        <p
          id={contentId}
          className={cn(
            "text-sm leading-relaxed text-foreground",
            !expanded && "line-clamp-5",
          )}
        >
          {chunk.content}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-auto px-0 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      </div>

      {/* footer */}
      <p className="mt-2 font-mono text-[10px] text-muted-foreground">
        {chunk.id.slice(0, 8)}…
      </p>
    </div>
  );
}
