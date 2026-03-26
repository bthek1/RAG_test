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

interface SearchResultCardProps {
  chunk: Chunk;
  rank: number;
}

export function SearchResultCard({ chunk, rank }: SearchResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = `search-result-content-${chunk.id}`;

  const pct =
    chunk.distance != null ? toSimilarityPercent(chunk.distance) : null;
  const colorClass =
    pct != null ? getSimilarityColor(pct) : "text-muted-foreground";

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <span className="text-xs font-bold text-muted-foreground">#{rank}</span>

        {chunk.document_title && (
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

        {pct != null && (
          <div className="flex flex-1 items-center gap-2">
            <Progress value={pct} className="h-2 flex-1" />
            <span
              className={cn(
                "shrink-0 text-xs font-semibold tabular-nums",
                colorClass,
              )}
            >
              {pct}% similar
            </span>
          </div>
        )}

        {chunk.distance != null && (
          <Badge variant="outline" className="shrink-0 font-mono text-xs">
            d={chunk.distance.toFixed(3)}
          </Badge>
        )}
      </div>

      <div className="mb-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
        <span>Chunk #{chunk.chunk_index}</span>
        <span>·</span>
        <span>{chunk.content.length.toLocaleString()} chars</span>
        <span>·</span>
        <span className="font-mono">{chunk.id.slice(0, 8)}…</span>
      </div>

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
    </div>
  );
}
