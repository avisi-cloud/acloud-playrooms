import { dummyActivityOutput } from './fixtures';
import type { CliEvent } from '../services/cli-console';

type ActivityEventName = 'cli:started' | 'cli:output' | 'cli:done';
type ActivityListener = (name: ActivityEventName, event: CliEvent) => void;
const listeners = new Set<ActivityListener>();

export function onDummyActivityEvent(listener: ActivityListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Dummy events illustrate the activity UI without contacting Wails or acloud.
export async function simulateActivity<T>(
  operationId: string,
  command: string[],
  action: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const emit = (name: ActivityEventName, event: CliEvent) =>
    listeners.forEach((listener) => listener(name, { operationId, ...event }));
  emit('cli:started', { command: ['dummy-preview', ...command], startedAt });
  for (const line of dummyActivityOutput) emit('cli:output', { stream: 'stdout', line });
  try {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const result = await action();
    emit('cli:done', {
      startedAt,
      endedAt: new Date().toISOString(),
      durationMilliseconds: Date.now() - started,
      exitCode: 0,
    });
    return result;
  } catch (error) {
    emit('cli:done', {
      startedAt,
      endedAt: new Date().toISOString(),
      durationMilliseconds: Date.now() - started,
      exitCode: 1,
      error: String(error),
    });
    throw error;
  }
}
