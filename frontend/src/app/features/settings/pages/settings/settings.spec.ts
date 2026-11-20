import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { wailsApi } from '../../../../core/services/wails-api';
import { routes } from '../../../../app.routes';
import { SettingsPageComponent } from './settings';
import { DefaultsPageComponent } from '../../../defaults/pages/defaults/defaults';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { readCache, updateCache } from '../../../../shared/utils';

describe('Settings page', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.spyOn(wailsApi, 'getAcloudBinaryStatus').mockResolvedValue({
      Path: '',
      Source: 'none',
      Found: false,
      Version: '',
      Message: 'Acloud not found',
      ConfiguredPath: '',
      EnvironmentOverride: false,
    });
    vi.spyOn(wailsApi, 'getAcloudVersion').mockResolvedValue('');
    vi.spyOn(wailsApi, 'getAcloudCompatibility').mockResolvedValue({
      RunningVersion: '',
      VerifiedVersion: '0.39.0',
      MinimumVersion: '0.39.0',
      RunningVersionIsNewerThanVerified: false,
      RunningVersionIsOlderThanMinimum: false,
      Explanation: '',
    });
    vi.spyOn(wailsApi, 'getToolStatuses').mockResolvedValue([]);
    vi.spyOn(wailsApi, 'getTailscaleBinaryStatus').mockResolvedValue({
      Path: '/opt/homebrew/bin/tailscale',
      Source: 'known-location',
      Found: true,
      Version: '1.104.2',
      Message: '',
      ConfiguredPath: '',
    });
    vi.spyOn(wailsApi, 'getT3CodePathStatus').mockResolvedValue({
      Path: '/Applications/T3 Code (Beta).app',
      Source: 'known-location',
      Found: true,
      Version: '0.1.2',
      Message: '',
      ConfiguredPath: '',
      IsApplication: true,
    });
    await TestBed.configureTestingModule({
      imports: [SettingsPageComponent],
      providers: [MessageService, provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('offers three theme tiles and saves a single selection when a tile is clicked', async () => {
    const fixture = TestBed.createComponent(SettingsPageComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.theme-field legend')?.textContent).toBe('Theme');
    const tiles = [...root.querySelectorAll<HTMLLabelElement>('.theme-option')];
    expect(tiles.map((tile) => tile.textContent?.trim())).toEqual(['Light', 'Dark', 'System']);
    expect(root.querySelector<HTMLInputElement>('input[name="theme"]:checked')?.value).toBe('dark');

    for (const themeLabel of ['System', 'Light', 'Dark']) {
      tiles.find((tile) => tile.textContent?.trim() === themeLabel)!.click();
      await fixture.whenStable();

      const checked = root.querySelectorAll<HTMLInputElement>('input[name="theme"]:checked');
      expect(checked).toHaveLength(1);
      expect(checked[0].value).toBe(themeLabel.toLowerCase());
      expect(root.querySelectorAll('.theme-option.is-selected')).toHaveLength(1);
      expect(root.querySelector('.theme-option.is-selected')?.textContent?.trim()).toBe(themeLabel);
      expect(readCache().lastTheme).toBe(themeLabel.toLowerCase());
    }
  });

  it('keeps the selected tile in sync with the theme preference', async () => {
    updateCache({ lastTheme: 'system' });
    const fixture = TestBed.createComponent(SettingsPageComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector<HTMLInputElement>('input[name="theme"]:checked')?.value).toBe(
      'system',
    );

    fixture.componentInstance.state.setThemePreference('dark');
    await fixture.whenStable();

    const checked = root.querySelector<HTMLInputElement>('input[name="theme"]:checked');
    expect(checked?.value).toBe(fixture.componentInstance.state.themePreference());
    expect(root.querySelector('.theme-option.is-selected input')).toBe(checked);
  });

  it('enables background grain by default and labels the switch', async () => {
    const fixture = TestBed.createComponent(SettingsPageComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const toggle = root.querySelector<HTMLInputElement>('#background-grain')!;

    expect(toggle.checked).toBe(true);
    expect(root.querySelector('label[for="background-grain"]')?.textContent).toBe(
      'Background grain',
    );
    expect(root.querySelector('.appearance-toggle')?.textContent?.trim()).toBe('On');
  });

  it('applies background grain changes immediately and saves both switch states', async () => {
    const fixture = TestBed.createComponent(SettingsPageComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const toggle = root.querySelector<HTMLInputElement>('#background-grain')!;

    toggle.click();
    await fixture.whenStable();

    expect(TestBed.inject(PlayroomStateService).backgroundGrain()).toBe(false);
    expect(readCache().backgroundGrain).toBe(false);
    expect(root.querySelector('.appearance-toggle')?.textContent?.trim()).toBe('Off');

    toggle.click();
    await fixture.whenStable();

    expect(TestBed.inject(PlayroomStateService).backgroundGrain()).toBe(true);
    expect(readCache().backgroundGrain).toBe(true);
    expect(root.querySelector('.appearance-toggle')?.textContent?.trim()).toBe('On');
  });

  it('restores a saved preference with background grain turned off', async () => {
    updateCache({ backgroundGrain: false });
    const fixture = TestBed.createComponent(SettingsPageComponent);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('#background-grain').checked).toBe(false);
    expect(fixture.componentInstance.state.backgroundGrain()).toBe(false);
  });

  it('keeps all local path controls usable even when Acloud is missing', async () => {
    const fixture = TestBed.createComponent(SettingsPageComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('app-acloud-binary')).not.toBeNull();
    expect(root.querySelector('app-tailscale-binary')).not.toBeNull();
    expect(root.querySelector('app-t3-code-path')).not.toBeNull();
  });

  it('defaults AME Robot to on and saves both switch states', async () => {
    const fixture = TestBed.createComponent(SettingsPageComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const toggle = root.querySelector<HTMLInputElement>('#ame-robot')!;
    expect(root.querySelector('label[for="ame-robot"]')?.textContent).toBe('AME Robot');
    expect(toggle.checked).toBe(true);

    for (const enabled of [false, true]) {
      toggle.click();
      await fixture.whenStable();
      expect(fixture.componentInstance.state.ameRobot()).toBe(enabled);
      expect(readCache().ameRobot).toBe(enabled);
      expect(toggle.checked).toBe(enabled);
      expect(toggle.closest('.appearance-toggle')?.textContent?.trim()).toBe(
        enabled ? 'On' : 'Off',
      );
    }
  });

  it('restores a saved preference with AME Robot turned off', async () => {
    updateCache({ ameRobot: false });
    const fixture = TestBed.createComponent(SettingsPageComponent);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('#ame-robot').checked).toBe(false);
    expect(fixture.componentInstance.state.ameRobot()).toBe(false);
  });

  it('gives Defaults and Settings separate, unguarded routes', async () => {
    const defaults = routes.find((route) => route.path === 'defaults');
    const settings = routes.find((route) => route.path === 'settings');
    expect(await defaults?.loadComponent?.()).toBe(DefaultsPageComponent);
    expect(await settings?.loadComponent?.()).toBe(SettingsPageComponent);
    expect(defaults?.canActivate).toBeUndefined();
    expect(settings?.canActivate).toBeUndefined();
  });

  it('moves setup access to Settings', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(SettingsPageComponent);
    fixture.componentInstance.runSetupAgain();
    expect(navigate).toHaveBeenCalledWith(['/setup']);
  });
});
