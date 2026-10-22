import { Injectable, signal } from '@angular/core';
import { PlayroomDefaultEntry, wailsApi } from './wails-api';

/**
 * The user's effective `playroom config` defaults, so forms open on what the
 * user configured. The precedence between the sources stays the CLI's.
 */
@Injectable({ providedIn: 'root' })
export class PlayroomDefaultsService {
  private readonly _entries = signal<PlayroomDefaultEntry[]>([]);
  readonly entries = this._entries.asReadonly();

  /** The in-flight or completed load, so concurrent callers share one request. */
  private pending: Promise<void> | null = null;
  private revision = 0;

  /**
   * Shares successful reads; failed or invalidated reads must never become cached defaults.
   */
  loadConfiguredDefaultsOnce(): Promise<void> {
    const revision = this.revision;
    this.pending ??= wailsApi
      .getPlayroomDefaults()
      .then((entries) => {
        if (revision === this.revision) this._entries.set(entries);
      })
      .catch((error) => {
        if (revision === this.revision) this.pending = null;
        throw error;
      });
    return this.pending;
  }

  /** Drops the cache, so the next load re-reads. The Defaults screen calls it. */
  forgetCachedDefaults(): void {
    this.revision++;
    this.pending = null;
    this._entries.set([]);
  }

  /**
   * The effective value for a key: what the user configured, else the built-in.
   * `fallback` covers a key this build of the CLI does not know about.
   */
  configuredText(key: string, fallback = ''): string {
    const entry = this._entries().find((defaultEntry) => defaultEntry.Key === key);
    if (!entry) return fallback;
    return entry.Value || entry.Builtin || fallback;
  }

  /** The effective value for a boolean key. */
  configuredToggle(key: string, fallback: boolean): boolean {
    const raw = this.configuredText(key, '').trim().toLowerCase();
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return fallback;
  }
}
