import { DestroyRef, Injectable, NgZone, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PlayroomStateService } from './playroom-state';
import { wailsApi } from './wails-api';

export const SHORTCUTS = [
  { action: 'new-playroom', label: 'New Playroom', key: 'n', command: true, keys: '⌘N' },
  { action: 'refresh', label: 'Refresh current list', key: 'r', command: true, keys: '⌘R' },
  { action: 'settings', label: 'Settings', key: ',', command: true, keys: '⌘,' },
  { action: 'playrooms', label: 'Playrooms', key: '1', command: true, keys: '⌘1' },
  { action: 'playhouses', label: 'Playhouses', key: '2', command: true, keys: '⌘2' },
  { action: 'search', label: 'Focus search', key: 'f', command: true, keys: '⌘F' },
  { action: 'overview', label: 'Keyboard shortcuts', key: '?', command: false, keys: '?' },
  {
    action: 'new-playroom',
    label: 'New Playroom (on Playrooms)',
    key: 'c',
    command: false,
    keys: 'c',
  },
  { action: 'search', label: 'Focus search (on Playrooms)', key: '/', command: false, keys: '/' },
] as const;
export type ShortcutAction = (typeof SHORTCUTS)[number]['action'];
export type MenuAction =
  | ShortcutAction
  | 'defaults'
  | 'theme-light'
  | 'theme-dark'
  | 'theme-system'
  | 'documentation'
  | 'report-issue';

interface PageActions {
  refresh: () => void;
  overlayOpen?: () => boolean;
  create?: () => void;
}

@Injectable({ providedIn: 'root' })
export class ShortcutsService {
  private readonly router = inject(Router);
  private readonly state = inject(PlayroomStateService);
  readonly overviewOpen = signal(false);
  readonly shortcuts = SHORTCUTS;
  private pageActions?: PageActions;

  constructor() {
    const zone = inject(NgZone);
    const keydown = (event: KeyboardEvent) => zone.run(() => this.handleKeydown(event));
    window.addEventListener('keydown', keydown, true);
    const unsubscribe = wailsApi.onMenuAction((action) => zone.run(() => this.dispatch(action)));
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('keydown', keydown, true);
      unsubscribe();
    });
  }

  registerPageActions(actions: PageActions, destroyRef: DestroyRef): void {
    this.pageActions = actions;
    destroyRef.onDestroy(() => {
      if (this.pageActions === actions) this.pageActions = undefined;
    });
  }

  private shortcutsBlocked(target: EventTarget | null): boolean {
    return (
      this.overviewOpen() ||
      !!this.pageActions?.overlayOpen?.() ||
      !!document.querySelector(
        '[role="dialog"], .p-drawer, .p-select-overlay, .p-popover, .p-menu-overlay',
      ) ||
      (target instanceof Element &&
        !!target.closest(
          'input, textarea, select, [contenteditable], [role="combobox"], [role="textbox"]',
        ))
    );
  }

  handleKeydown(event: KeyboardEvent): void {
    const shortcut = SHORTCUTS.find(
      (entry) => entry.key === event.key.toLowerCase() && entry.command === event.metaKey,
    );
    if (
      !shortcut ||
      event.ctrlKey ||
      event.altKey ||
      event.repeat ||
      event.isComposing ||
      (event.shiftKey && event.key !== '?')
    )
      return;
    if (!shortcut.command && shortcut.action !== 'overview' && !this.onPlayrooms()) return;
    const blocked = this.shortcutsBlocked(event.target);
    // Consume app accelerators even when guarded, so WebKit cannot reload the webview.
    if (shortcut.command || !blocked) event.preventDefault();
    if (!blocked) this.dispatch(shortcut.action);
  }

  dispatch(action: string): void {
    if (this.shortcutsBlocked(document.activeElement)) return;
    switch (action as MenuAction) {
      case 'new-playroom':
        if (this.onPlayrooms() && this.pageActions?.create) this.pageActions.create();
        else void this.router.navigate(['/rooms'], { queryParams: { create: true } });
        break;
      case 'refresh':
        this.pageActions?.refresh();
        break;
      case 'settings':
        void this.router.navigateByUrl('/settings');
        break;
      case 'playrooms':
        void this.router.navigateByUrl('/rooms');
        break;
      case 'playhouses':
        void this.router.navigateByUrl('/playhouse');
        break;
      case 'defaults':
        void this.router.navigateByUrl('/defaults');
        break;
      case 'search':
        document
          .querySelector<HTMLInputElement>('#main-content input[type="search"], #room-search')
          ?.focus();
        break;
      case 'overview':
        this.overviewOpen.set(true);
        break;
      case 'theme-light':
        this.state.setThemePreference('light');
        break;
      case 'theme-dark':
        this.state.setThemePreference('dark');
        break;
      case 'theme-system':
        this.state.setThemePreference('system');
        break;
      case 'documentation':
        this.openLink('https://github.com/avisi-cloud/acloud-playrooms#readme');
        break;
      case 'report-issue':
        this.openLink('https://github.com/avisi-cloud/acloud-playrooms/issues/new');
        break;
      default:
        console.error('Unknown menu action', action);
    }
  }

  private onPlayrooms(): boolean {
    return this.router.url.split('?')[0] === '/rooms';
  }

  private openLink(url: string): void {
    void wailsApi
      .openUrlInDefaultBrowser(url)
      .catch((error: unknown) => console.error('Could not open link', error));
  }
}
