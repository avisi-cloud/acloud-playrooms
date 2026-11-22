import {
  decodePlayroomTemplates,
  validatePlayroomTemplates,
} from '../../shared/utils/playroom-template';

import { readCache } from '../../shared/utils/cache';
import { DummySchedule } from './schedule';
import { simulateActivity } from './activity-events';
import type { ListingDto } from '../../shared/models';
import type {
  wailsApi as liveApi,
  HealthCheck,
  HealthCheckInput,
  PlayroomCreateInput,
  PlayroomUpdateInput,
} from '../services/wails-api-live';
import { TERMINALS } from '../../shared/data';
import {
  dummyTemplates,
  dummyContexts,
  dummyLoginShellEnvironmentKeys,
  dummyDefaults,
  dummyImages,
  dummyOrganisations,
  dummyPlayhouses,
  dummyRooms,
  dummyUser,
} from './fixtures';

const templates = structuredClone(dummyTemplates);

let context = 'development';
let organisation = 'platform';
let signedIn = true;
const playhouses = structuredClone(dummyPlayhouses);
const rooms = structuredClone(dummyRooms);
const defaults = structuredClone(dummyDefaults);
const scopeKey = () => `${context}/${organisation}`;
const roomKey = (playhouse: string) => `${scopeKey()}/${playhouse}`;

// Return fresh objects just like a backend read; mutations stay in this page's memory.
async function read<T>(value: T): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 160));
  return structuredClone(value);
}

// The browser stands in for the native save dialog.
function downloadFile(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The browser stands in for the native open dialog; cancelling resolves to ''.
function chooseFileText(accept: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.hidden = true;
    const finish = (text: Promise<string>) => {
      input.remove();
      text.then(resolve, reject);
    };
    input.addEventListener('change', () => finish(input.files?.[0]?.text() ?? Promise.resolve('')));
    input.addEventListener('cancel', () => finish(Promise.resolve('')));
    document.body.append(input);
    input.click();
  });
}

async function unavailable(): Promise<never> {
  throw new Error('Dummy mode: this action is not simulated. No external action was taken.');
}

function findRoom(input: { Name?: string; Playhouse?: string }): ListingDto {
  const room = (rooms[roomKey(input.Playhouse ?? '')] ?? []).find(
    (entry) => entry.Name === input.Name,
  );
  if (!room) throw new Error('Dummy playroom not found in this playhouse.');
  return room;
}

function applyRoomSettings(
  room: ListingDto,
  input: Partial<PlayroomCreateInput | PlayroomUpdateInput>,
): void {
  if (input.Image) room.Image = input.Image;
  if (input.Storage) room.DiskSize = input.Storage;
  if (input.CPURequest) room.CPURequest = input.CPURequest;
  if (input.CPULimit) room.CPULimit = input.CPULimit;
  if (input.MemoryRequest) room.MemRequest = input.MemoryRequest;
  if (input.MemoryLimit) room.MemLimit = input.MemoryLimit;
  if (input.Capabilities) room.CapabilityProfile = input.Capabilities;
}

// These are intentionally labelled illustrations, not the backend's actual argv builder.
async function preview(action: string, input: object): Promise<string[]> {
  const args = ['dummy-preview', ...action.split(' ')];
  for (const [key, value] of Object.entries(input)) {
    if (key === 'ReadVariablesFromLoginShell' || key === 'MissingEnvironmentConfirmed') continue;
    if (value === '' || value === undefined || value === false || value === null) continue;
    args.push(
      `--${key
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase()}`,
    );
    args.push(
      /secret|key|env/i.test(key)
        ? '[redacted]'
        : typeof value === 'string'
          ? value
          : JSON.stringify(value),
    );
  }
  return read(args);
}

