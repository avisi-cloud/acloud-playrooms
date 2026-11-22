import { DockBadge, PreferredAction, ThemePreference } from '../models/system';

/** Names the file, so another app's JSON is refused rather than half-read. */
export const SETTINGS_FILE_FORMAT = 'acloud-playrooms-settings';
export const SETTINGS_FILE_VERSION = 1;

/** The Settings screen's preferences that are saved on this device. */
export interface AppPreferences {
  theme: ThemePreference;
  backgroundGrain: boolean;
  ameRobot: boolean;
  checkForUpdates: boolean;
  notifications: boolean;
  dockBadge: DockBadge;
  keepRunningInMenuBar: boolean;
  preferredAction: PreferredAction;
  readVariablesFromLoginShell: boolean;
}

export type EveningStopDays = 'weekdays' | 'every-day';

export interface EveningStop {
  enabled: boolean;
  time: string;
  days: EveningStopDays;
  idleHours: number;
}

/** A saved path per tool; empty means automatic lookup. */
export interface ToolPaths {
  acloud: string;
  tailscale: string;
  t3Code: string;
}

/**
 * Everything "Export settings…" writes. Never credentials, tokens or
 * environment variable values: none of these fields can hold one.
 */
export interface SettingsFile {
  format: typeof SETTINGS_FILE_FORMAT;
  version: typeof SETTINGS_FILE_VERSION;
  appPreferences: AppPreferences;
  eveningStop: EveningStop;
  toolPaths: ToolPaths;
  /** Only the configured `playroom config` defaults; missing keys use the built-in value. */
  playroomDefaults: Record<string, string>;
}

/** The current value of one playroom default, as `playroom config view` reports it. */
export interface PlayroomDefaultState {
  key: string;
  configuredValue: string;
  builtin: string;
}

export type SettingsSection =
  'App preferences' | 'Evening stop' | 'Tool paths' | 'Playroom defaults';

export type SettingsChange =
  | {
      section: 'App preferences';
      key: keyof AppPreferences;
      label: string;
      currentText: string;
      nextText: string;
    }
  | {
      section: 'Evening stop';
      key: keyof EveningStop;
      label: string;
      currentText: string;
      nextText: string;
    }
  | {
      section: 'Tool paths';
      key: keyof ToolPaths;
      label: string;
      currentText: string;
      nextText: string;
      nextPath: string;
    }
  | {
      section: 'Playroom defaults';
      key: string;
      label: string;
      currentText: string;
      nextText: string;
      /** Empty clears the default, so it follows the built-in value again. */
      nextValue: string;
      builtin: string;
    };

const THEME_LABELS: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};
const DOCK_BADGE_LABELS: Record<DockBadge, string> = {
  failed: 'Failed rooms',
  running: 'Running rooms',
  off: 'Off',
};
const PREFERRED_ACTION_LABELS: Record<PreferredAction, string> = {
  connect: 'Connect',
  open: 'Open in editor',
  nothing: 'Nothing',
};
const EVENING_STOP_DAYS_LABELS: Record<EveningStopDays, string> = {
  weekdays: 'Weekdays',
  'every-day': 'Every day',
};

interface FieldRule<Value> {
  /** What a valid value looks like, for the refusal message. */
  expected: string;
  isValid: (value: unknown) => value is Value;
  label: string;
  describe: (value: Value) => string;
}

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isString = (value: unknown): value is string => typeof value === 'string';
const isOneOf =
  <Value extends string>(labels: Record<Value, string>) =>
  (value: unknown): value is Value =>
    typeof value === 'string' && Object.hasOwn(labels, value);
const onOff = (value: boolean) => (value ? 'On' : 'Off');
const toggleRule = (label: string): FieldRule<boolean> => ({
  expected: 'true or false',
  isValid: isBoolean,
  label,
  describe: onOff,
});
const choiceRule = <Value extends string>(
  label: string,
  labels: Record<Value, string>,
): FieldRule<Value> => ({
  expected: Object.keys(labels)
    .map((value) => `"${value}"`)
    .join(', '),
  isValid: isOneOf(labels),
  label,
  describe: (value) => labels[value],
});
const pathRule = (label: string): FieldRule<string> => ({
  expected: 'a path, or "" for automatic lookup',
  isValid: isString,
  label,
  describe: (path) => path || 'Automatic',
});

