import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SearchResult } from "@/types/researcher";

interface ResearchResultCardProps {
  result: SearchResult;
  rank: number;
}

export function ResearchResultCard({ result, rank }: ResearchResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const scrapeFailed = result.scraped_text.startsWith("[scrape failed");

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-3 pb-2">
        <Badge variant="outline">{rank}</Badge>
        <div className="flex flex-col gap-1">
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:underline"
          >
            {result.title}
          </a>
          <span className="text-xs text-muted-foreground break-all">
            {result.url}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{result.snippet}</p>
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide scraped text" : "Show scraped text"}
        </Button>
        {expanded && (
          <pre
            className={cn(
              "text-xs whitespace-pre-wrap bg-muted rounded-md p-3 max-h-64 overflow-y-auto",
              scrapeFailed && "text-destructive",
            )}
          >
            {result.scraped_text}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
