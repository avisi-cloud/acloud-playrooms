import { TestBed } from '@angular/core/testing';
import { PlayroomStateService } from './playroom-state';
import { WindowChromeService } from './window-chrome';
import { wailsApi } from './wails-api';
import { Theme, ThemePreference } from '../../shared/models';
import { readCache, updateCache } from '../../shared/utils';

describe('theme preference', () => {
  let systemDarkMode: MediaQueryList;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)');
    vi.spyOn(window, 'matchMedia').mockReturnValue(systemDarkMode);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    document.documentElement.classList.remove('app-dark');
    document.documentElement.style.removeProperty('--traffic-zone-height');
    vi.restoreAllMocks();
  });

  function changeSystemTheme(theme: Theme): void {
    Object.defineProperty(systemDarkMode, 'matches', {
      value: theme === 'dark',
      configurable: true,
    });
    systemDarkMode.dispatchEvent(new Event('change'));
  }

  it('preserves the existing dark default', () => {
    const state = TestBed.inject(PlayroomStateService);

    expect(state.themePreference()).toBe('dark');
    expect(state.theme()).toBe('dark');
    expect(document.documentElement.classList.contains('app-dark')).toBe(true);
  });

  it.each<Theme>(['light', 'dark'])('restores an existing %s preference', (theme) => {
    updateCache({ lastTheme: theme });
    changeSystemTheme(theme === 'dark' ? 'light' : 'dark');

    const state = TestBed.inject(PlayroomStateService);

    expect(state.themePreference()).toBe(theme);
    expect(state.theme()).toBe(theme);
  });

  it.each<Theme>(['light', 'dark'])('restores System with the computer in %s mode', (theme) => {
    updateCache({ lastTheme: 'system' });
    changeSystemTheme(theme);

    const state = TestBed.inject(PlayroomStateService);

    expect(state.themePreference()).toBe('system');
    expect(state.theme()).toBe(theme);
    expect(document.documentElement.classList.contains('app-dark')).toBe(theme === 'dark');
  });

  it('follows live system changes without overwriting the System preference', () => {
    const state = TestBed.inject(PlayroomStateService);
    state.setThemePreference('system');

    for (const theme of ['dark', 'light'] as const) {
      changeSystemTheme(theme);
      expect(state.theme()).toBe(theme);
      expect(document.documentElement.classList.contains('app-dark')).toBe(theme === 'dark');
      expect(state.themePreference()).toBe('system');
      expect(readCache().lastTheme).toBe('system');
    }
  });

  it.each<Theme>(['light', 'dark'])('keeps explicit %s mode when the system changes', (theme) => {
    const state = TestBed.inject(PlayroomStateService);
    state.setThemePreference('system');
    state.setThemePreference(theme);

    changeSystemTheme(theme === 'dark' ? 'light' : 'dark');

    expect(state.theme()).toBe(theme);
    expect(state.themePreference()).toBe(theme);
    expect(readCache().lastTheme).toBe(theme);
  });

  it('keeps the native window background in sync with system changes', () => {
    vi.spyOn(wailsApi, 'getOperatingSystem').mockResolvedValue('darwin');
    const setWindowTheme = vi.spyOn(wailsApi, 'setWindowTheme').mockResolvedValue();
    const state = TestBed.inject(PlayroomStateService);
    state.setThemePreference('system');
    TestBed.inject(WindowChromeService).matchWindowChromeToPlatformAndTheme();
    TestBed.tick();
    expect(setWindowTheme).toHaveBeenLastCalledWith('light');

    changeSystemTheme('dark');
    TestBed.tick();
    expect(setWindowTheme).toHaveBeenLastCalledWith('dark');
  });

  it('removes the system listener when the service is destroyed', () => {
    const removeEventListener = vi.spyOn(systemDarkMode, 'removeEventListener');
    TestBed.inject(PlayroomStateService);

    TestBed.resetTestingModule();

    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it.each<ThemePreference>(['light', 'dark', 'system'])(
    'saves the %s preference',
    (themePreference) => {
      TestBed.inject(PlayroomStateService).setThemePreference(themePreference);

      expect(readCache().lastTheme).toBe(themePreference);
    },
  );
});
