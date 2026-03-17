import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getSimilarityColor, toSimilarityPercent } from "@/lib/similarity";
import type { Chunk } from "@/types/embeddings";
import { cn } from "@/lib/utils";

interface SearchResultCardProps {
  chunk: Chunk;
  rank: number;
}

export function SearchResultCard({ chunk, rank }: SearchResultCardProps) {
  const pct =
    chunk.distance != null ? toSimilarityPercent(chunk.distance) : null;
  const colorClass =
    pct != null ? getSimilarityColor(pct) : "text-muted-foreground";

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <span className="text-xs font-bold text-muted-foreground">#{rank}</span>

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
        <span className="font-mono">{chunk.id.slice(0, 8)}…</span>
      </div>

      <ScrollArea className="h-28">
        <p className="text-sm leading-relaxed text-foreground">
          {chunk.content}
        </p>
      </ScrollArea>
    </div>
  );
}
