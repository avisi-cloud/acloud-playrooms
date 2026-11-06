import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Playroom, Theme, ThemePreference } from '../../shared/models';
import { readCache, updateCache } from '../../shared/utils';

export interface PlayroomSelection {
  playhouse: string;
  scopeRevision: number;
  selectionRevision: number;
}

@Injectable({ providedIn: 'root' })
export class PlayroomStateService {
  private readonly _playhouse = signal<string>('');
  private readonly _user = signal<string>('');
  private readonly _loggedIn = signal<boolean>(false);
  private readonly _theme = signal<Theme>('dark');
  private readonly _themePreference = signal<ThemePreference>('dark');
  private readonly systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly _backgroundGrain = signal<boolean>(true);
  private readonly _ameRobot = signal<boolean>(true);
  private readonly _roomsCount = signal<number>(0);
  private readonly _rooms = signal<Playroom[]>([]);
  private readonly _roomsLoadedFor = signal<string | null>(null);
  private readonly _scopeRevision = signal<number>(0);
  private readonly selectionRevision = signal(0);

  readonly playhouse = this._playhouse.asReadonly();
  readonly user = this._user.asReadonly();
  readonly loggedIn = this._loggedIn.asReadonly();
  readonly theme = this._theme.asReadonly();
  readonly themePreference = this._themePreference.asReadonly();
  readonly backgroundGrain = this._backgroundGrain.asReadonly();
  readonly ameRobot = this._ameRobot.asReadonly();
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
    this._backgroundGrain.set(cache.backgroundGrain);
    this._ameRobot.set(cache.ameRobot);
    if (cache.lastPlayhouse) this._playhouse.set(cache.lastPlayhouse);
    this._themePreference.set(cache.lastTheme);
    this.applyThemePreference();
    const onSystemThemeChange = () => this.applyThemePreference();
    this.systemDarkMode.addEventListener('change', onSystemThemeChange);
    inject(DestroyRef).onDestroy(() =>
      this.systemDarkMode.removeEventListener('change', onSystemThemeChange),
    );
  }

  selectPlayhouse(slug: string): void {
    // A different playhouse invalidates the list, so the next visit loads
    // again rather than showing the previous playhouse's rooms.
    if (slug !== this._playhouse()) {
      this._roomsLoadedFor.set(null);
      this._rooms.set([]);
      this._roomsCount.set(0);
      this.selectionRevision.update((revision) => revision + 1);
    }
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
    this._roomsLoadedFor.set(null);
    this._scopeRevision.update((revision) => revision + 1);
  }

  captureSelection(): PlayroomSelection {
    return {
      playhouse: this.playhouse(),
      scopeRevision: this.scopeRevision(),
      selectionRevision: this.selectionRevision(),
    };
  }

  isCurrentSelection(selection: PlayroomSelection): boolean {
    return (
      selection.playhouse === this.playhouse() &&
      selection.scopeRevision === this.scopeRevision() &&
      selection.selectionRevision === this.selectionRevision()
    );
  }

  setThemePreference(themePreference: ThemePreference): void {
    this._themePreference.set(themePreference);
    this.applyThemePreference();
    updateCache({ lastTheme: themePreference });
  }

  setBackgroundGrain(backgroundGrain: boolean): void {
    this._backgroundGrain.set(backgroundGrain);
    updateCache({ backgroundGrain });
  }

  setAmeRobot(ameRobot: boolean): void {
    this._ameRobot.set(ameRobot);
    updateCache({ ameRobot });
  }

  private applyThemePreference(): void {
    const themePreference = this._themePreference();
    const systemTheme: Theme = this.systemDarkMode.matches ? 'dark' : 'light';
    const theme = themePreference === 'system' ? systemTheme : themePreference;
    this._theme.set(theme);
    document.documentElement.classList.toggle('app-dark', theme === 'dark');
  }
}
