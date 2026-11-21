import type { ScheduleAction, ScheduleEvent, ScheduleSettings } from '../services/wails-api-live';

export class DummySchedule {
  private readonly storageKey = 'acloud-dummy-schedule';
  settings: ScheduleSettings = { Enabled: false, Time: '22:00', Days: 'weekdays', IdleHours: 4 };
  kept: string[] = [];
  notices: ScheduleEvent[] = [];
  private listeners = new Set<(event: ScheduleEvent) => void>();
  private timer?: ReturnType<typeof setInterval>;
  private minute = 21 * 60 + 49;
  private due = 22 * 60;
  private warned = false;
  private handled = false;
  private idle = new Map<string, number>();
  private reminded = new Set<string>();

  constructor(
    private readonly runningRooms: () => { Key: string; Name: string; Playhouse: string }[],
    private readonly stop: (room: { Name: string; Playhouse: string }) => Promise<void>,
  ) {
    const saved = localStorage.getItem(this.storageKey);
    if (saved) {
      const stored = JSON.parse(saved) as { settings: ScheduleSettings; kept: string[] };
      this.settings = stored.settings;
      this.kept = stored.kept;
    }
    const [hour, minute] = this.settings.Time.split(':').map(Number);
    this.due = hour * 60 + minute;
    this.handled = this.minute >= this.due;
  }

  private persist(): void {
    localStorage.setItem(
      this.storageKey,
      JSON.stringify({ settings: this.settings, kept: this.kept }),
    );
  }

  configure(settings: ScheduleSettings): void {
    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.Time) ||
      !['weekdays', 'every-day'].includes(settings.Days) ||
      !Number.isInteger(settings.IdleHours) ||
      settings.IdleHours < 1 ||
      settings.IdleHours > 168
    )
      throw new Error('Choose a valid time, days and 1–168 idle hours.');
    const wasEnabled = this.settings.Enabled;
    this.settings = { ...settings };
    // Starting the fast preview before its warning makes page load time irrelevant.
    if (
      !wasEnabled &&
      settings.Enabled &&
      new URLSearchParams(window.location.search).get('schedule') === 'fast'
    )
      this.minute = 21 * 60 + 49;
    const [hour, minute] = settings.Time.split(':').map(Number);
    this.due = hour * 60 + minute;
    this.warned = false;
    this.handled = this.minute >= this.due;
    this.notices = [];
    this.persist();
  }

  keep(key: string, keep: boolean): void {
    this.kept = [...this.kept.filter((entry) => entry !== key), ...(keep ? [key] : [])];
    this.persist();
  }

  connected(key: string): void {
    this.idle.set(key, this.minute);
    this.reminded.delete(key);
  }

  subscribe(receive: (event: ScheduleEvent) => void): () => void {
    this.listeners.add(receive);
    const scenario = new URLSearchParams(window.location.search).get('schedule');
    if (scenario && ['fast', 'idle', 'missed'].includes(scenario) && !this.timer) {
      this.timer = setInterval(
        () => this.advance(scenario === 'fast' ? 1 : scenario === 'idle' ? 60 : 120),
        1000,
      );
    }
    return () => {
      this.listeners.delete(receive);
      if (!this.listeners.size) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    };
  }

  private emit(event: ScheduleEvent): void {
    this.notices.push(event);
    for (const receive of this.listeners) receive(event);
  }

  advance(minutes: number): void {
    this.minute += minutes;
    const rooms = this.runningRooms();
    for (const room of rooms) {
      if (!this.idle.has(room.Key)) this.idle.set(room.Key, this.minute);
      if (
        !this.reminded.has(room.Key) &&
        this.minute - this.idle.get(room.Key)! >= this.settings.IdleHours * 60
      ) {
        this.emit({
          ID: crypto.randomUUID(),
          Kind: 'idle',
          Title: `${room.Name}: No connection from this app for ${this.settings.IdleHours} hours`,
          Rooms: [room],
        });
        this.reminded.add(room.Key);
      }
    }
    if (!this.settings.Enabled || this.handled) return;
    const eligible = rooms.filter((room) => !this.kept.includes(room.Key));
    if (this.minute >= this.due) {
      this.handled = true;
      this.notices = this.notices.filter((notice) => notice.Kind !== 'warning');
      if (minutes > 1)
        this.emit({
          ID: crypto.randomUUID(),
          Kind: 'missed',
          Title: 'Evening stop was missed',
          Rooms: eligible,
        });
      else for (const room of eligible) void this.stop(room);
    } else if (!this.warned && this.minute >= this.due - 10 && eligible.length) {
      this.warned = true;
      this.emit({
        ID: crypto.randomUUID(),
        Kind: 'warning',
        Title: `${eligible[0].Name}${eligible.length === 1 ? ' stops' : ` and ${eligible.length - 1} more stop`} at ${String(Math.floor(this.due / 60) % 24).padStart(2, '0')}:${String(this.due % 60).padStart(2, '0')}`,
        Rooms: eligible,
      });
    }
  }

  async act(id: string, action: ScheduleAction): Promise<void> {
    const notice = this.notices.find((entry) => entry.ID === id);
    if (!notice) return;
    if (notice.Kind === 'warning' && this.minute < this.due && !this.handled) {
      if (action === 'snooze') {
        this.due += 60;
        this.warned = false;
      } else if (action === 'keep-tonight') this.handled = true;
      else return;
    } else if (notice.Kind !== 'warning' && action === 'stop') {
      const running = this.runningRooms();
      for (const room of notice.Rooms) {
        if (running.some((current) => current.Key === room.Key)) await this.stop(room);
      }
    } else return;
    this.notices = this.notices.filter((entry) => entry.ID !== id);
  }
}
