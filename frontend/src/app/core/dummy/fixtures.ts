import type { ListingDto } from '../../shared/models';
import type {
  ContextEntry,
  OrganisationEntry,
  PlayhouseEntry,
  ImageEntry,
  PlayroomDefaultEntry,
} from '../services/wails-api-live';

export const dummyUser = 'alex@example.test';

export const dummyContexts: ContextEntry[] = [
  { Name: 'development', Organisation: 'platform' },
  { Name: 'staging', Organisation: 'sandbox' },
];

export const dummyOrganisations: Record<string, OrganisationEntry[]> = {
  development: [
    { Slug: 'platform', Name: 'Platform team' },
    { Slug: 'product', Name: 'Product engineering' },
    { Slug: 'new-team', Name: 'New team (empty)' },
  ],
  staging: [{ Slug: 'sandbox', Name: 'Integration sandbox' }],
};

function playhouse(Slug: string, Region = 'eu-west-1', LayoutStatus = 'current'): PlayhouseEntry {
  return {
    Slug,
    Identity: `demo-${Slug}`,
    Status: 'active',
    Region,
    Version: 'v1.34.1',
    LayoutVersion: LayoutStatus === 'outdated' ? 11 : 12,
    LayoutStatus,
  };
}

// Keys include the complete scope, so switching never leaks data between contexts.
export const dummyPlayhouses: Record<string, PlayhouseEntry[]> = {
  'development/platform': [
    playhouse('playhouse-platform-dev'),
    playhouse('playhouse-platform-shared', 'eu-central-1', 'outdated'),
    playhouse('playhouse-platform-infrastructure-experiments-with-a-long-name'),
  ],
  'development/product': [
    playhouse('playhouse-product-dev'),
    playhouse('playhouse-product-preview'),
  ],
  'development/new-team': [],
  'staging/sandbox': [playhouse('playhouse-integration-staging')],
};

function room(Name: string, extra: Partial<ListingDto> = {}): ListingDto {
  return {
    Name,
    Owner: dummyUser,
    Status: 'Ready',
    Image: 'opencode',
    SSHHost: `${Name}.dummy.example.test`,
    CreatedAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
    CPURequest: '500m',
    CPULimit: '4',
    MemRequest: '2Gi',
    MemLimit: '4Gi',
    DiskSize: '20Gi',
    DiskType: 'persistent',
    System: 'linux/amd64',
    CapabilityProfile: 'standard',
    CapabilityAdditions: [],
    Outdated: false,
    Ports: [
      { Port: 3000, TargetPort: 3000 },
      { Port: 8080, TargetPort: 80 },
    ],
    ...extra,
  };
}

export const dummyRooms: Record<string, ListingDto[]> = {
  'development/platform/playhouse-platform-dev': [
    room('api-development'),
    room('frontend-redesign', { Image: 'claude-code', DiskSize: '40Gi', Outdated: true }),
    room('review-payments', {
      Owner: 'sam@example.test',
      Status: 'Stopped',
      SSHHost: '',
      Ports: [],
    }),
    room('integration-tests', { Status: 'ContainerCreating', SSHHost: '', DiskType: 'ephemeral' }),
    room('failed-image-build', {
      Status: 'ImagePullBackOff',
      Image: 'custom-image:missing',
      SSHHost: '',
    }),
    room('workspace-with-a-long-name-for-layout-experiments', {
      Owner: 'jordan@example.test',
      CPURequest: '2',
      MemRequest: '8Gi',
      MemLimit: '16Gi',
    }),
  ],
  'development/platform/playhouse-platform-shared': [
    room('shared-tooling', { Owner: 'sam@example.test' }),
  ],
  'development/product/playhouse-product-dev': [
    room('product-api'),
    room('design-system', { Image: 'claude-code' }),
  ],
  'staging/sandbox/playhouse-integration-staging': [
    room('release-validation', { Status: 'Stopped', SSHHost: '' }),
  ],
};

export const dummyImages: ImageEntry[] = [
  {
    Name: 'opencode',
    Reference: 'registry.example.test/playrooms/opencode:latest',
    Description: 'OpenCode workspace',
    IsDefault: true,
    RequiresPrivileged: false,
  },
  {
    Name: 'claude-code',
    Reference: 'registry.example.test/playrooms/claude-code:latest',
    Description: 'Claude Code workspace',
    IsDefault: false,
    RequiresPrivileged: false,
  },
  {
    Name: 'claude-code-dind',
    Reference: 'registry.example.test/playrooms/claude-code-dind:latest',
    Description: 'Workspace with Docker',
    IsDefault: false,
    RequiresPrivileged: true,
  },
];

export const dummyDefaults: PlayroomDefaultEntry[] = Object.entries({
  image: 'opencode',
  storage: '20Gi',
  'cpu-request': '250m',
  'cpu-limit': '4',
  'memory-request': '2Gi',
  'memory-limit': '2Gi',
  'wait-timeout': '10m',
  exposure: 'tailscale',
  capabilities: 'standard',
  ephemeral: 'false',
  'read-only': 'false',
  privileged: 'false',
  'workspace-namespace': 'false',
}).map(([Key, Builtin]) => ({ Key, Builtin, Value: Builtin, Source: 'built-in' }));
