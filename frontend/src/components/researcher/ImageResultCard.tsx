import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ImageResult } from "@/types/researcher";
import { ChevronDown, Image as ImageIcon } from "lucide-react";

interface ImageResultCardProps {
  result: ImageResult;
  rank: number;
}

export function ImageResultCard({ result, rank }: ImageResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const scrapeFailed = result.scraped_text?.startsWith("[scrape failed");
  const images = result.images || [];
  const selectedImage = images[selectedImageIndex];

  return (
    <Card className="hover:shadow-md transition-shadow overflow-hidden">
      <CardHeader className="flex flex-row items-start gap-3 pb-2">
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

      {/* Image Gallery */}
      {images.length > 0 && (
        <div className="px-4 py-3 flex flex-col gap-3">
          {/* Main Image */}
          {selectedImage && (
            <div className="bg-muted rounded-md overflow-hidden">
              <img
                src={selectedImage}
                alt={`${result.title} - image ${selectedImageIndex + 1}`}
                className="w-full h-auto max-h-96 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          )}

          {/* Thumbnail Gallery */}
          {images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImageIndex(idx)}
                  className={cn(
                    "relative aspect-square rounded-md overflow-hidden border-2 transition-colors",
                    selectedImageIndex === idx
                      ? "border-primary"
                      : "border-muted hover:border-muted-foreground",
                  )}
                >
                  <img
                    src={img}
                    alt={`Thumbnail ${idx + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%23f2f2f2' width='100' height='100'/%3E%3Ctext x='50' y='50' text-anchor='middle' dy='.3em' fill='%23999' font-size='12'%3ENo image%3C/text%3E%3C/svg%3E";
                    }}
                  />
                </button>
              ))}
            </div>
          )}

          <div className="text-xs text-muted-foreground text-center">
            {images.length} image{images.length !== 1 ? "s" : ""} •{" "}
            {selectedImageIndex + 1} of {images.length}
          </div>
        </div>
      )}

      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-foreground">{result.snippet}</p>

        <a
          href={result.original_url || result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline font-medium"
        >
          <ImageIcon className="w-4 h-4" />
          View source
        </a>

        {result.scraped_text && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Hide description" : "Show description"}
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
