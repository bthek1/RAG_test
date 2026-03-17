import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle, Circle, Loader2 } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ingestDocumentSchema,
  type IngestDocumentFormData,
} from "@/schemas/embeddings";
import { useIngestDocument } from "@/hooks/useDocuments";
import { PDFDropZone } from "./PDFDropZone";

const STEPS = ["Chunking", "Embedding", "Storing"] as const;

interface IngestDocumentFormProps {
  onSuccess?: () => void;
}

export function IngestDocumentForm({ onSuccess }: IngestDocumentFormProps) {
  const ingest = useIngestDocument();
  const [completedSteps, setCompletedSteps] = useState<number>(-1);

  const form = useForm<IngestDocumentFormData>({
    resolver: zodResolver(ingestDocumentSchema),
    defaultValues: { mode: "text", title: "", content: "", source: "" },
  });

  const mode = form.watch("mode");

  function handleTabChange(value: string) {
    if (value === "text") {
      form.setValue("mode", "text");
      // Clear file when switching to text
      form.setValue("file" as never, undefined as never);
    } else {
      form.setValue("mode", "file");
      // Clear content when switching to file
      form.setValue("content" as never, "" as never);
    }
    form.clearErrors();
  }

  async function onSubmit(values: IngestDocumentFormData) {
    setCompletedSteps(-1);

    // Simulate step progress — real progress not exposed by the API
    const stepTimer = setInterval(() => {
      setCompletedSteps((s) => {
        if (s < STEPS.length - 2) return s + 1;
        clearInterval(stepTimer);
        return s;
      });
    }, 400);

    const payload =
      values.mode === "file"
        ? { title: values.title, source: values.source, file: values.file }
        : {
            title: values.title,
            source: values.source,
            content: values.content,
          };

    ingest.mutate(
      { ...payload, source: payload.source || undefined },
      {
        onSuccess: () => {
          clearInterval(stepTimer);
          setCompletedSteps(STEPS.length - 1);
          form.reset({ mode: "text", title: "", content: "", source: "" });
          setTimeout(() => {
            setCompletedSteps(-1);
            onSuccess?.();
          }, 1000);
        },
        onError: () => {
          clearInterval(stepTimer);
          setCompletedSteps(-1);
          form.setError("root", {
            message: "Ingestion failed. Please try again.",
          });
        },
      },
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="My Document" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="source"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Source <span className="text-muted-foreground">(optional)</span>
              </FormLabel>
              <FormControl>
                <Input placeholder="https://example.com/doc" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Tabs value={mode} onValueChange={handleTabChange}>
          <TabsList className="w-full">
            <TabsTrigger value="text" className="flex-1">
              📄 Paste Text
            </TabsTrigger>
            <TabsTrigger value="file" className="flex-1">
              📎 Upload PDF
            </TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="mt-3">
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Paste or type your document text here…"
                      className="min-h-[200px] resize-y font-mono text-sm"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </TabsContent>

          <TabsContent value="file" className="mt-3">
            <FormField
              control={form.control}
              name="file"
              render={({ field, fieldState }) => (
                <FormItem>
                  <PDFDropZone
                    value={field.value as File | null}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                  />
                </FormItem>
              )}
            />
          </TabsContent>
        </Tabs>

        {form.formState.errors.root && (
          <p className="text-sm text-destructive">
            {form.formState.errors.root.message}
          </p>
        )}

        {/* Step indicator */}
        {ingest.isPending && (
          <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-3 text-sm">
            {STEPS.map((step, i) => (
              <span key={step} className="flex items-center gap-1">
                {i < completedSteps + 1 ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                ) : i === completedSteps + 1 ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    i < completedSteps + 1
                      ? "text-green-600 dark:text-green-400"
                      : i === completedSteps + 1
                        ? "text-primary"
                        : "text-muted-foreground",
                  )}
                >
                  {step}
                </span>
                {i < STEPS.length - 1 && (
                  <span className="text-muted-foreground">→</span>
                )}
              </span>
            ))}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={ingest.isPending}>
          {ingest.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Ingesting…
            </>
          ) : (
            "Ingest →"
          )}
        </Button>
      </form>
    </Form>
  );
}
