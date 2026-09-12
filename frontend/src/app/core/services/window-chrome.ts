import { Injectable, Injector, effect, inject } from '@angular/core';
import { PlayroomStateService } from './playroom-state';
import { wailsApi } from './wails-api';

/** The gap the macOS traffic lights need at the top of the sidebar. */
const TRAFFIC_LIGHT_GAP = '38px';
const NO_TRAFFIC_LIGHT_GAP = '0px';

/**
 * Keeps the native window in step with the app: the space its controls need, and
 * the background behind the page, which CSS reaches too late to paint.
 */
@Injectable({ providedIn: 'root' })
export class WindowChromeService {
  private readonly state = inject(PlayroomStateService);
  private readonly injector = inject(Injector);

  /** Called once at startup, from the shell. */
  matchWindowChromeToPlatformAndTheme(): void {
    this.reserveSpaceForNativeWindowControls();
    this.keepNativeWindowBackgroundOnCurrentTheme();
  }

  /**
   * Sizes the sidebar's top gap to the chrome the window actually has. Guessed
   * synchronously from the user agent, then confirmed by the backend.
   */
  private reserveSpaceForNativeWindowControls(): void {
    const looksLikeMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
    this.applyTrafficLightGap(looksLikeMac);
    void wailsApi
      .getOperatingSystem()
      .then((platform) => this.applyTrafficLightGap(platform === 'darwin'))
      .catch(() => {
        /* the user-agent guess stands */
      });
  }

  private applyTrafficLightGap(isMac: boolean): void {
    document.documentElement.style.setProperty(
      '--traffic-zone-height',
      isMac ? TRAFFIC_LIGHT_GAP : NO_TRAFFIC_LIGHT_GAP,
    );
  }

  /** Once now, and again on every theme toggle. */
  private keepNativeWindowBackgroundOnCurrentTheme(): void {
    this.sendThemeToWindow(this.state.theme());
    effect(() => this.sendThemeToWindow(this.state.theme()), { injector: this.injector });
  }

  private sendThemeToWindow(theme: string): void {
    void wailsApi.setWindowTheme(theme).catch(() => {
      /* cosmetic only: the page still renders in the right theme */
    });
  }
}
