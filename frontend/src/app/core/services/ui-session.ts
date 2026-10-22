import { Injectable, effect, inject, signal } from '@angular/core';
import { PlayroomStateService } from './playroom-state';

/** Navigation and unfinished forms survive screen destruction, never an app restart.
 * In particular, environment values must not be written to localStorage. */
@Injectable({ providedIn: 'root' })
export class UiSessionService {
  private readonly state = inject(PlayroomStateService);
  private readonly drafts = new Map<string, unknown>();
  readonly query = signal('');
  readonly mineOnly = signal(false);
  readonly status = signal('');
  readonly sort = signal('name');
  readonly compact = signal(false);
  scrollTop = 0;

  constructor() {
    effect(() => {
      this.state.scopeRevision();
      this.state.playhouse();
      this.drafts.clear();
      this.query.set('');
      this.mineOnly.set(false);
      this.status.set('');
      this.sort.set('name');
      this.compact.set(false);
      this.scrollTop = 0;
    });
  }

  remember<T>(key: string, value: T): void {
    this.drafts.set(key, structuredClone(value));
  }
  recall<T>(key: string): T | undefined {
    const value = this.drafts.get(key);
    return value === undefined ? undefined : (structuredClone(value) as T);
  }
  forget(key: string): void {
    this.drafts.delete(key);
  }
}
