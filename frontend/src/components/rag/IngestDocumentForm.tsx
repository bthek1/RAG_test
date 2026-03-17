import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle, Circle, Loader2, XCircle } from "lucide-react";
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
import { ingestDocument } from "@/api/embeddings";
import { queryKeys } from "@/api/queryKeys";
import { PDFDropZone } from "./PDFDropZone";

const STEPS = ["Chunking", "Embedding", "Storing"] as const;

type FileStatus = "pending" | "processing" | "done" | "error";
interface FileQueueItem {
  file: File;
  status: FileStatus;
  error?: string;
}

function deriveTitleFromFile(
  file: File,
  formTitle: string,
  fileCount: number,
): string {
  if (formTitle.trim() && fileCount === 1) return formTitle.trim();
  const nameWithoutExt = file.name.replace(/\.[^.]+$/, "");
  return nameWithoutExt.replace(/[_-]+/g, " ").trim() || file.name;
}

interface IngestDocumentFormProps {
  onSuccess?: () => void;
}

export function IngestDocumentForm({ onSuccess }: IngestDocumentFormProps) {
  const ingest = useIngestDocument();
  const queryClient = useQueryClient();
  const [completedSteps, setCompletedSteps] = useState<number>(-1);
  const [fileQueue, setFileQueue] = useState<FileQueueItem[]>([]);
  const [isFilesSubmitting, setIsFilesSubmitting] = useState(false);

  const form = useForm<IngestDocumentFormData>({
    resolver: zodResolver(ingestDocumentSchema),
    defaultValues: { mode: "text", title: "", content: "", source: "" },
  });

  const mode = form.watch("mode");
  const selectedFiles = form.watch("file") as File[] | undefined;
  const fileCount = selectedFiles?.length ?? 0;

  function handleTabChange(value: string) {
    if (value === "text") {
      form.setValue("mode", "text");
      form.setValue("file" as never, [] as never);
    } else {
      form.setValue("mode", "file");
      form.setValue("content" as never, "" as never);
    }
    form.clearErrors();
    setFileQueue([]);
  }

  async function onSubmit(values: IngestDocumentFormData) {
    if (values.mode === "file") {
      const files = values.file as File[];
      const queue: FileQueueItem[] = files.map((f) => ({
        file: f,
        status: "pending",
      }));
      setFileQueue(queue);
      setIsFilesSubmitting(true);

      let allSuccess = true;
      for (let i = 0; i < files.length; i++) {
        setFileQueue((q) =>
          q.map((item, idx) =>
            idx === i ? { ...item, status: "processing" } : item,
          ),
        );
        try {
          await ingestDocument({
            title: deriveTitleFromFile(
              files[i],
              values.title ?? "",
              files.length,
            ),
            source: values.source || undefined,
            file: files[i],
          });
          setFileQueue((q) =>
            q.map((item, idx) =>
              idx === i ? { ...item, status: "done" } : item,
            ),
          );
        } catch (err) {
          allSuccess = false;
          const msg = err instanceof Error ? err.message : "Ingestion failed";
          setFileQueue((q) =>
            q.map((item, idx) =>
              idx === i ? { ...item, status: "error", error: msg } : item,
            ),
          );
        }
      }

      await queryClient.invalidateQueries({
        queryKey: queryKeys.embeddings.documents.all,
      });
      setIsFilesSubmitting(false);

      if (allSuccess) {
        setTimeout(() => {
          setFileQueue([]);
          form.reset({ mode: "file", title: "", source: "" });
          onSuccess?.();
        }, 1000);
      }
      return;
    }

    // Text mode — existing logic
    setCompletedSteps(-1);

    const stepTimer = setInterval(() => {
      setCompletedSteps((s) => {
        if (s < STEPS.length - 2) return s + 1;
        clearInterval(stepTimer);
        return s;
      });
    }, 400);

    ingest.mutate(
      {
        title: values.title ?? "",
        source: values.source || undefined,
        content: values.content,
      },
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
              <FormLabel>
                Title
                {mode === "file" && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    (optional)
                  </span>
                )}
              </FormLabel>
              <FormControl>
                <Input
                  placeholder={
                    mode === "file"
                      ? "Leave blank to use filename(s)"
                      : "My Document"
                  }
                  {...field}
                  value={field.value ?? ""}
                />
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
              📎 Upload Files
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
                      className="min-h-50 resize-y font-mono text-sm"
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
                    value={(field.value as File[] | undefined) ?? []}
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

        {/* File queue progress */}
        {fileQueue.length > 0 && (
          <div className="space-y-1.5 rounded-lg bg-muted/60 p-3 text-sm">
            {fileQueue.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                {item.status === "done" ? (
                  <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />
                ) : item.status === "processing" ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                ) : item.status === "error" ? (
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                ) : (
                  <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    item.status === "done"
                      ? "text-green-600 dark:text-green-400"
                      : item.status === "error"
                        ? "text-destructive"
                        : item.status === "processing"
                          ? "text-primary"
                          : "text-muted-foreground",
                  )}
                >
                  {item.file.name}
                </span>
                {item.error && (
                  <span className="shrink-0 text-xs text-destructive">
                    {item.error}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Text-mode step indicator */}
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

        <Button
          type="submit"
          className="w-full"
          disabled={isFilesSubmitting || ingest.isPending}
        >
          {isFilesSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {`Ingesting files…`}
            </>
          ) : ingest.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Ingesting…
            </>
          ) : mode === "file" && fileCount > 1 ? (
            `Ingest ${fileCount} Files →`
          ) : (
            "Ingest →"
          )}
        </Button>
      </form>
    </Form>
  );
}
