import { TestBed } from '@angular/core/testing';
import { DestroyRef } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ShortcutsService, SHORTCUTS } from './shortcuts';
import { PlayroomStateService } from './playroom-state';
import { wailsApi } from './wails-api';

describe('ShortcutsService', () => {
  let service: ShortcutsService;
  let navigate: ReturnType<typeof vi.spyOn>;
  let menuAction: (action: string) => void;
  const press = (key: string, options: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    document.body.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    vi.spyOn(wailsApi, 'onMenuAction').mockImplementation((handler) => {
      menuAction = handler;
      return () => {};
    });
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    service = TestBed.inject(ShortcutsService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('opens the command palette with command K and lists it in the overview', () => {
    press('k', { metaKey: true });
    expect(service.paletteOpen()).toBe(true);
    expect(service.shortcuts.find((shortcut) => shortcut.action === 'command-palette')?.keys).toBe(
      '⌘K',
    );
    menuAction('playhouses');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('uses the same navigation for keys and native menu events', () => {
    press('2', { metaKey: true });
    menuAction('playhouses');
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith('/playhouse');
  });

  it('ignores typing targets including PrimeNG comboboxes and editable descendants', () => {
    for (const markup of [
      '<input>',
      '<textarea></textarea>',
      '<select></select>',
      '<div role="combobox" tabindex="0"></div>',
      '<div contenteditable="true"><span tabindex="0"></span></div>',
      '<div role="textbox" tabindex="0"></div>',
    ]) {
      document.body.innerHTML = markup;
      const target =
        document.body.querySelector<HTMLElement>('span') ??
        (document.body.firstElementChild as HTMLElement);
      target.focus();
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: '2', metaKey: true, bubbles: true }),
      );
      menuAction('playhouses');
    }
    expect(navigate).not.toHaveBeenCalled();
  });

  it('leaves bare shortcut characters available while typing', () => {
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/rooms');
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    for (const key of ['c', '/', '?']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(service.overviewOpen()).toBe(false);
  });

  it('opens create on another screen, navigates to Settings and Playrooms, and focuses search', () => {
    const createNavigation = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    press('n', { metaKey: true });
    expect(createNavigation).toHaveBeenCalledWith(['/rooms'], { queryParams: { create: true } });
    press(',', { metaKey: true });
    expect(navigate).toHaveBeenLastCalledWith('/settings');
    press('1', { metaKey: true });
    expect(navigate).toHaveBeenLastCalledWith('/rooms');
    const search = document.createElement('input');
    search.id = 'room-search';
    document.body.append(search);
    press('f', { metaKey: true });
    expect(document.activeElement).toBe(search);
  });

  it('blocks actions while a page overlay has opened before rendering', () => {
    service.registerPageActions(
      { refresh: vi.fn(), overlayOpen: () => true },
      TestBed.inject(DestroyRef),
    );
    press('2', { metaKey: true });
    menuAction('playhouses');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('guards overlays for keyboard and menu while consuming command R', () => {
    document.body.innerHTML = '<div role="dialog"></div>';
    expect(press('r', { metaKey: true }).defaultPrevented).toBe(true);
    press('2', { metaKey: true });
    menuAction('playhouses');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('rejects other modifiers, repeats and composition', () => {
    for (const options of [
      { ctrlKey: true },
      { altKey: true },
      { shiftKey: true },
      { repeat: true },
      { isComposing: true },
    ])
      press('2', { metaKey: true, ...options });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('refreshes the active page and removes its handler when destroyed', () => {
    const refresh = vi.fn();
    let destroy = () => {};
    service.registerPageActions({ refresh }, {
      onDestroy: (callback) => {
        destroy = callback;
      },
    } as DestroyRef);
    press('r', { metaKey: true });
    menuAction('refresh');
    expect(refresh).toHaveBeenCalledTimes(2);
    destroy();
    menuAction('refresh');
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('keeps c and slash on Playrooms and leaves command C alone', () => {
    const create = vi.fn();
    service.registerPageActions({ refresh: vi.fn(), create }, TestBed.inject(DestroyRef));
    press('c');
    expect(create).not.toHaveBeenCalled();
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue('/rooms');
    press('c', { metaKey: true });
    press('c');
    expect(create).toHaveBeenCalledTimes(1);
    const search = document.createElement('input');
    search.id = 'room-search';
    document.body.append(search);
    press('/');
    expect(document.activeElement).toBe(search);
  });

  it('opens the registry overview and applies menu themes', () => {
    menuAction('theme-light');
    expect(TestBed.inject(PlayroomStateService).themePreference()).toBe('light');
    press('?', { shiftKey: true });
    expect(service.overviewOpen()).toBe(true);
    expect(service.shortcuts).toBe(SHORTCUTS);
  });
});
