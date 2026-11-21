import { DestroyRef, Injectable, NgZone, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PlayroomStateService } from './playroom-state';
import { wailsApi } from './wails-api';

export const APP_ACTIONS = {
  'command-palette': 'Command palette',
  'new-playroom': 'New Playroom',
  refresh: 'Refresh current list',
  settings: 'Settings',
  playrooms: 'Playrooms',
  playhouses: 'Playhouses',
  defaults: 'Defaults',
  setup: 'Setup',
  search: 'Focus search',
  overview: 'Keyboard shortcuts',
  'theme-light': 'Theme: Light',
  'theme-dark': 'Theme: Dark',
  'theme-system': 'Theme: System',
  documentation: 'Documentation',
  'report-issue': 'Report issue',
} as const;
export type MenuAction = keyof typeof APP_ACTIONS;

export const SHORTCUTS = [
  {
    action: 'command-palette',
    label: APP_ACTIONS['command-palette'],
    key: 'k',
    command: true,
    keys: '⌘K',
  },
  {
    action: 'new-playroom',
    label: APP_ACTIONS['new-playroom'],
    key: 'n',
    command: true,
    keys: '⌘N',
  },
  { action: 'refresh', label: APP_ACTIONS['refresh'], key: 'r', command: true, keys: '⌘R' },
  { action: 'settings', label: APP_ACTIONS['settings'], key: ',', command: true, keys: '⌘,' },
  { action: 'playrooms', label: APP_ACTIONS['playrooms'], key: '1', command: true, keys: '⌘1' },
  { action: 'playhouses', label: APP_ACTIONS['playhouses'], key: '2', command: true, keys: '⌘2' },
  { action: 'search', label: APP_ACTIONS['search'], key: 'f', command: true, keys: '⌘F' },
  { action: 'overview', label: APP_ACTIONS['overview'], key: '?', command: false, keys: '?' },
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
  readonly paletteOpen = signal(false);
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
      this.paletteOpen() ||
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
    this.runAction(action as MenuAction);
  }

  runAction(action: MenuAction): void {
    switch (action) {
      case 'command-palette':
        this.paletteOpen.set(true);
        break;
      case 'setup':
        void this.router.navigateByUrl('/setup');
        break;
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
