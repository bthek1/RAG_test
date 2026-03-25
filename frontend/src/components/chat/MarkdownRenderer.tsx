import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({
  content,
  className,
}: MarkdownRendererProps) {
  return (
    <div
      className={cn("prose prose-sm max-w-none dark:prose-invert", className)}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className: codeClass, children, ...props }) {
            const isBlock = codeClass?.includes("language-");
            return isBlock ? (
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-sm">
                <code className={codeClass} {...props}>
                  {children}
                </code>
              </pre>
            ) : (
              <code
                className="rounded bg-muted px-1 py-0.5 font-mono text-sm"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
