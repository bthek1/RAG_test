/** Convert pgvector cosine distance [0, 2] to similarity percentage [0, 100]. */
export function toSimilarityPercent(distance: number): number {
  return Math.round(Math.max(0, Math.min(100, (1 - distance) * 100)));
}

/** Return a Tailwind text-colour class based on similarity percentage. */
export function getSimilarityColor(pct: number): string {
  if (pct >= 80) return "text-green-600 dark:text-green-400";
  if (pct >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}
