import { DummySchedule } from './schedule';

describe('dummy schedule', () => {
  const rooms = [{ Key: 'scope/ph/demo', Name: 'demo', Playhouse: 'ph' }];
  beforeEach(() => localStorage.clear());
  function fixture() {
    const stop = vi.fn().mockResolvedValue(undefined);
    const schedule = new DummySchedule(() => rooms, stop);
    schedule.configure({ Enabled: true, Time: '22:00', Days: 'weekdays', IdleHours: 4 });
    return { schedule, stop };
  }
  it('warns, snoozes, then stops through the dummy stop path', async () => {
    const { schedule, stop } = fixture();
    schedule.advance(1);
    expect(schedule.notices[0].Kind).toBe('warning');
    expect(schedule.notices[0].Title).toBe('demo stops at 22:00');
    await schedule.act(schedule.notices[0].ID, 'snooze');
    for (let index = 0; index < 69; index++) schedule.advance(1);
    expect(stop).not.toHaveBeenCalled();
    schedule.advance(1);
    expect(stop).toHaveBeenCalledWith(rooms[0]);
  });
  it('persists opt-outs and keeps running tonight', async () => {
    const { schedule, stop } = fixture();
    schedule.keep(rooms[0].Key, true);
    expect(new DummySchedule(() => rooms, stop).kept).toEqual([rooms[0].Key]);
    schedule.advance(1);
    expect(schedule.notices).toEqual([]);
    schedule.keep(rooms[0].Key, false);
    schedule.configure({ ...schedule.settings, Time: '22:00' });
    schedule.advance(1);
    await schedule.act(schedule.notices[0].ID, 'keep-tonight');
    for (let index = 0; index < 10; index++) schedule.advance(1);
    expect(stop).not.toHaveBeenCalled();
  });
  it('asks before a missed stop and remembers connections for idle reminders', async () => {
    const { schedule, stop } = fixture();
    schedule.advance(1);
    schedule.connected(rooms[0].Key);
    schedule.advance(120);
    expect(stop).not.toHaveBeenCalled();
    const missed = schedule.notices.find((notice) => notice.Kind === 'missed')!;
    await schedule.act(missed.ID, 'stop');
    expect(stop).toHaveBeenCalledOnce();
    schedule.advance(120);
    expect(schedule.notices.find((notice) => notice.Kind === 'idle')?.Title).toContain(
      'No connection from this app for 4 hours',
    );
  });
  it('allows an explicit idle Stop on a room exempt from automatic evening stops', async () => {
    const { schedule, stop } = fixture();
    schedule.keep(rooms[0].Key, true);
    schedule.advance(1);
    schedule.advance(240);
    const idle = schedule.notices.find((notice) => notice.Kind === 'idle')!;
    await schedule.act(idle.ID, 'stop');
    expect(stop).toHaveBeenCalledWith(rooms[0]);
  });
  it('starts a newly enabled fast preview before its warning regardless of startup delay', () => {
    window.history.replaceState(null, '', '/settings?schedule=fast');
    try {
      const schedule = new DummySchedule(() => rooms, vi.fn().mockResolvedValue(undefined));
      schedule.advance(30);
      schedule.configure({ ...schedule.settings, Enabled: true });
      schedule.advance(1);
      expect(schedule.notices.find((notice) => notice.Kind === 'warning')?.Title).toBe(
        'demo stops at 22:00',
      );
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
  it('uses the saved stop time after reloading the dummy preview', () => {
    const { schedule, stop } = fixture();
    schedule.configure({ ...schedule.settings, Time: '22:30' });
    const reloaded = new DummySchedule(() => rooms, stop);
    for (let index = 0; index < 31; index++) reloaded.advance(1);
    expect(reloaded.notices.find((notice) => notice.Kind === 'warning')?.Title).toBe(
      'demo stops at 22:30',
    );
    expect(stop).not.toHaveBeenCalled();
  });
});
