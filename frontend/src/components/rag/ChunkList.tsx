import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useChunks } from "@/hooks/useDocuments";
import { ChunkCard } from "./ChunkCard";

interface ChunkListProps {
  documentId: string;
}

export function ChunkList({ documentId }: ChunkListProps) {
  const { data: chunks, isLoading, isError } = useChunks(documentId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load chunks.</AlertDescription>
      </Alert>
    );
  }

  if (!chunks || chunks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No chunks found.{" "}
        <span className="text-xs">
          Try re-ingesting the document to generate chunks.
        </span>
      </p>
    );
  }

  const maxChars = Math.max(...chunks.map((c) => c.content.length));
  const avgChars = Math.round(
    chunks.reduce((sum, c) => sum + c.content.length, 0) / chunks.length,
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{chunks.length}</span>{" "}
        chunks · avg{" "}
        <span className="font-semibold text-foreground">
          {avgChars.toLocaleString()}
        </span>{" "}
        chars
      </p>

      {chunks.map((chunk) => (
        <ChunkCard
          key={chunk.id}
          chunk={chunk}
          totalChunks={chunks.length}
          showDocument={false}
          maxChars={maxChars}
        />
      ))}
    </div>
  );
}
