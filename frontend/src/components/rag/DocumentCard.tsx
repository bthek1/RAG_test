import { formatDistanceToNow } from "date-fns";
import { FileText, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DocumentListItem } from "@/types/embeddings";

interface DocumentCardProps {
  doc: DocumentListItem;
  isSelected?: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  isDeleting?: boolean;
}

export function DocumentCard({
  doc,
  isSelected,
  onSelect,
  onDelete,
  isDeleting,
}: DocumentCardProps) {
  return (
    <Card
      className={`cursor-pointer transition-shadow hover:shadow-md ${isSelected ? "ring-2 ring-primary" : ""}`}
      onClick={() => onSelect(doc.id)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <CardTitle className="truncate text-sm font-medium">
              {doc.title}
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            disabled={isDeleting}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(doc.id);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-xs">
            {doc.chunk_count} chunk{doc.chunk_count !== 1 ? "s" : ""}
          </Badge>
          {doc.source && (
            <span className="truncate max-w-[120px]" title={doc.source}>
              {doc.source}
            </span>
          )}
          <span className="ml-auto shrink-0">
            {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
