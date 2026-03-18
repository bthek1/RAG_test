import { useEffect, useRef, useState } from "react";

import { apiClient } from "@/api/client";
import type { TaskResult, TaskStatus } from "@/types/tasks";

const TERMINAL_STATUSES: TaskStatus[] = ["SUCCESS", "FAILURE", "REVOKED"];

export function useTaskPoller<T = unknown>(
  taskId: string | null,
  intervalMs = 2000,
): TaskResult<T> | null {
  const [result, setResult] = useState<TaskResult<T> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!taskId) return;

    const poll = async () => {
      try {
        const { data } = await apiClient.get<TaskResult<T>>(
          `/api/embeddings/tasks/${taskId}/`,
        );
        setResult(data);

        if (TERMINAL_STATUSES.includes(data.status)) {
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch {
        // Silently ignore transient errors — polling will retry next interval
      }
    };

    void poll();
    intervalRef.current = setInterval(() => void poll(), intervalMs);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [taskId, intervalMs]);

  return result;
}
