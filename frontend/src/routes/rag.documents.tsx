import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentCard } from "@/components/rag/DocumentCard";
import { DocumentDetail } from "@/components/rag/DocumentDetail";
import { IngestDocumentForm } from "@/components/rag/IngestDocumentForm";
import { useDeleteDocument, useDocuments } from "@/hooks/useDocuments";

export const Route = createFileRoute("/rag/documents")({
  component: DocumentsPage,
});

function DocumentsPage() {
  const { data: docs, isLoading } = useDocuments();
  const deleteDoc = useDeleteDocument();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [ingestOpen, setIngestOpen] = useState(false);

  function confirmDelete(id: string) {
    setDeleteId(id);
  }

  function handleDelete() {
    if (!deleteId) return;
    deleteDoc.mutate(deleteId, {
      onSuccess: () => {
        setDeleteId(null);
        if (selectedId === deleteId) setSelectedId(null);
      },
    });
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel — document list */}
      <div className="flex w-full flex-col border-r md:w-80 lg:w-96">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h1 className="text-sm font-semibold">Documents</h1>
          <Dialog open={ingestOpen} onOpenChange={setIngestOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <PlusCircle className="h-3.5 w-3.5" />
                Ingest New
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Ingest Document</DialogTitle>
              </DialogHeader>
              <IngestDocumentForm onSuccess={() => setIngestOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : docs && docs.length > 0 ? (
            <div className="space-y-2">
              {docs.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  isSelected={selectedId === doc.id}
                  onSelect={setSelectedId}
                  onDelete={confirmDelete}
                  isDeleting={deleteDoc.isPending && deleteId === doc.id}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center text-sm text-muted-foreground">
              <p className="font-medium">No documents yet</p>
              <p className="mt-1 text-xs">
                Click "Ingest New" to add your first document.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right panel — detail */}
      <div className="hidden flex-1 md:flex md:flex-col">
        {selectedId ? (
          <DocumentDetail
            documentId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <p className="font-medium">No document selected</p>
            <p className="mt-1 text-xs">
              Click a document to view its details.
            </p>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the document and all its chunks from
            the vector store. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteDoc.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
