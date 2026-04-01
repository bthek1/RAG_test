import { useState } from "react";
import { Calendar, Building2, ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { NewsResult } from "@/types/researcher";
import { formatDistanceToNow } from "date-fns";

interface NewsResultCardProps {
  result: NewsResult;
  rank: number;
}

export function NewsResultCard({ result, rank }: NewsResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const scrapeFailed = result.scraped_text?.startsWith("[scrape failed");
  const publishedDate = result.published_at
    ? new Date(result.published_at)
    : null;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-start gap-3 pb-2">
        <Badge variant="secondary" className="shrink-0">
          {rank}
        </Badge>
        <div className="flex flex-col gap-2 flex-1">
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary hover:underline text-base leading-tight"
          >
            {result.title}
          </a>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            {result.source && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {result.source}
              </span>
            )}
            {publishedDate && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDistanceToNow(publishedDate, { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-foreground">{result.snippet}</p>
        {result.author && (
          <p className="text-xs text-muted-foreground italic">
            By {result.author}
          </p>
        )}
        {result.scraped_text && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Hide full article" : "Show full article"}
              <ChevronDown
                className={cn(
                  "w-4 h-4 ml-2 transition-transform",
                  expanded && "rotate-180",
                )}
              />
            </Button>
            {expanded && (
              <pre
                className={cn(
                  "text-xs whitespace-pre-wrap bg-muted rounded-md p-3 max-h-96 overflow-y-auto font-sans",
                  scrapeFailed && "text-destructive",
                )}
              >
                {result.scraped_text}
              </pre>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
