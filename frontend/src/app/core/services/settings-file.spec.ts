import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { vi } from 'vitest';
import { readCache } from '../../shared/utils/cache';
import { readSettingsFile } from '../../shared/utils/settings-file';
import { EveningStopService } from './evening-stop';
import { PlayroomStateService } from './playroom-state';
import { SettingsFileService } from './settings-file';
import { ToastService } from './toast';
import { PlayroomDefaultEntry, wailsApi } from './wails-api';

const DEFAULTS: PlayroomDefaultEntry[] = [
  { Key: 'image', Value: 'claude-code', Source: 'config', Builtin: 'opencode' },
  { Key: 'storage', Value: '20Gi', Source: 'built-in', Builtin: '20Gi' },
  { Key: 'editor', Value: 'goland', Source: 'cache', Builtin: 'vscode' },
  { Key: 'ssh-key', Value: '', Source: 'built-in', Builtin: '' },
];

describe('SettingsFileService', () => {
  let service: SettingsFileService;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [MessageService, provideRouter([])] });
    vi.spyOn(wailsApi, 'setKeepRunningInMenuBar').mockResolvedValue();
    vi.spyOn(wailsApi, 'setMenuBarRooms').mockResolvedValue();
    vi.spyOn(wailsApi, 'onMenuBarAction').mockReturnValue(() => undefined);
    vi.spyOn(wailsApi, 'getAcloudBinaryStatus').mockResolvedValue({
      Path: '/usr/local/bin/acloud',
      Source: 'configured',
      Found: true,
      Version: '0.39.0',
      Message: '',
      ConfiguredPath: '/usr/local/bin/acloud',
      EnvironmentOverride: false,
    });
    vi.spyOn(wailsApi, 'getTailscaleBinaryStatus').mockResolvedValue({
      Path: '/opt/homebrew/bin/tailscale',
      Source: 'known-location',
      Found: true,
      Version: '1.80.0',
      Message: '',
      ConfiguredPath: '',
    });
    vi.spyOn(wailsApi, 'getT3CodePathStatus').mockResolvedValue({
      Path: '',
      Source: 'none',
      Found: false,
      Version: '',
      Message: '',
      ConfiguredPath: '',
      IsApplication: false,
    });
    vi.spyOn(wailsApi, 'getPlayroomDefaults').mockResolvedValue(structuredClone(DEFAULTS));
    service = TestBed.inject(SettingsFileService);
    const schedule = TestBed.inject(EveningStopService);
    await vi.waitFor(() => expect(schedule.settings()).not.toBeNull());
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  async function exportedText(): Promise<string> {
    const exportSettings = vi.spyOn(wailsApi, 'exportSettings').mockResolvedValue();
    await service.exportSettings();
    return exportSettings.mock.calls[0][0];
  }

  it('exports preferences, schedule, saved tool paths and only configured defaults', async () => {
    TestBed.inject(PlayroomStateService).setPreferredAction('connect');

    const file = JSON.parse(await exportedText());

    expect(file.format).toBe('acloud-playrooms-settings');
    expect(file.version).toBe(1);
    expect(file.appPreferences.preferredAction).toBe('connect');
    expect(file.eveningStop).toEqual({
      enabled: false,
      time: '22:00',
      days: 'weekdays',
      idleHours: 4,
    });
    expect(file.toolPaths).toEqual({ acloud: '/usr/local/bin/acloud', tailscale: '', t3Code: '' });
    expect(file.playroomDefaults).toEqual({ image: 'claude-code' });
  });

  it('exports a file it can import again without changes', async () => {
    const text = await exportedText();
    expect(() =>
      readSettingsFile(
        text,
        DEFAULTS.map((entry) => entry.Key),
      ),
    ).not.toThrow();
    vi.spyOn(wailsApi, 'readSettingsToImport').mockResolvedValue(text);

    await service.chooseSettingsToImport();

    expect(service.pendingImport()?.changes).toEqual([]);
  });

  it('refuses an export while the playroom defaults cannot be read', async () => {
    vi.spyOn(wailsApi, 'getPlayroomDefaults').mockRejectedValue(new Error('not signed in'));
    const exportSettings = vi.spyOn(wailsApi, 'exportSettings').mockResolvedValue();
    const failure = vi.spyOn(TestBed.inject(ToastService), 'failure');

    await service.exportSettings();

    expect(exportSettings).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledWith('Could not export settings', expect.any(Error));
  });

  it('changes nothing when the file chooser is cancelled', async () => {
    vi.spyOn(wailsApi, 'readSettingsToImport').mockResolvedValue('');
    await service.chooseSettingsToImport();
    expect(service.pendingImport()).toBeNull();
  });

  it('refuses an invalid file with its reason and applies nothing', async () => {
    const text = (await exportedText()).replace('"version": 1', '"version": 9');
    vi.spyOn(wailsApi, 'readSettingsToImport').mockResolvedValue(text);
    const failure = vi.spyOn(TestBed.inject(ToastService), 'failure');

    await service.chooseSettingsToImport();

    expect(service.pendingImport()).toBeNull();
    expect(failure).toHaveBeenCalledWith(
      'Could not import settings',
      expect.objectContaining({ message: expect.stringContaining('version 9') }),
    );
  });

  it('applies confirmed changes, running playroom defaults through config set and unset', async () => {
    const file = JSON.parse(await exportedText());
    file.appPreferences.theme = 'light';
    file.eveningStop.enabled = true;
    file.eveningStop.time = '21:00';
    file.toolPaths.acloud = '';
    file.playroomDefaults = { storage: '40Gi' };
    vi.spyOn(wailsApi, 'readSettingsToImport').mockResolvedValue(JSON.stringify(file));
    const setDefault = vi.spyOn(wailsApi, 'setPlayroomDefault').mockResolvedValue();
    const unsetDefault = vi.spyOn(wailsApi, 'unsetPlayroomDefault').mockResolvedValue();
    const saveSchedule = vi.spyOn(wailsApi, 'setScheduleSettings').mockResolvedValue();
    const clearAcloud = vi.spyOn(wailsApi, 'clearAcloudBinary').mockResolvedValue({
      Path: '/usr/local/bin/acloud',
      Source: 'path',
      Found: true,
      Version: '0.39.0',
      Message: '',
      ConfiguredPath: '',
      EnvironmentOverride: false,
    });

    await service.chooseSettingsToImport();
    expect(service.pendingImport()?.changes.map((change) => change.label)).toEqual([
      'Theme',
      'Stop my running playrooms',
      'Stop at',
      'Acloud command',
      'image',
      'storage',
    ]);
    expect(setDefault).not.toHaveBeenCalled();

    await service.applyPendingImport();

    expect(readCache().lastTheme).toBe('light');
    expect(saveSchedule).toHaveBeenCalledTimes(1);
    expect(saveSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ Enabled: true, Time: '21:00', Days: 'weekdays', IdleHours: 4 }),
    );
    expect(clearAcloud).toHaveBeenCalled();
    expect(unsetDefault).toHaveBeenCalledWith(expect.any(String), 'image');
    expect(setDefault).toHaveBeenCalledWith(expect.any(String), 'storage', '40Gi');
    expect(service.pendingImport()).toBeNull();
  });

  it('stops at the first failure and names the setting', async () => {
    const file = JSON.parse(await exportedText());
    file.toolPaths.tailscale = '/missing/tailscale';
    file.playroomDefaults = { storage: '40Gi', image: 'claude-code' };
    vi.spyOn(wailsApi, 'readSettingsToImport').mockResolvedValue(JSON.stringify(file));
    vi.spyOn(wailsApi, 'setTailscaleBinary').mockRejectedValue(new Error('not executable'));
    const setDefault = vi.spyOn(wailsApi, 'setPlayroomDefault').mockResolvedValue();
    const failure = vi.spyOn(TestBed.inject(ToastService), 'failure');

    await service.chooseSettingsToImport();
    await service.applyPendingImport();

    expect(failure).toHaveBeenCalledWith(
      'Import stopped at "Tailscale command"',
      expect.any(Error),
    );
    expect(setDefault).not.toHaveBeenCalled();
    expect(service.busy()).toBe(false);
  });
});
