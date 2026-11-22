import { describe, expect, it } from 'vitest';
import {
  PlayroomDefaultState,
  SettingsFile,
  listSettingsChanges,
  readSettingsFile,
  writeSettingsFile,
} from './settings-file';

const KNOWN_DEFAULT_KEYS = ['image', 'storage', 'ssh-key'];

function sampleSettings(): SettingsFile {
  return {
    format: 'acloud-playrooms-settings',
    version: 1,
    appPreferences: {
      theme: 'system',
      backgroundGrain: false,
      ameRobot: true,
      checkForUpdates: true,
      notifications: false,
      dockBadge: 'running',
      keepRunningInMenuBar: true,
      preferredAction: 'connect',
      readVariablesFromLoginShell: true,
    },
    eveningStop: { enabled: true, time: '21:30', days: 'every-day', idleHours: 6 },
    toolPaths: { acloud: '/opt/homebrew/bin/acloud', tailscale: '', t3Code: '' },
    playroomDefaults: { storage: '40Gi', image: 'claude-code' },
  };
}

function withChange(change: (file: Record<string, unknown>) => void): string {
  const file = JSON.parse(writeSettingsFile(sampleSettings())) as Record<string, unknown>;
  change(file);
  return JSON.stringify(file);
}

describe('settings file', () => {
  it('reads back exactly what it wrote', () => {
    const text = writeSettingsFile(sampleSettings());
    expect(readSettingsFile(text, KNOWN_DEFAULT_KEYS)).toEqual(sampleSettings());
  });

  it('writes playroom defaults sorted by key, so files compare cleanly', () => {
    const text = writeSettingsFile(sampleSettings());
    expect(Object.keys(JSON.parse(text).playroomDefaults)).toEqual(['image', 'storage']);
  });

  it('refuses text that is not JSON', () => {
    expect(() => readSettingsFile('not json', KNOWN_DEFAULT_KEYS)).toThrow('not valid JSON');
  });

  it('refuses a file of another format', () => {
    const text = withChange((file) => (file['format'] = 'something-else'));
    expect(() => readSettingsFile(text, KNOWN_DEFAULT_KEYS)).toThrow(
      'not an Acloud Playrooms settings file',
    );
  });

  it('refuses a newer version and says to update the app', () => {
    const text = withChange((file) => (file['version'] = 2));
    expect(() => readSettingsFile(text, KNOWN_DEFAULT_KEYS)).toThrow(
      'Settings file version 2 is not supported. This app reads version 1. Update the app',
    );
  });

  it('refuses a file without a version', () => {
    const text = withChange((file) => delete file['version']);
    expect(() => readSettingsFile(text, KNOWN_DEFAULT_KEYS)).toThrow(
      'Settings file version undefined is not supported',
    );
  });

  it('refuses an unknown top-level key', () => {
    const text = withChange((file) => (file['templates'] = []));
    expect(() => readSettingsFile(text, KNOWN_DEFAULT_KEYS)).toThrow(
      'Unknown setting "templates" in the settings file',
    );
  });

  it('refuses an unknown key inside a section', () => {
    const text = withChange(
      (file) => ((file['appPreferences'] as Record<string, unknown>)['token'] = 'secret'),
    );
    expect(() => readSettingsFile(text, KNOWN_DEFAULT_KEYS)).toThrow(
      'Unknown setting "token" in "appPreferences"',
    );
  });

  it('refuses a missing key, rather than guessing its value', () => {
    const text = withChange(
      (file) => delete (file['toolPaths'] as Record<string, unknown>)['t3Code'],
    );
    expect(() => readSettingsFile(text, KNOWN_DEFAULT_KEYS)).toThrow(
      'Setting "t3Code" is missing from "toolPaths"',
    );
  });

  it('refuses values outside their fixed set', () => {
    const theme = withChange(
      (file) => ((file['appPreferences'] as Record<string, unknown>)['theme'] = 'blue'),
    );
    expect(() => readSettingsFile(theme, KNOWN_DEFAULT_KEYS)).toThrow(
      'Setting "appPreferences.theme" must be "light", "dark", "system"',
    );
    const time = withChange(
      (file) => ((file['eveningStop'] as Record<string, unknown>)['time'] = '25:00'),
    );
    expect(() => readSettingsFile(time, KNOWN_DEFAULT_KEYS)).toThrow('"eveningStop.time"');
    const hours = withChange(
      (file) => ((file['eveningStop'] as Record<string, unknown>)['idleHours'] = 0),
    );
    expect(() => readSettingsFile(hours, KNOWN_DEFAULT_KEYS)).toThrow(
      'a whole number from 1 to 168',
    );
    const toggle = withChange(
      (file) => ((file['appPreferences'] as Record<string, unknown>)['ameRobot'] = 'yes'),
    );
    expect(() => readSettingsFile(toggle, KNOWN_DEFAULT_KEYS)).toThrow('true or false');
  });

  it('refuses a playroom default the running acloud does not know', () => {
    const text = withChange(
      (file) => ((file['playroomDefaults'] as Record<string, unknown>)['git-token'] = 'x'),
    );
    expect(() => readSettingsFile(text, KNOWN_DEFAULT_KEYS)).toThrow(
      'Playroom default "git-token" is not known to this acloud',
    );
  });

  it('refuses a playroom default that is not text', () => {
    const text = withChange(
      (file) => ((file['playroomDefaults'] as Record<string, unknown>)['storage'] = 40),
    );
    expect(() => readSettingsFile(text, KNOWN_DEFAULT_KEYS)).toThrow('must be text');
  });

  it('lists only changed settings, with readable current and new values', () => {
    const current = sampleSettings();
    const next = sampleSettings();
    next.appPreferences.theme = 'light';
    next.appPreferences.backgroundGrain = true;
    next.eveningStop.days = 'weekdays';
    next.toolPaths.acloud = '';
    next.playroomDefaults = { storage: '80Gi', 'ssh-key': '~/.ssh/id_work.pub' };
    const defaults: PlayroomDefaultState[] = [
      { key: 'image', configuredValue: 'claude-code', builtin: 'opencode' },
      { key: 'storage', configuredValue: '40Gi', builtin: '20Gi' },
      { key: 'ssh-key', configuredValue: '', builtin: '' },
    ];

    const changes = listSettingsChanges(current, defaults, next);

    expect(
      changes.map((change) => [change.section, change.label, change.currentText, change.nextText]),
    ).toEqual([
      ['App preferences', 'Theme', 'System', 'Light'],
      ['App preferences', 'Background grain', 'Off', 'On'],
      ['Evening stop', 'On', 'Every day', 'Weekdays'],
      ['Tool paths', 'Acloud command', '/opt/homebrew/bin/acloud', 'Automatic'],
      ['Playroom defaults', 'image', 'claude-code', 'Built-in (opencode)'],
      ['Playroom defaults', 'storage', '40Gi', '80Gi'],
      ['Playroom defaults', 'ssh-key', 'Built-in (empty)', '~/.ssh/id_work.pub'],
    ]);
  });

  it('lists nothing when the file matches the current settings', () => {
    const defaults: PlayroomDefaultState[] = [
      { key: 'image', configuredValue: 'claude-code', builtin: 'opencode' },
      { key: 'storage', configuredValue: '40Gi', builtin: '20Gi' },
    ];
    expect(listSettingsChanges(sampleSettings(), defaults, sampleSettings())).toEqual([]);
  });
});
