import { Injectable, computed, signal } from '@angular/core';

/**
 * Whether a screen is waiting for its first data, which the shell shows on the
 * breathing brand mark. Polled and background reads stay out of it.
 */
@Injectable({ providedIn: 'root' })
export class PageLoadingService {
  /** A count, not a flag: a screen can start a second load before the first lands. */
  private readonly pending = signal(0);

  readonly active = computed(() => this.pending() > 0);

  /**
   * Runs `work`, showing the indicator only when `show` is true — the caller
   * decides which of its reads are first loads and which are refreshes.
   */
  async runAndShowIndicatorIf<T>(showIndicator: boolean, work: () => Promise<T>): Promise<T> {
    if (!showIndicator) return work();
    this.pending.update((count) => count + 1);
    try {
      return await work();
    } finally {
      this.pending.update((count) => Math.max(0, count - 1));
    }
  }
}