let simulatedFailureUsed = false;
let simulatedFailureScenario = new URLSearchParams(window.location.search).get('failure');
function simulateFailure(
  input: { ForceInstall?: boolean },
  kind: 'session' | 'outdated' | 'privileged',
): void {
  simulatedFailureScenario ??= new URLSearchParams(window.location.search).get('failure');
  if (simulatedFailureUsed || simulatedFailureScenario !== kind) return;
  if (kind === 'session' && input.ForceInstall) {
    simulatedFailureUsed = true;
    return;
  }
  simulatedFailureUsed = true;
  if (kind === 'session') throw new Error('ensure local kubeconfig: session not active');
  if (kind === 'outdated')
    throw new Error(
      'playroom "demo" is missing the latest security hardening; run acloud playroom update demo --playhouse demo to apply it (the playroom restarts)',
    );
  throw new Error(
    "image \"claude-code-dind\" runs a Docker daemon and requires a privileged playroom (--privileged at create); use 'claude-code' (or 'claude-code-rootless') for an unprivileged playroom",
  );
}

const binaryStatus = {
  Path: '/dummy/bin/acloud',
  Source: 'path',
  Found: true,
  Version: '0.39.0',
  Message: 'Simulated installation for UI development.',
  ConfiguredPath: '',
  EnvironmentOverride: false,
};

// One result per check, like local.CheckHealth; the editor check fails so the preview shows a fix.
function simulateHealthChecks(input: Partial<HealthCheckInput>): HealthCheck[] {
  const terminal = TERMINALS.find((entry) => entry.id === (input.Terminal || 'terminal'));
  const check = (fields: Partial<HealthCheck>): HealthCheck =>
    ({ Fix: '', Command: '', Action: '', Status: 'passed', ...fields }) as HealthCheck;
  return [
    check({
      Key: 'acloud',
      Name: 'acloud',
      Explanation: `acloud ${binaryStatus.Version} at ${binaryStatus.Path}. Simulated.`,
    }),
    signedIn
      ? check({
          Key: 'sign-in',
          Name: 'Signed in to Acloud',
          Explanation: `Signed in as ${dummyUser}.`,
        })
      : check({
          Key: 'sign-in',
          Name: 'Signed in to Acloud',
          Status: 'failed',
          Explanation: 'The current acloud context has no stored credentials.',
          Fix: 'Sign in.',
          Command: 'acloud auth login',
          Action: 'sign-in',
        }),
    check({ Key: 'ssh-key', Name: 'SSH public key', Explanation: 'Found ~/.ssh/id_ed25519.pub.' }),
    input.CheckTailscale
      ? check({
          Key: 'tailscale',
          Name: 'Tailscale',
          Explanation: 'Tailscale 1.80.0 is logged in.',
        })
      : check({
          Key: 'tailscale',
          Name: 'Tailscale',
          Status: 'skipped',
          Explanation: 'Not needed: this playhouse does not use Tailscale.',
        }),
    terminal
      ? check({
          Key: 'terminal',
          Name: 'Terminal app',
          Explanation: `${terminal.label} found. Simulated.`,
        })
      : check({
          Key: 'terminal',
          Name: 'Terminal app',
          Status: 'unknown',
          Explanation: `"${input.Terminal}" is not a terminal this app knows.`,
        }),
    input.Editor === 'vscode'
      ? check({
          Key: 'editor',
          Name: 'Editor',
          Status: 'failed',
          Explanation: 'VS Code is installed, but the Remote - SSH extension is not.',
          Fix: 'Install the Remote - SSH extension.',
          Command: 'code --install-extension ms-vscode-remote.remote-ssh',
        })
      : check({
          Key: 'editor',
          Name: 'Editor',
          Explanation: 'Opens through JetBrains Gateway. Simulated.',
        }),
  ];
}

