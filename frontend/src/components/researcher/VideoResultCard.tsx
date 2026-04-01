import { useState } from "react";
import { Play, Clock, Tv, ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { VideoResult } from "@/types/researcher";

interface VideoResultCardProps {
  result: VideoResult;
  rank: number;
}

export function VideoResultCard({ result, rank }: VideoResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const scrapeFailed = result.scraped_text?.startsWith("[scrape failed");

  return (
    <Card className="hover:shadow-md transition-shadow overflow-hidden">
      <CardHeader className="flex flex-row items-start gap-3 pb-0">
        <Badge variant="secondary" className="shrink-0">
          {rank}
        </Badge>
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary hover:underline text-base leading-tight"
          >
            {result.title}
          </a>
        </div>
      </CardHeader>

      {/* Video Thumbnail Preview */}
      {result.thumbnail_url && (
        <div className="relative bg-black/10 aspect-video overflow-hidden m-3 rounded-md">
          <img
            src={result.thumbnail_url}
            alt={result.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-colors">
            <Play className="w-12 h-12 text-white fill-white" />
          </div>
        </div>
      )}

      <CardContent className="flex flex-col gap-3 pt-2">
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          {result.duration && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {result.duration}
            </span>
          )}
          {result.channel && (
            <span className="flex items-center gap-1">
              <Tv className="w-3 h-3" />
              {result.channel}
            </span>
          )}
        </div>

        <p className="text-sm text-foreground">{result.snippet}</p>

        <a
          href={result.video_url || result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline font-medium"
        >
          <Play className="w-4 h-4 fill-primary" />
          Watch video
        </a>

        {result.scraped_text && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Hide transcript" : "Show transcript"}
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
