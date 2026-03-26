import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocument } from "@/hooks/useDocuments";
import { formatDateTime } from "@/lib/date";
import { ChunkList } from "./ChunkList";

interface DocumentDetailProps {
  documentId: string;
  onClose: () => void;
}

export function DocumentDetail({ documentId, onClose }: DocumentDetailProps) {
  const { data: doc, isLoading } = useDocument(documentId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="truncate text-sm font-semibold">
          {isLoading ? <Skeleton className="h-4 w-32" /> : doc?.title}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : doc ? (
        <Tabs
          defaultValue="info"
          className="flex flex-1 flex-col overflow-hidden"
        >
          <TabsList className="mx-4 mt-2 w-auto self-start">
            <TabsTrigger value="info">Info</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="chunks">Chunks</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="flex-1 overflow-auto px-4 pb-4">
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs font-medium uppercase text-muted-foreground">
                  Source
                </span>
                <p className="mt-0.5 break-all text-foreground">
                  {doc.source ?? "—"}
                </p>
              </div>
              <Separator />
              <div className="flex gap-4">
                <div>
                  <span className="text-xs font-medium uppercase text-muted-foreground">
                    Chunks
                  </span>
                  <div className="mt-0.5">
                    <Badge variant="secondary">{doc.chunk_count}</Badge>
                  </div>
                </div>
                <div>
                  <span className="text-xs font-medium uppercase text-muted-foreground">
                    Created
                  </span>
                  <p className="mt-0.5 text-foreground">
                    {formatDateTime(doc.created_at)}
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="content"
            className="flex flex-1 flex-col overflow-hidden px-4 pb-4"
          >
            <ScrollArea className="flex-1 rounded-md border bg-muted/30 p-3">
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
                {doc.content}
              </pre>
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="chunks"
            className="flex-1 overflow-auto px-4 pb-4"
          >
            <ChunkList documentId={documentId} />
          </TabsContent>
        </Tabs>
      ) : (
        <p className="p-4 text-sm text-muted-foreground">Document not found.</p>
      )}
    </div>
  );
}
