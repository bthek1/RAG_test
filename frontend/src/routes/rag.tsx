import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { BookOpen, MessageSquare, Search } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RAGPipelineVisualizer } from "@/components/rag/RAGPipelineVisualizer";
import { useDocuments } from "@/hooks/useDocuments";

export const Route = createFileRoute("/rag")({
  component: RAGLayout,
});

function RAGOverview() {
  const { data: docs } = useDocuments();
  const totalDocs = docs?.length ?? 0;
  const totalChunks = docs?.reduce((sum, d) => sum + d.chunk_count, 0) ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">RAG Pipeline</h1>
        <p className="mt-1 text-muted-foreground">
          Retrieval-Augmented Generation — upload documents, search
          semantically, and query Claude with grounded answers.
        </p>
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 rounded-lg border bg-muted/40 px-5 py-3 text-sm">
        <span>
          <span className="font-semibold">{totalDocs}</span>{" "}
          <span className="text-muted-foreground">
            document{totalDocs !== 1 ? "s" : ""}
          </span>
        </span>
        <span className="text-border">|</span>
        <span>
          <span className="font-semibold">{totalChunks}</span>{" "}
          <span className="text-muted-foreground">
            chunk{totalChunks !== 1 ? "s" : ""} indexed
          </span>
        </span>
      </div>

      {/* Pipeline visualizer */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          How it works
        </h2>
        <RAGPipelineVisualizer />
      </section>

      {/* Quick-start cards */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Get started
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link to="/rag/documents" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <BookOpen className="mb-1 h-6 w-6 text-primary" />
                <CardTitle className="text-base">Documents</CardTitle>
                <CardDescription>
                  Ingest text documents. They get chunked, embedded, and stored
                  in pgvector.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link to="/rag/search" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <Search className="mb-1 h-6 w-6 text-primary" />
                <CardTitle className="text-base">Similarity Search</CardTitle>
                <CardDescription>
                  Run a semantic query and see exactly which chunks match and
                  how similar they are.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link to="/rag/chat" className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <MessageSquare className="mb-1 h-6 w-6 text-primary" />
                <CardTitle className="text-base">RAG Chat</CardTitle>
                <CardDescription>
                  Ask questions and get grounded answers from Claude, with
                  source citations.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </section>
    </div>
  );
}

function RAGLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isRoot = pathname === "/rag";

  if (isRoot) return <RAGOverview />;
  return <Outlet />;
}
