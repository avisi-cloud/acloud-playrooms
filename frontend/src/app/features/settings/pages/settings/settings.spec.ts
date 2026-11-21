import { templateFromCreateForm } from '../../../../shared/utils/playroom-template';
import { blankCreateForm } from '../../../../shared/utils/forms';
import { DesktopNotificationsService } from '../../../../core/services/desktop-notifications';
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

  it('keeps Appearance first and templates between Environment variables and Tool paths', async () => {
    const fixture = TestBed.createComponent(SettingsPageComponent);
    await fixture.whenStable();
    const headings = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('h2')).map(
      (heading) => heading.textContent?.trim(),
    );
    expect(headings[0]).toBe('Appearance');
    const environment = headings.indexOf('Environment variables');
    expect(headings.slice(environment, environment + 3)).toEqual([
      'Environment variables',
      'Playroom templates',
      'Tool paths',
    ]);
  });

  it('edits a template name only after Rename, cancels with Escape and saves with Enter', async () => {
    vi.spyOn(wailsApi, 'getPlayroomTemplates').mockResolvedValue([
      templateFromCreateForm('Web', blankCreateForm('')),
    ]);
    const save = vi.spyOn(wailsApi, 'savePlayroomTemplates').mockResolvedValue();
    const fixture = TestBed.createComponent(SettingsPageComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const row = () => root.querySelector<HTMLElement>('.template-row')!;
    const rename = () =>
      Array.from(row().querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Rename',
      )!;
    expect(row().querySelector('input')).toBeNull();
    rename().click();
    await fixture.whenStable();
    let input = row().querySelector<HTMLInputElement>('input')!;
    input.value = 'Cancelled';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(row().querySelector('input')).toBeNull();
    expect(row().querySelector('.template-name')?.textContent).toBe('Web');
    expect(save).not.toHaveBeenCalled();
    rename().click();
    await fixture.whenStable();
    input = row().querySelector<HTMLInputElement>('input')!;
    input.value = 'Shared';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await fixture.whenStable();
    expect(save).toHaveBeenCalledWith([expect.objectContaining({ name: 'Shared' })]);
    expect(row().querySelector('input')).toBeNull();
    expect(row().querySelector('.template-name')?.textContent).toBe('Shared');
  });

  it('keeps the rename input and entered name when saving fails', async () => {
    vi.spyOn(wailsApi, 'getPlayroomTemplates').mockResolvedValue([
      templateFromCreateForm('Web', blankCreateForm('')),
    ]);
    vi.spyOn(wailsApi, 'savePlayroomTemplates').mockRejectedValue(new Error('Disk full'));
    const fixture = TestBed.createComponent(SettingsPageComponent);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    const template = component.templates.templates()[0];
    component.beginTemplateRename(template);
    component.templateName.set('Shared');
    await component.saveTemplateName(template);
    await fixture.whenStable();
    expect(component.renamingTemplate()).toBe('Web');
    expect(component.templateName()).toBe('Shared');
    expect(component.templates.error()).toContain('Disk full');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#rename-template')
        ?.value,
    ).toBe('Shared');
  });

  it('shows evening stop defaults and saves the switch and idle threshold', async () => {
    const save = vi.spyOn(wailsApi, 'setScheduleSettings').mockResolvedValue();
    const fixture = TestBed.createComponent(SettingsPageComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const toggle = root.querySelector<HTMLInputElement>('#evening-stop-enabled')!;
    expect(toggle.checked).toBe(false);
    expect(root.querySelector<HTMLInputElement>('#evening-stop-time')?.value).toBe('22:00');
    expect(root.querySelector<HTMLInputElement>('#idle-reminder-hours')?.value).toBe('4');
    toggle.click();
    await fixture.whenStable();
    expect(save).toHaveBeenLastCalledWith({
      Enabled: true,
      Time: '22:00',
      Days: 'weekdays',
      IdleHours: 4,
    });
    const hours = root.querySelector<HTMLInputElement>('#idle-reminder-hours')!;
    hours.value = '6';
    hours.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(save).toHaveBeenLastCalledWith({
      Enabled: true,
      Time: '22:00',
      Days: 'weekdays',
      IdleHours: 6,
    });
  });

  it('offers notification and Dock badge preferences and saves them', async () => {
    const fixture = TestBed.createComponent(SettingsPageComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const toggle = root.querySelector<HTMLInputElement>('#desktop-notifications')!;
    expect(toggle.checked).toBe(true);
    toggle.click();
    await fixture.whenStable();
    expect(readCache().notifications).toBe(false);
    expect(root.querySelector('label[for="dock-badge"]')?.textContent).toBe('Dock badge');
    expect(root.querySelector('#dock-badge')?.getAttribute('aria-label')).toBe('Dock badge');
    expect(fixture.componentInstance.dockBadgeOptions.map((option) => option.label)).toEqual([
      'Failed rooms',
      'Running rooms',
      'Off',
    ]);
    TestBed.inject(DesktopNotificationsService).setDockBadge('off');
    expect(readCache().dockBadge).toBe('off');
  });

  it('keeps running in the menu bar off by default, and saves and sends the switch', async () => {
    const send = vi.spyOn(wailsApi, 'setKeepRunningInMenuBar').mockResolvedValue();
    const fixture = TestBed.createComponent(SettingsPageComponent);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('label[for="keep-running-in-menu-bar"]')?.textContent).toBe(
      'Keep running in the menu bar',
    );
    const toggle = root.querySelector<HTMLInputElement>('#keep-running-in-menu-bar')!;
    expect(toggle.checked).toBe(false);
    toggle.click();
    await fixture.whenStable();
    expect(readCache().keepRunningInMenuBar).toBe(true);
    expect(send).toHaveBeenLastCalledWith(true);
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
  it('saves and restores the preferred action next to tool settings', async () => {
    updateCache({ preferredAction: 'open' });
    const fixture = TestBed.createComponent(SettingsPageComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.room-card-settings h2').textContent).toBe(
      'Room cards',
    );
    expect(
      fixture.nativeElement.querySelector('.room-card-settings .settings-section-description')
        .textContent,
    ).toBe('What a double-click on a room card does.');
    expect(fixture.componentInstance.state.preferredAction()).toBe('open');
    const select = fixture.nativeElement.querySelector('#preferred-action') as HTMLElement;
    expect(select).not.toBeNull();
    expect(fixture.nativeElement.querySelector('label[for="preferred-action"]').textContent).toBe(
      'Preferred action',
    );
    for (const action of ['connect', 'open', 'nothing'] as const) {
      fixture.componentInstance.state.setPreferredAction(action);
      expect(readCache().preferredAction).toBe(action);
    }
  });
});
