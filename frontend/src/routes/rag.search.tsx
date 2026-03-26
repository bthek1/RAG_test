import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Search, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchResultCard } from "@/components/rag/SearchResultCard";
import { useSearch } from "@/hooks/useRAG";
import { searchQuerySchema } from "@/schemas/embeddings";
import { z } from "zod";

type SearchQuerySchema = z.infer<typeof searchQuerySchema>;

export const Route = createFileRoute("/rag/search")({
  component: SearchPage,
});

function SearchPage() {
  const search = useSearch();

  const form = useForm<SearchQuerySchema, unknown, SearchQuerySchema>({
    resolver: zodResolver(searchQuerySchema),
    defaultValues: { query: "", top_k: 5 },
  });

  function onSubmit(values: SearchQuerySchema) {
    search.mutate(values);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Similarity Search</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Embed a query and see which stored chunks are most semantically
          similar — without an LLM. This is the retrieval step of RAG made
          visible.
        </p>
      </div>

      {/* Search form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-2">
          <FormField
            control={form.control}
            name="query"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel className="sr-only">Query</FormLabel>
                <FormControl>
                  <Input
                    placeholder="What is the attention mechanism?"
                    autoComplete="off"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="top_k"
            render={({ field }) => (
              <FormItem className="w-24">
                <FormLabel className="sr-only">Top-k</FormLabel>
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {[1, 3, 5, 10, 20].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        Top {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={search.isPending} className="gap-2">
            {search.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Search
          </Button>
        </form>
      </Form>

      {/* Error */}
      {search.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Search failed. Please check your query and try again.
          </AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {search.data && (
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {search.data.length} results
            </span>
            {search.data.length === 0 && "— no chunks matched your query"}
          </div>

          {search.data.length > 0 && (
            <div className="space-y-3">
              {search.data.map((chunk, i) => (
                <SearchResultCard key={chunk.id} chunk={chunk} rank={i + 1} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* How it works */}
      {!search.data && !search.isPending && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          <p className="mb-1 font-semibold text-foreground">
            How does this work?
          </p>
          <p>
            Your query is converted to a 1024-dimensional vector using the same
            embedding model used during ingestion. PostgreSQL's{" "}
            <code className="text-xs">pgvector</code> extension then performs an
            approximate nearest-neighbour search using an HNSW index and cosine
            distance. Lower distance = more similar.
          </p>
        </div>
      )}
    </div>
  );
}