const schedule = new DummySchedule(
  () =>
    Object.entries(rooms)
      .filter(
        ([key]) =>
          key === roomKey(readCache().lastPlayhouse || playhouses[scopeKey()]?.[0]?.Slug || ''),
      )
      .flatMap(([key, entries]) =>
        entries
          .filter((room) => room.Owner === dummyUser && room.Status === 'Ready')
          .map((room) => ({
            Key: `${key}/${room.Name}`,
            Name: room.Name!,
            Playhouse: key.slice(scopeKey().length + 1),
          })),
      ),
  (room) => dummyApi.stopPlayroom(crypto.randomUUID(), room),
);
const scheduleKey = (playhouse: string, name: string) => `${roomKey(playhouse)}/${name}`;

// An exhaustive adapter: dummy mode never imports a live backend implementation at runtime.
const simulatedApi: typeof liveApi = {
  getPlayroomTemplates: () => read(templates),
  savePlayroomTemplates: async (updated) => {
    validatePlayroomTemplates(updated);
    templates.splice(0, templates.length, ...structuredClone(updated));
  },
  exportPlayroomTemplate: async (template) => {
    validatePlayroomTemplates([template]);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ version: 1, templates: [template] }, null, 2)], {
        type: 'application/json',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'playroom-template.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  importPlayroomTemplates: () =>
    new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.addEventListener('cancel', () => resolve([]), { once: true });
      input.addEventListener(
        'change',
        () => {
          const file = input.files?.[0];
          if (!file) {
            resolve([]);
            return;
          }
          void file
            .text()
            .then((content) => resolve(decodePlayroomTemplates(content)))
            .catch(reject);
        },
        { once: true },
      );
      input.click();
    }),
  setSchedulePlayhouse: async () => undefined,
  getScheduleSettings: () => read(schedule.settings),
  setScheduleSettings: async (settings) => {
    schedule.configure(settings);
  },
  getRoomKeepRunning: (playhouse, name) =>
    read(schedule.kept.includes(scheduleKey(playhouse, name))),
  setRoomKeepRunning: async (playhouse, name, keep) => {
    schedule.keep(scheduleKey(playhouse, name), keep);
  },
  getScheduleNotices: () => read(schedule.notices),
  runScheduleAction: (id, action) => schedule.act(id, action),
  onScheduleNotice: (receive) => schedule.subscribe(receive),
  getEnvironmentPresence: (entries, readVariablesFromLoginShell) =>
    read(
      entries
        .filter((entry) => entry.trim() && !entry.includes('='))
        .map((entry) => ({
          Key: entry.trim(),
          Set: readVariablesFromLoginShell && dummyLoginShellEnvironmentKeys.includes(entry.trim()),
        })),
    ),
  checkUpdates: (checkApp: boolean) => {
    const available = new URLSearchParams(window.location.search).get('updates') === 'available';
    return read({
      AppVersion: available && checkApp ? '0.30.0' : '',
      AcloudVersion: available ? '0.41.0' : '',
    });
  },
  getAppVersion: () => read('0.29.1+dummy'),
  exportActivityLog: async (content: string): Promise<void> =>
    downloadFile(content, 'activity-log.txt', 'text/plain;charset=utf-8'),
  exportSettings: async (content: string): Promise<void> =>
    downloadFile(content, 'acloud-playrooms-settings.json', 'application/json'),
  readSettingsToImport: () => chooseFileText('application/json,.json'),
  getAcloudVersion: () => read('0.39.0'),
  isLoggedIn: () => read(signedIn),
  getCachedPlayhouse: () => read(playhouses[scopeKey()]?.[0]?.Slug ?? ''),
  getCurrentUserEmail: () => read(signedIn ? dummyUser : ''),
  getToolStatuses: () =>
    read([
      {
        Name: 'SSH',
        Command: 'ssh',
        State: 'installed',
        Path: '/dummy/bin/ssh',
        Message: 'Simulated installed tool',
      },
      {
        Name: 'Tailscale',
        Command: 'tailscale',
        State: 'installed',
        Path: '/dummy/bin/tailscale',
        Message: 'Simulated installed tool',
      },
      {
        Name: 'VS Code',
        Command: 'code',
        State: 'missing',
        Path: '',
        Message: 'Simulated missing tool',
      },
    ]),
  getAcloudCompatibility: () =>
    read({
      RunningVersion: '0.39.0',
      VerifiedVersion: '0.39.0',
      MinimumVersion: '0.39.0',
      RunningVersionIsNewerThanVerified: false,
      RunningVersionIsOlderThanMinimum: false,
      Explanation: '',
    }),
  checkHealth: (input) => read(simulateHealthChecks(input)),
  getAcloudBinaryStatus: () => read(binaryStatus),
  setAcloudBinary: unavailable,
  clearAcloudBinary: unavailable,
  browseForAcloudBinary: unavailable,
  getTailscaleBinaryStatus: () =>
    read({
      Path: '/dummy/bin/tailscale',
      Source: 'path',
      Found: true,
      Version: '1.80.0',
      Message: 'Simulated installation',
      ConfiguredPath: '',
    }),
  setTailscaleBinary: unavailable,
  clearTailscaleBinary: unavailable,
  browseForTailscaleBinary: unavailable,
  getT3CodePathStatus: () =>
    read({
      Path: '',
      Source: 'none',
      Found: false,
      Version: '',
      Message: 'Not installed in this sample environment.',
      ConfiguredPath: '',
      IsApplication: false,
    }),
  setT3CodePath: unavailable,
  clearT3CodePath: unavailable,
  browseForT3CodePath: unavailable,
  getOperatingSystem: () => read('darwin'),
  // The browser preview has no native window to theme.
  setWindowTitle: async (title) => {
    document.title = title;
  },
  sendDesktopNotification: async (title, target) => {
    console.info('Dummy desktop notification', title, target);
  },
  setDockBadge: async (count) => {
    console.info('Dummy Dock badge', count);
  },
  onDeepLink: (handler: (url: string) => void) => {
    const receive = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === 'string') {
        event.preventDefault();
        handler(event.detail);
      }
    };
    window.addEventListener('dummy:deep-link', receive);
    return () => window.removeEventListener('dummy:deep-link', receive);
  },
  onDesktopNotificationClick: () => () => undefined,
  setMenuBarRooms: async (rooms) => {
    console.info('Dummy menu bar rooms', rooms);
  },
  setKeepRunningInMenuBar: async (keepRunning) => {
    console.info('Dummy keep running in the menu bar', keepRunning);
  },
  showMainWindow: () => Promise.resolve(),
  onMenuBarAction: () => () => undefined,
  onMenuAction: () => () => undefined,
  setWindowTheme: () => Promise.resolve(),
  openUrlInDefaultBrowser: async (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  },
  loginWithTerminal: async () => {
    signedIn = true;
  },
  logout: async () => {
    signedIn = false;
  },
  cancelOperation: () => read(false),
  listOrganisations: () => read(dummyOrganisations[context] ?? []),
  getCurrentOrganisation: () => read(organisation),
  switchOrganisation: async (_operationId, slug) => {
    if (!(dummyOrganisations[context] ?? []).some((entry) => entry.Slug === slug))
      throw new Error('Unknown dummy organisation.');
    await read(null);
    organisation = slug;
  },
  listContexts: () =>
    read(
      dummyContexts.map((entry) => ({
        ...entry,
        Organisation: entry.Name === context ? organisation : entry.Organisation,
      })),
    ),
  getCurrentContext: () => read(context),
  switchContext: async (_operationId, name) => {
    const entry = dummyContexts.find((entry) => entry.Name === name);
    if (!entry) throw new Error('Unknown dummy context.');
    await read(null);
    context = name;
    organisation = entry.Organisation;
  },
  listPlayroomImages: () => read(dummyImages),
  listPlayhouses: () => read(playhouses[scopeKey()] ?? []),
  listCloudAccounts: () =>
    read([
      {
        Identity: 'demo-account',
        DisplayName: 'Demo AWS account',
        Provider: 'aws',
        RegionSlugs: ['eu-west-1', 'eu-central-1'],
      },
    ]),
  listEnvironments: () =>
    read([
      { Slug: 'development', Name: 'Development', Description: 'Sample development environment' },
    ]),
  createPlayhouse: async (_operationId, input) => {
    const slug = input.Name?.startsWith('playhouse-') ? input.Name : `playhouse-${input.Name}`;
    const entries = (playhouses[scopeKey()] ??= []);
    if (entries.some((entry) => entry.Slug === slug))
      throw new Error('A dummy playhouse with this name already exists.');
    entries.push({
      Slug: slug,
      Identity: `demo-${slug}`,
      Status: 'active',
      Region: input.Region || 'eu-west-1',
      Version: 'v1.34.1',
      LayoutVersion: 12,
      LayoutStatus: 'current',
    });
  },
  deletePlayhouse: async (_operationId, input) => {
    const entries = playhouses[scopeKey()] ?? [];
    const entry = entries.find(
      (entry) => entry.Slug === input.Name || entry.Slug === `playhouse-${input.Name}`,
    );
    if (!entry) throw new Error('Dummy playhouse not found.');
    if ((rooms[roomKey(entry.Slug)] ?? []).length && !input.Force)
      throw new Error('This playhouse still contains dummy playrooms.');
    playhouses[scopeKey()] = entries.filter((candidate) => candidate !== entry);
    delete rooms[roomKey(entry.Slug)];
  },
  updatePlayhouse: async (_operationId, input) => {
    const entry = (playhouses[scopeKey()] ?? []).find(
      (entry) => entry.Slug === input.Name || entry.Slug === `playhouse-${input.Name}`,
    );
    if (!entry) throw new Error('Dummy playhouse not found.');
    entry.LayoutStatus = 'current';
    entry.LayoutVersion = 12;
  },
  listPlayrooms: async (input) => {
    simulateFailure(input, 'session');
    return read(rooms[roomKey(input.Playhouse ?? '')] ?? []);
  },
  createPlayroom: async (_operationId, input) => {
    simulateFailure(input, 'privileged');
    if (!input.Name || !input.Playhouse) throw new Error('Choose a name and a playhouse.');
    const entries = (rooms[roomKey(input.Playhouse)] ??= []);
    if (entries.some((entry) => entry.Name === input.Name))
      throw new Error('A dummy playroom with this name already exists.');
    const room: ListingDto = {
      Name: input.Name,
      Owner: dummyUser,
      Status: 'Ready',
      Image: 'opencode',
      SSHHost: `${input.Name}.dummy.example.test`,
      CreatedAt: new Date().toISOString(),
      DiskSize: '20Gi',
      DiskType: input.Ephemeral ? 'ephemeral' : 'persistent',
      CPURequest: '250m',
      CPULimit: '4',
      MemRequest: '2Gi',
      MemLimit: '2Gi',
      CapabilityProfile: 'standard',
      CapabilityAdditions: input.CapAdd ?? [],
      Ports: [],
      Outdated: false,
      System: 'linux/amd64',
    };
    applyRoomSettings(room, input);
    entries.push(room);
  },
  updatePlayroom: async (_operationId, input) => {
    const room = findRoom(input);
    applyRoomSettings(room, input);
    if (input.ChangeCapAdd) room.CapabilityAdditions = input.CapAdd ?? [];
    room.Outdated = false;
  },
  deletePlayroom: async (_operationId, input) => {
    const room = findRoom(input);
    const key = roomKey(input.Playhouse ?? '');
    rooms[key] = rooms[key].filter((entry) => entry !== room);
  },
  startPlayroom: async (_operationId, input) => {
    simulateFailure(input, 'outdated');
    findRoom(input).Status = 'Ready';
  },
  stopPlayroom: async (_operationId, input) => {
    findRoom(input).Status = 'Stopped';
  },
  openPlayroomInEditor: async (_operationId, input) => {
    if (
      !['fast', 'idle', 'missed'].includes(
        new URLSearchParams(window.location.search).get('schedule') ?? '',
      )
    )
      return unavailable();
    findRoom(input);
    schedule.connected(scheduleKey(input.Playhouse ?? '', input.Name ?? ''));
  },
  connectPlayroom: async (input) => {
    simulateFailure(input, 'session');
    findRoom(input);
    schedule.connected(scheduleKey(input.Playhouse ?? '', input.Name ?? ''));
  },
  getPlayroomDefaults: () => read(defaults),
  setPlayroomDefault: async (_operationId, key, value) => {
    const entry = defaults.find((entry) => entry.Key === key);
    if (entry) {
      entry.Value = value;
      entry.Source = 'config';
    } else defaults.push({ Key: key, Value: value, Source: 'config', Builtin: '' });
  },
  unsetPlayroomDefault: async (_operationId, key) => {
    const entry = defaults.find((entry) => entry.Key === key);
    if (entry) {
      entry.Value = entry.Builtin;
      entry.Source = 'built-in';
    }
  },
  unsetAllPlayroomDefaults: async () => {
    defaults.forEach((entry) => {
      entry.Value = entry.Builtin;
      entry.Source = 'built-in';
    });
  },
  previewCreatePlayroom: (input) => preview('playroom create', input),
  previewUpdatePlayroom: (input) => preview('playroom update', input),
  previewDeletePlayroom: (input) => preview('playroom delete', input),
  previewOpenPlayroomInEditor: (input) => preview('playroom open', input),
  previewConnectPlayroom: (input) => preview('playroom connect', input),
  previewCreatePlayhouse: (input) => preview('playhouse create', input),
  previewDeletePlayhouse: (input) => preview('playhouse delete', input),
  previewUpdatePlayhouse: (input) => preview('playhouse update', input),
};

