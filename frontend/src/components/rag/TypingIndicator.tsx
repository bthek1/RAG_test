export function TypingIndicator() {
  return (
    <div
      className="flex items-center gap-1 px-1 py-2"
      aria-label="Claude is thinking"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 animate-bounce rounded-full bg-muted-foreground"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}
