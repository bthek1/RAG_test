import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getSimilarityColor, toSimilarityPercent } from "@/lib/similarity";
import type { RAGSource } from "@/types/embeddings";
import { cn } from "@/lib/utils";

interface SourceCitationProps {
  source: RAGSource;
  index: number;
}

export function SourceCitation({ source, index }: SourceCitationProps) {
  const pct = toSimilarityPercent(source.distance);
  const colorClass = getSimilarityColor(pct);

  return (
    <AccordionItem value={`source-${index}`} className="rounded-md border px-2">
      <AccordionTrigger className="py-2 text-xs hover:no-underline">
        <div className="flex items-center gap-2 text-left">
          <span className="shrink-0 text-muted-foreground">#{index + 1}</span>
          <span className="truncate font-medium">{source.document_title}</span>
          <Badge
            variant="outline"
            className={cn("shrink-0 text-[10px] font-semibold", colorClass)}
          >
            {pct}%
          </Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-2">
        <ScrollArea className="h-36 rounded bg-muted/40 p-2">
          <p className="text-xs leading-relaxed text-foreground">
            {source.content}
          </p>
        </ScrollArea>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">
            {source.document_title} · Cosine distance:{" "}
            {source.distance.toFixed(4)} · Chunk ID:{" "}
            <span className="font-mono">{source.chunk_id.slice(0, 8)}…</span>
          </p>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 px-2 text-[10px]"
                  disabled
                >
                  View in document
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Coming soon</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