type Rules<Section> = { [Key in keyof Section]: FieldRule<Section[Key]> };

const APP_PREFERENCE_RULES: Rules<AppPreferences> = {
  theme: choiceRule('Theme', THEME_LABELS),
  backgroundGrain: toggleRule('Background grain'),
  ameRobot: toggleRule('AME Robot'),
  checkForUpdates: toggleRule('Check for app updates'),
  notifications: toggleRule('Desktop notifications'),
  dockBadge: choiceRule('Dock badge', DOCK_BADGE_LABELS),
  keepRunningInMenuBar: toggleRule('Keep running in the menu bar'),
  preferredAction: choiceRule('Preferred action', PREFERRED_ACTION_LABELS),
  readVariablesFromLoginShell: toggleRule('Read variables from my login shell'),
};

const EVENING_STOP_RULES: Rules<EveningStop> = {
  enabled: toggleRule('Stop my running playrooms'),
  time: {
    expected: 'a time as "HH:MM"',
    isValid: (value): value is string =>
      typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
    label: 'Stop at',
    describe: (time) => time,
  },
  days: choiceRule('On', EVENING_STOP_DAYS_LABELS),
  idleHours: {
    expected: 'a whole number from 1 to 168',
    isValid: (value): value is number =>
      Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 168,
    label: 'Idle reminder after hours',
    describe: (hours) => String(hours),
  },
};

const TOOL_PATH_RULES: Rules<ToolPaths> = {
  acloud: pathRule('Acloud command'),
  tailscale: pathRule('Tailscale command'),
  t3Code: pathRule('T3 Code'),
};

const TOP_LEVEL_KEYS: (keyof SettingsFile)[] = [
  'format',
  'version',
  'appPreferences',
  'eveningStop',
  'toolPaths',
  'playroomDefaults',
];

/** The file "Export settings…" saves: readable, and stable for diffs between Macs. */
export function writeSettingsFile(settings: SettingsFile): string {
  const playroomDefaults = Object.fromEntries(
    Object.entries(settings.playroomDefaults).sort(([left], [right]) => left.localeCompare(right)),
  );
  return `${JSON.stringify({ ...settings, playroomDefaults }, null, 2)}\n`;
}

/**
 * Reads a settings file, refusing anything it does not fully understand:
 * another format or version, unknown or missing keys, and values of the wrong kind.
 * `knownDefaultKeys` are the keys the running acloud reports.
 */
export function readSettingsFile(text: string, knownDefaultKeys: string[]): SettingsFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON, so it is not a settings file from this app.');
  }
  const file = requireObject(parsed, 'The settings file');
  if (file['format'] !== SETTINGS_FILE_FORMAT)
    throw new Error('This is not an Acloud Playrooms settings file.');
  if (file['version'] !== SETTINGS_FILE_VERSION) {
    const newer = typeof file['version'] === 'number' && file['version'] > SETTINGS_FILE_VERSION;
    throw new Error(
      `Settings file version ${JSON.stringify(file['version'])} is not supported. This app reads version ${SETTINGS_FILE_VERSION}${newer ? '. Update the app to import it.' : '.'}`,
    );
  }
  refuseUnknownAndMissingKeys(file, TOP_LEVEL_KEYS, 'the settings file');
  const playroomDefaults = requireObject(file['playroomDefaults'], '"playroomDefaults"');
  for (const [key, value] of Object.entries(playroomDefaults)) {
    if (!knownDefaultKeys.includes(key))
      throw new Error(`Playroom default "${key}" is not known to this acloud.`);
    if (typeof value !== 'string')
      throw new Error(`Playroom default "${key}" must be text, like the Defaults screen saves.`);
  }
  return {
    format: SETTINGS_FILE_FORMAT,
    version: SETTINGS_FILE_VERSION,
    appPreferences: readSection(file['appPreferences'], 'appPreferences', APP_PREFERENCE_RULES),
    eveningStop: readSection(file['eveningStop'], 'eveningStop', EVENING_STOP_RULES),
    toolPaths: readSection(file['toolPaths'], 'toolPaths', TOOL_PATH_RULES),
    playroomDefaults: playroomDefaults as Record<string, string>,
  };
}

