import { onDummyActivityEvent, simulateActivity } from './activity-events';
import { CliEvent } from '../services/cli-console';

describe('Dummy activity events', () => {
  afterEach(() => vi.useRealTimers());

  it('streams a long illustrative log, then reports timing and success', async () => {
    vi.useFakeTimers();
    const events: { name: string; data: CliEvent }[] = [];
    const off = onDummyActivityEvent((name, data) => events.push({ name, data }));
    try {
      const result = simulateActivity('demo', ['playroom', 'start', 'demo'], async () => 'result');
      expect(events[0]).toMatchObject({
        name: 'cli:started',
        data: { command: ['dummy-preview', 'playroom', 'start', 'demo'] },
      });
      expect(events.filter((event) => event.name === 'cli:output').length).toBeGreaterThan(20);
      await vi.advanceTimersByTimeAsync(800);
      expect(await result).toBe('result');
      expect(events.at(-1)).toMatchObject({
        name: 'cli:done',
        data: { operationId: 'demo', exitCode: 0, durationMilliseconds: 800 },
      });
      expect(events.at(-1)?.data.startedAt).toBe(events[0].data.startedAt);
      expect(events.at(-1)?.data.endedAt).toBeTruthy();
    } finally {
      off();
    }
  });

  it('reports a failure and rethrows it without invoking removed subscribers', async () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    const removed = vi.fn();
    const off = onDummyActivityEvent(listener);
    onDummyActivityEvent(removed)();
    try {
      const result = simulateActivity('failed', ['playroom', 'open'], async () => {
        throw new Error('Dummy failure');
      });
      const rejection = expect(result).rejects.toThrow('Dummy failure');
      await vi.advanceTimersByTimeAsync(800);
      await rejection;
      expect(listener).toHaveBeenLastCalledWith(
        'cli:done',
        expect.objectContaining({ exitCode: 1, error: 'Error: Dummy failure' }),
      );
      expect(removed).not.toHaveBeenCalled();
    } finally {
      off();
    }
  });
});
