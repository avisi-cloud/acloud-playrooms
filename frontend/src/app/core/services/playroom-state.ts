import { Injectable, signal } from '@angular/core';
import { Playroom, Theme } from '../../shared/models';
import { readCache, updateCache } from '../../shared/utils';

@Injectable({ providedIn: 'root' })
export class PlayroomStateService {
  private readonly _playhouse = signal<string>('');
  private readonly _user = signal<string>('');
  private readonly _loggedIn = signal<boolean>(false);
  private readonly _theme = signal<Theme>('dark');
  private readonly _roomsCount = signal<number>(0);
  private readonly _rooms = signal<Playroom[]>([]);
  private readonly _roomsLoadedFor = signal<string | null>(null);
  private readonly _scopeRevision = signal<number>(0);

  readonly playhouse = this._playhouse.asReadonly();
  readonly user = this._user.asReadonly();
  readonly loggedIn = this._loggedIn.asReadonly();
  readonly theme = this._theme.asReadonly();
  readonly roomsCount = this._roomsCount.asReadonly();
  readonly rooms = this._rooms.asReadonly();

  /**
   * The playhouse whose rooms `rooms` currently holds, null until the first read
   * lands. Here rather than on the list screen, which navigation destroys.
   */
  readonly roomsLoadedFor = this._roomsLoadedFor.asReadonly();

  /**
   * Bumped every time the CLI context or organisation changes, so screens reload
   * rather than trusting what belonged to the scope being left.
   */
  readonly scopeRevision = this._scopeRevision.asReadonly();

  constructor() {
    const cache = readCache();
    if (cache.lastPlayhouse) this._playhouse.set(cache.lastPlayhouse);
    const theme = cache.lastTheme ?? 'dark';
    this._theme.set(theme);
    this.applyDarkMode(theme);
  }

  selectPlayhouse(slug: string): void {
    // A different playhouse invalidates the list, so the next visit loads
    // again rather than showing the previous playhouse's rooms.
    if (slug !== this._playhouse()) this._roomsLoadedFor.set(null);
    this._playhouse.set(slug);
    updateCache({ lastPlayhouse: slug });
  }

  setUser(user: string): void {
    this._user.set(user);
  }
  setLoggedIn(loggedIn: boolean): void {
    this._loggedIn.set(loggedIn);
  }
  setRoomsCount(n: number): void {
    this._roomsCount.set(n);
  }
  setRooms(rooms: Playroom[]): void {
    this._rooms.set(rooms);
  }

  /** Records that a `playroom list` for this playhouse has come back. */
  markRoomsLoaded(playhouse: string): void {
    this._roomsLoadedFor.set(playhouse);
  }

  /** Records that the context or organisation moved. */
  noteScopeChange(): void {
    this._scopeRevision.update((revision) => revision + 1);
  }

  toggleTheme(): void {
    const next: Theme = this._theme() === 'dark' ? 'light' : 'dark';
    this._theme.set(next);
    this.applyDarkMode(next);
    updateCache({ lastTheme: next });
  }

  private applyDarkMode(theme: Theme): void {
    document.documentElement.classList.toggle('app-dark', theme === 'dark');
  }
}
