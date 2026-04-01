import { createFileRoute } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Search, AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";

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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ResearchResultCard } from "@/components/researcher/ResearchResultCard";
import { useRunSearch } from "@/hooks/useResearcher";
import { searchSchema, type SearchSchema } from "@/schemas/researcher";

export const Route = createFileRoute("/researcher/search")({
  component: ResearcherSearchPage,
});

export function ResearcherSearchPage() {
  const search = useRunSearch();
  const form = useForm({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      query: "",
      type: "all" as const,
      sort: "relevance" as const,
      max_results: 5,
    },
  });

  function onSubmit(values: SearchSchema) {
    search.mutate(values);
  }

  const isLoading = search.isPending;
  const results = search.data || [];
  const hasResults = results.length > 0;
  const hasError = search.isError;

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      {/* Search Form */}
      <div className="bg-card border rounded-lg p-6 shadow-sm">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
          >
            {/* Query Input */}
            <FormField
              control={form.control}
              name="query"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Search Query</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="e.g. Australian climate policy 2024"
                        className="pl-10"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Filters Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Result Type Filter */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Result Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="all">All Results</SelectItem>
                        <SelectItem value="web">Web Pages</SelectItem>
                        <SelectItem value="news">News</SelectItem>
                        <SelectItem value="video">Videos</SelectItem>
                        <SelectItem value="image">Images</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Sort Filter */}
              <FormField
                control={form.control}
                name="sort"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort By</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="relevance">Relevance</SelectItem>
                        <SelectItem value="date">Newest</SelectItem>
                        <SelectItem value="popularity">Popularity</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Max Results */}
              <FormField
                control={form.control}
                name="max_results"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Results</FormLabel>
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
                        {[1, 5, 10, 15, 20].map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} results
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Submit Button */}
            <Button type="submit" size="lg" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </>
              )}
            </Button>
          </form>
        </Form>
      </div>

      {/* Error State */}
      {hasError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {search.error instanceof Error
              ? search.error.message
              : "An error occurred while searching. Please try again."}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Searching...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !hasResults && !hasError && search.isSuccess && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Search className="w-12 h-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">No results found</p>
          <p className="text-sm text-muted-foreground">
            Try adjusting your search query or filters
          </p>
        </div>
      )}

      {/* Initial State */}
      {!isLoading && !hasResults && !hasError && !search.isSuccess && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Search className="w-12 h-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">Enter a search query to begin</p>
        </div>
      )}

      {/* Results */}
      {hasResults && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              Results ({results.length})
            </h2>
          </div>
          <ul className="flex flex-col gap-3">
            {results.map((result, idx) => (
              <ResearchResultCard
                key={`${result.url}-${idx}`}
                result={result}
                rank={idx + 1}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
