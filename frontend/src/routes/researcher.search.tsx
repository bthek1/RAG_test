import { createFileRoute } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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
import { ResearchResultCard } from "@/components/researcher/ResearchResultCard";
import { useRunSearch } from "@/hooks/useResearcher";
import { searchSchema, type SearchSchema } from "@/schemas/researcher";

export const Route = createFileRoute("/researcher/search")({
  component: ResearcherSearchPage,
});

export function ResearcherSearchPage() {
  const search = useRunSearch();
  const form = useForm<SearchSchema>({ resolver: zodResolver(searchSchema) });

  function onSubmit(values: SearchSchema) {
    search.mutate(values);
  }

  return (
    <div className="flex flex-col gap-6">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4 max-w-xl"
        >
          <FormField
            control={form.control}
            name="query"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Search query</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Australian climate policy 2024"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="max_results"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Max results (1–20)</FormLabel>
                <FormControl>
                  <Input type="number" min={1} max={20} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={search.isPending}>
            {search.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Search
          </Button>
        </form>
      </Form>

      {search.isError && (
        <p className="text-destructive text-sm">
          Search failed — please try again.
        </p>
      )}

      {search.isSuccess && search.data.length === 0 && (
        <p className="text-muted-foreground text-sm">No results found.</p>
      )}

      {search.isSuccess && (
        <ul className="flex flex-col gap-4">
          {search.data.map((result, i) => (
            <ResearchResultCard key={result.url} result={result} rank={i + 1} />
          ))}
        </ul>
      )}
    </div>
  );
}
