export type TaskStatus =
  | "PENDING"
  | "RECEIVED"
  | "STARTED"
  | "SUCCESS"
  | "FAILURE"
  | "REVOKED"
  | "RETRY";

export interface TaskResult<T = unknown> {
  task_id: string;
  status: TaskStatus;
  result: T | null;
  traceback: string | null;
}
