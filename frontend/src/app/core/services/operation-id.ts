/** Identifies a command for output streaming and cancellation. */
export function newOperationId(): string {
  return `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