/** Every setting that importing `next` would change, in the order they are applied. */
export function listSettingsChanges(
  current: Omit<SettingsFile, 'playroomDefaults'>,
  currentDefaults: PlayroomDefaultState[],
  next: SettingsFile,
): SettingsChange[] {
  const changes: SettingsChange[] = [];
  for (const key of Object.keys(APP_PREFERENCE_RULES) as (keyof AppPreferences)[]) {
    if (current.appPreferences[key] === next.appPreferences[key]) continue;
    const rule = APP_PREFERENCE_RULES[key] as FieldRule<AppPreferences[typeof key]>;
    changes.push({
      section: 'App preferences',
      key,
      label: rule.label,
      currentText: rule.describe(current.appPreferences[key]),
      nextText: rule.describe(next.appPreferences[key]),
    });
  }
  for (const key of Object.keys(EVENING_STOP_RULES) as (keyof EveningStop)[]) {
    if (current.eveningStop[key] === next.eveningStop[key]) continue;
    const rule = EVENING_STOP_RULES[key] as FieldRule<EveningStop[typeof key]>;
    changes.push({
      section: 'Evening stop',
      key,
      label: rule.label,
      currentText: rule.describe(current.eveningStop[key]),
      nextText: rule.describe(next.eveningStop[key]),
    });
  }
  for (const key of Object.keys(TOOL_PATH_RULES) as (keyof ToolPaths)[]) {
    if (current.toolPaths[key] === next.toolPaths[key]) continue;
    const rule = TOOL_PATH_RULES[key];
    changes.push({
      section: 'Tool paths',
      key,
      label: rule.label,
      currentText: rule.describe(current.toolPaths[key]),
      nextText: rule.describe(next.toolPaths[key]),
      nextPath: next.toolPaths[key],
    });
  }
  for (const entry of currentDefaults) {
    const nextValue = next.playroomDefaults[entry.key] ?? '';
    if (entry.configuredValue === nextValue) continue;
    const describe = (value: string) => value || `Built-in (${entry.builtin || 'empty'})`;
    changes.push({
      section: 'Playroom defaults',
      key: entry.key,
      label: entry.key,
      currentText: describe(entry.configuredValue),
      nextText: describe(nextValue),
      nextValue,
      builtin: entry.builtin,
    });
  }
  return changes;
}

function requireObject(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${name} must be a JSON object.`);
  return value as Record<string, unknown>;
}

function refuseUnknownAndMissingKeys(
  section: Record<string, unknown>,
  keys: readonly string[],
  name: string,
): void {
  const unknown = Object.keys(section).find((key) => !keys.includes(key));
  if (unknown)
    throw new Error(`Unknown setting "${unknown}" in ${name}. This app cannot import it.`);
  const missing = keys.find((key) => !Object.hasOwn(section, key));
  if (missing) throw new Error(`Setting "${missing}" is missing from ${name}.`);
}

function readSection<Section>(value: unknown, name: string, rules: Rules<Section>): Section {
  const section = requireObject(value, `"${name}"`);
  refuseUnknownAndMissingKeys(section, Object.keys(rules), `"${name}"`);
  for (const [key, rule] of Object.entries(rules) as [string, FieldRule<unknown>][]) {
    if (!rule.isValid(section[key]))
      throw new Error(`Setting "${name}.${key}" must be ${rule.expected}.`);
  }
  return section as Section;
}
