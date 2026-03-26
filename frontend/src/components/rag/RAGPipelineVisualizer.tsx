import { cn } from "@/lib/utils";
import { PipelineStep, type PipelineStepState } from "./PipelineStep";

export interface RAGPipelineStates {
  embedding?: PipelineStepState;
  search?: PipelineStepState;
  generation?: PipelineStepState;
}

interface RAGPipelineVisualizerProps {
  liveStates?: RAGPipelineStates;
  className?: string;
}

function StepArrow({ active = false }: { active?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0 py-0.5">
      <div
        className={cn(
          "h-4 w-0.5 transition-colors duration-300",
          active ? "bg-primary" : "bg-border",
        )}
      />
      <div
        className={cn(
          "border-x-[5px] border-t-[6px] border-x-transparent transition-colors duration-300",
          active ? "border-t-primary" : "border-t-border",
        )}
      />
    </div>
  );
}

export function RAGPipelineVisualizer({
  liveStates,
  className,
}: RAGPipelineVisualizerProps) {
  const isLive = !!liveStates;
  const embeddingState = liveStates?.embedding ?? "idle";
  const searchState = liveStates?.search ?? "idle";
  const generationState = liveStates?.generation ?? "idle";

  return (
    <div className={cn("grid grid-cols-1 gap-6 md:grid-cols-2", className)}>
      {/* ── Ingestion Pipeline ── */}
      <div className="flex flex-col items-center gap-0 rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Ingestion Pipeline
        </h3>
        <PipelineStep
          icon="📄"
          label="Document Text"
          description="Raw text you provide"
        />
        <StepArrow />
        <PipelineStep
          icon="✂️"
          label="Chunker"
          description="chunk_size=512  overlap=64"
        />
        <StepArrow />
        <div className="flex gap-1">
          {["C1", "C2", "C3", "…"].map((c) => (
            <span
              key={c}
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono font-semibold text-muted-foreground"
            >
              {c}
            </span>
          ))}
        </div>
        <StepArrow />
        <PipelineStep
          icon="🧠"
          label="Embedder"
          description="BAAI/bge-large-en-v1.5"
          highlighted
        />
        <StepArrow />
        <PipelineStep
          icon="🗄️"
          label="pgvector DB"
          description="HNSW index  m=16  ef=64"
        />
      </div>

      {/* ── Query Pipeline ── */}
      <div className="flex flex-col items-center gap-0 rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Query Pipeline
        </h3>
        <PipelineStep
          icon="❓"
          label="User Query"
          description="Your question"
        />
        <StepArrow active={isLive} />
        <PipelineStep
          icon="🧠"
          label="Embedder"
          description="same model as ingestion"
          highlighted
          state={embeddingState}
        />
        <StepArrow active={embeddingState === "done"} />
        <PipelineStep
          icon="🔍"
          label="HNSW Search"
          description="cosine similarity"
          state={searchState}
        />
        <StepArrow active={searchState === "done"} />
        <PipelineStep
          icon="📊"
          label="Top-k Chunks"
          description="ranked by distance score"
          state={searchState}
        />
        <StepArrow active={searchState === "done"} />
        <PipelineStep
          icon="📝"
          label="Context"
          description="joined chunk text"
        />
        <StepArrow active={searchState === "done"} />
        <PipelineStep
          icon="🤖"
          label="Claude LLM"
          description="claude-opus-4-5"
          state={generationState}
        />
        <StepArrow active={generationState === "done"} />
        <PipelineStep
          icon="💬"
          label="Answer + Sources"
          description="grounded, cited response"
          state={generationState === "done" ? "done" : "idle"}
        />
      </div>

      {/* ── Shared embedder callout ── */}
      <div className="col-span-full rounded-lg border border-primary/30 bg-primary/5 p-3 text-center text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">
          🧠 Same embedding model
        </span>{" "}
        is used for both ingestion and query — this ensures chunk vectors and
        query vectors live in the same semantic space, making cosine similarity
        meaningful.
      </div>
    </div>
  );
}