export const dummyApi: typeof liveApi = {
  ...simulatedApi,
  createPlayroom: (operationId, input) =>
    simulateActivity(operationId, ['playroom', 'create', input.Name ?? ''], () =>
      simulatedApi.createPlayroom(operationId, input),
    ),
  updatePlayroom: (operationId, input) =>
    simulateActivity(operationId, ['playroom', 'update', input.Name ?? ''], () =>
      simulatedApi.updatePlayroom(operationId, input),
    ),
  deletePlayroom: (operationId, input) =>
    simulateActivity(operationId, ['playroom', 'delete', input.Name ?? ''], () =>
      simulatedApi.deletePlayroom(operationId, input),
    ),
  startPlayroom: (operationId, input) =>
    simulateActivity(operationId, ['playroom', 'start', input.Name ?? ''], () =>
      simulatedApi.startPlayroom(operationId, input),
    ),
  stopPlayroom: (operationId, input) =>
    simulateActivity(operationId, ['playroom', 'stop', input.Name ?? ''], () =>
      simulatedApi.stopPlayroom(operationId, input),
    ),
  openPlayroomInEditor: (operationId, input) =>
    simulateActivity(operationId, ['playroom', 'open', input.Name ?? ''], () =>
      simulatedApi.openPlayroomInEditor(operationId, input),
    ),
  createPlayhouse: (operationId, input) =>
    simulateActivity(operationId, ['playhouse', 'create', input.Name ?? ''], () =>
      simulatedApi.createPlayhouse(operationId, input),
    ),
  deletePlayhouse: (operationId, input) =>
    simulateActivity(operationId, ['playhouse', 'delete', input.Name ?? ''], () =>
      simulatedApi.deletePlayhouse(operationId, input),
    ),
  updatePlayhouse: (operationId, input) =>
    simulateActivity(operationId, ['playhouse', 'update', input.Name ?? ''], () =>
      simulatedApi.updatePlayhouse(operationId, input),
    ),
};
