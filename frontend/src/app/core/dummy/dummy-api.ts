import { simulateActivity } from './activity-events';
import type { ListingDto } from '../../shared/models';
import type {
  wailsApi as liveApi,
  PlayroomCreateInput,
  PlayroomUpdateInput,
} from '../services/wails-api-live';
import {
  dummyContexts,
  dummyDefaults,
  dummyImages,
  dummyOrganisations,
  dummyPlayhouses,
  dummyRooms,
  dummyUser,
} from './fixtures';

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
    if (value === '' || value === undefined || value === false || value === null) continue;
    args.push(
      `--${key.replace(/[A-Z]/g, (letter, index) => `${index ? '-' : ''}${letter.toLowerCase()}`)}`,
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

const binaryStatus = {
  Path: '/dummy/bin/acloud',
  Source: 'path',
  Found: true,
  Version: '0.39.0',
  Message: 'Simulated installation for UI development.',
  ConfiguredPath: '',
  EnvironmentOverride: false,
};

// An exhaustive adapter: dummy mode never imports a live backend implementation at runtime.
const simulatedApi: typeof liveApi = {
  exportActivityLog: async (content: string): Promise<void> => {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'activity-log.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
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
  listPlayrooms: (input) => read(rooms[roomKey(input.Playhouse ?? '')] ?? []),
  createPlayroom: async (_operationId, input) => {
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
    findRoom(input).Status = 'Ready';
  },
  stopPlayroom: async (_operationId, input) => {
    findRoom(input).Status = 'Stopped';
  },
  openPlayroomInEditor: unavailable,
  connectPlayroom: unavailable,
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
