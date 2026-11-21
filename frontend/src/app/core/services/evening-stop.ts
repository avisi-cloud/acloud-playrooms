import { PlayroomLifecycleService } from './playroom-lifecycle';
import { PlayroomStateService } from './playroom-state';
import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { ScheduleAction, ScheduleEvent, ScheduleSettings, wailsApi } from './wails-api';
import { ToastService } from './toast';

@Injectable({ providedIn: 'root' })
export class EveningStopService {
  private readonly dismissed = new Set<string>();
  private readonly notify = inject(ToastService);
  private readonly state = inject(PlayroomStateService);
  private readonly lifecycle = inject(PlayroomLifecycleService);
  readonly settings = signal<ScheduleSettings | null>(null);
  readonly notices = signal<ScheduleEvent[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');

  constructor() {
    const state = this.state;
    let writes = Promise.resolve();
    effect(() => {
      state.scopeRevision();
      const playhouse = state.loggedIn() && state.user() ? state.playhouse() : '';
      writes = writes
        .then(() => wailsApi.setSchedulePlayhouse(playhouse))
        .catch((error) => console.warn('Could not select the evening stop playhouse', error));
    });
    const off = wailsApi.onScheduleNotice((event) => this.receive(event));
    const refresh = setInterval(() => {
      void wailsApi
        .getScheduleNotices()
        .then((notices) =>
          this.notices.set(notices.filter((notice) => !this.dismissed.has(notice.ID))),
        )
        .catch((error) => console.warn('Could not refresh playroom reminders', error));
    }, 15_000);
    inject(DestroyRef).onDestroy(() => {
      off();
      clearInterval(refresh);
    });
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.settings.set(await wailsApi.getScheduleSettings());
      for (const notice of await wailsApi.getScheduleNotices()) this.receive(notice);
    } catch (error) {
      this.error.set('Could not load evening stop settings. Try reopening Settings.');
      this.notify.failure('Could not load evening stop settings', error);
    }
  }

  private receive(event: ScheduleEvent): void {
    if (this.dismissed.has(event.ID)) return;
    this.notices.update((notices) => [...notices.filter((entry) => entry.ID !== event.ID), event]);
  }

  async save(change: Partial<ScheduleSettings>): Promise<void> {
    const current = this.settings();
    if (!current || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const next = { ...current, ...change };
      await wailsApi.setScheduleSettings(next);
      this.settings.set(next);
    } catch (error) {
      this.error.set('Could not save evening stop settings. Check the values and try again.');
      this.notify.failure('Could not save evening stop settings', error);
    } finally {
      this.busy.set(false);
    }
  }

  async act(id: string, action: ScheduleAction): Promise<void> {
    if (this.busy()) return;
    const selection = this.state.captureSelection();
    this.busy.set(true);
    try {
      await wailsApi.runScheduleAction(id, action);
      if (action === 'stop' && selection.playhouse && this.state.isCurrentSelection(selection)) {
        await this.lifecycle.reload(selection.playhouse, selection);
      }
      this.dismiss(id);
    } catch (error) {
      this.notify.failure('Could not apply evening stop action', error);
    } finally {
      this.busy.set(false);
    }
  }

  dismiss(id: string): void {
    this.dismissed.add(id);
    this.notices.update((notices) => notices.filter((notice) => notice.ID !== id));
  }
}
