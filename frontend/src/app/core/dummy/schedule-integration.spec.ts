import type { dummyApi as apiType } from './dummy-api';
import type { ScheduleEvent } from '../services/wails-api-live';

describe('dummy schedule integration', () => {
  let api: typeof apiType;
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    localStorage.clear();
    window.history.replaceState(null, '', '/rooms');
    api = (await import('./dummy-api')).dummyApi;
  });
  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
  });
  it('preserves the default editor-open failure used by the health check flow', async () => {
    const result = api
      .openPlayroomInEditor('open', {
        Name: 'api-development',
        Playhouse: 'playhouse-platform-dev',
      })
      .catch((error) => error as Error);
    await vi.advanceTimersByTimeAsync(800);
    expect(await result).toBeInstanceOf(Error);
    expect(((await result) as Error).message).toContain('this action is not simulated');
  });
  it('waits for the simulated Stop and returns the stopped room from the next list read', async () => {
    window.history.replaceState(null, '', '/rooms?schedule=idle');
    const notices: ScheduleEvent[] = [];
    const off = api.onScheduleNotice((event) => notices.push(event));
    try {
      await vi.advanceTimersByTimeAsync(5000);
      const notice = notices.find(
        (event) => event.Kind === 'idle' && event.Rooms[0].Name === 'api-development',
      )!;
      expect(notice).toBeDefined();
      const action = api.runScheduleAction(notice.ID, 'stop');
      await vi.advanceTimersByTimeAsync(800);
      await action;
      const read = api.listPlayrooms({ Playhouse: 'playhouse-platform-dev' });
      await vi.advanceTimersByTimeAsync(160);
      expect((await read).find((room) => room.Name === 'api-development')?.Status).toBe('Stopped');
      expect(
        (await read).find(
          (room) => room.Name === 'workspace-with-a-long-name-for-layout-experiments',
        )?.Status,
      ).toBe('Ready');
    } finally {
      off();
    }
  });
  it('records successful preview editor opens as app connections', async () => {
    window.history.replaceState(null, '', '/rooms?schedule=idle');
    const notices: ScheduleEvent[] = [];
    const off = api.onScheduleNotice((event) => notices.push(event));
    try {
      await vi.advanceTimersByTimeAsync(3000);
      const open = api.openPlayroomInEditor('open', {
        Name: 'api-development',
        Playhouse: 'playhouse-platform-dev',
      });
      await vi.advanceTimersByTimeAsync(800);
      await open;
      await vi.advanceTimersByTimeAsync(3000);
      expect(
        notices.some((event) => event.Kind === 'idle' && event.Rooms[0].Name === 'api-development'),
      ).toBe(false);
      await vi.advanceTimersByTimeAsync(1000);
      expect(
        notices.some((event) => event.Kind === 'idle' && event.Rooms[0].Name === 'api-development'),
      ).toBe(true);
    } finally {
      off();
    }
  });
});
