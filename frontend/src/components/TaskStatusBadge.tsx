import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/types/tasks";

interface TaskStatusBadgeProps {
  status: TaskStatus;
  className?: string;
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; className: string }> =
  {
    PENDING: {
      label: "Pending",
      className: "bg-muted text-muted-foreground",
    },
    RECEIVED: {
      label: "Received",
      className: "bg-muted text-muted-foreground",
    },
    STARTED: {
      label: "In Progress",
      className:
        "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    },
    SUCCESS: {
      label: "Success",
      className:
        "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    },
    FAILURE: {
      label: "Failed",
      className: "bg-destructive/10 text-destructive",
    },
    REVOKED: {
      label: "Revoked",
      className:
        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    },
    RETRY: {
      label: "Retrying",
      className:
        "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    },
  };

export function TaskStatusBadge({ status, className }: TaskStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  return (
    <Badge
      variant="outline"
      className={cn(config.className, "border-transparent", className)}
    >
      {config.label}
    </Badge>
  );
}
