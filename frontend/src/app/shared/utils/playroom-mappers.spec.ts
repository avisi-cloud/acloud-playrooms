import { describe, expect, it } from 'vitest';
import { ListingDto } from '../models/playroom';
import {
  createFormFromRoom,
  settingsNotCopiedFromRoom,
  listingToRoom,
  mapStatus,
  renderPortForwards,
} from './playroom-mappers';
import { parseRenderedPorts } from './forms';
import { isTransitional } from './playroom-display';

describe('mapStatus', () => {
  it('maps the states the backend reports to GUI status keys', () => {
    expect(mapStatus('Ready')).toBe('ready');
    expect(mapStatus('Stopped')).toBe('stopped');
    expect(mapStatus('NotReady')).toBe('no-host');
    expect(mapStatus('Unknown')).toBe('no-host');
  });

  it('folds every failure state into one key', () => {
    for (const state of [
      'CrashLoopBackOff',
      'ImagePullBackOff',
      'ErrImagePull',
      'OOMKilled',
      'Error',
      'CreateContainerConfigError',
      'InvalidImageName',
      'Failed',
    ]) {
      expect(mapStatus(state), state).toBe('failed');
    }
  });

  it('maps the known pending phases to creating', () => {
    expect(mapStatus('Pending')).toBe('creating');
    expect(mapStatus('ContainerCreating')).toBe('creating');
  });

  it('treats anything it does not recognise as still coming up, but says so', () => {
    // `unknown` polls like any transitional status, but must not borrow
    // "creating"'s copy and claim to be provisioning.
    expect(mapStatus('SomeFuturePhase')).toBe('unknown');
    expect(mapStatus('')).toBe('unknown');
    expect(mapStatus()).toBe('unknown');
    expect(isTransitional(mapStatus('SomeFuturePhase'))).toBe(true);
  });
});

describe('listingToRoom', () => {
  const base: ListingDto = { Name: 'demo', Owner: 'someone@example.com' };

  it('carries the playhouse through, since the listing does not name it', () => {
    expect(listingToRoom(base, 'playhouse-demo').playhouse).toBe('playhouse-demo');
  });

  it('derives age in whole minutes from CreatedAt', () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    expect(listingToRoom({ ...base, CreatedAt: tenMinutesAgo }, 'ph').ageMin).toBe(10);
  });

  it('never reports a negative age for a clock skewed into the future', () => {
    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    expect(listingToRoom({ ...base, CreatedAt: future }, 'ph').ageMin).toBe(0);
  });

  it('preserves the reported creation date for the detail view', () => {
    expect(listingToRoom({ ...base, CreatedAt: '2026-10-23T09:00:00Z' }, 'ph').createdAt).toBe(
      '2026-10-23T09:00:00.000Z',
    );
  });

  it.each([undefined, null, '', 'not-a-date', '0001-01-01T00:00:00Z'])(
    'does not invent a creation date for %s',
    (CreatedAt) => {
      expect(listingToRoom({ ...base, CreatedAt }, 'ph').createdAt).toBeNull();
    },
  );

  it('keeps individual port mappings without borrowing mutable listing objects', () => {
    const ports = [
      { Port: 80, TargetPort: 8080 },
      { Port: 3000, TargetPort: 3000 },
    ];
    const room = listingToRoom({ ...base, Ports: ports }, 'ph');
    expect(room.portForwards).toEqual(ports);
    ports[0].TargetPort = 9000;
    expect(room.portForwards?.[0].TargetPort).toBe(8080);
    expect(listingToRoom(base, 'ph').portForwards).toBeUndefined();
    expect(listingToRoom({ ...base, Ports: null }, 'ph').portForwards).toEqual([]);
  });

  it('keeps the raw status only when it adds something to the mapped one', () => {
    // Ready and Stopped are self-explanatory; anything else is worth showing
    // verbatim, because that is where the detail lives.
    expect(listingToRoom({ ...base, Status: 'Ready' }, 'ph').rawStatus).toBe('');
    expect(listingToRoom({ ...base, Status: 'Stopped' }, 'ph').rawStatus).toBe('');
    expect(listingToRoom({ ...base, Status: 'CrashLoopBackOff' }, 'ph').rawStatus).toBe(
      'CrashLoopBackOff',
    );
  });

  it('reads ephemeral from the disk type', () => {
    expect(listingToRoom({ ...base, DiskType: 'ephemeral' }, 'ph').ephemeral).toBe(true);
    expect(listingToRoom({ ...base, DiskType: 'persistent' }, 'ph').ephemeral).toBe(false);
  });

  it('renders forwarded ports the way the update form reads them back', () => {
    const ports = [
      { Port: 3000, TargetPort: 3000 },
      { Port: 80, TargetPort: 8080 },
    ];
    const rendered = listingToRoom({ ...base, Ports: ports }, 'ph').ports;
    expect(rendered).toBe('3000, 80 → 8080');
    expect(parseRenderedPorts(rendered)).toEqual(['3000', '80:8080']);
  });

  it('carries the outdated flag and capabilities, and defaults them when missing', () => {
    const room = listingToRoom(
      { ...base, Outdated: true, CapabilityProfile: 'minimal', CapabilityAdditions: ['NET_RAW'] },
      'ph',
    );
    expect(room.outdated).toBe(true);
    expect(room.capabilityProfile).toBe('minimal');
    expect(room.capabilityAdditions).toEqual(['NET_RAW']);
    expect(listingToRoom(base, 'ph').outdated).toBe(false);
    expect(listingToRoom({ ...base, CapabilityAdditions: null }, 'ph').capabilityAdditions).toEqual(
      [],
    );
  });

  it('renders no ports for an SSH-only room', () => {
    expect(listingToRoom({ ...base, Ports: null }, 'ph').ports).toBe('');
    expect(renderPortForwards(undefined)).toBe('');
  });

  it('defaults a missing disk type to persistent rather than blank', () => {
    expect(listingToRoom(base, 'ph').diskType).toBe('persistent');
  });

  it('tolerates a listing with nothing but a name', () => {
    const room = listingToRoom({ Name: 'bare' }, 'ph');
    expect(room.name).toBe('bare');
    expect(room.owner).toBe('');
    expect(room.host).toBe('');
  });
});

describe('createFormFromRoom', () => {
  const listing: ListingDto = {
    Name: 'source',
    Image: 'registry.example.test/workspace:v2',
    DiskSize: '30Gi',
    CPURequest: '500m',
    CPULimit: '3',
    MemRequest: '2Gi',
    MemLimit: '6Gi',
    DiskType: 'ephemeral',
    CapabilityProfile: 'standard',
    CapabilityAdditions: ['NET_RAW'],
    Ports: [
      { Port: 80, TargetPort: 8080 },
      { Port: 3000, TargetPort: 3000 },
    ],
  };

  it.each([
    ['name', ''],
    ['playhouse', 'playhouse-demo'],
    ['image', 'registry.example.test/workspace:v2'],
    ['storage', '30Gi'],
    ['cpuReq', '500m'],
    ['cpuLim', '3'],
    ['memReq', '2Gi'],
    ['memLim', '6Gi'],
    ['ports', ['80:8080', '3000']],
    ['capabilities', 'standard'],
    ['capAdd', ['NET_RAW']],
    ['ephemeral', true],
    ['privileged', false],
    ['acknowledgePrivileged', false],
  ] as const)('maps %s', (field, expected) => {
    expect(createFormFromRoom(listingToRoom(listing, 'playhouse-demo'))[field]).toEqual(expected);
  });

  it('only overrides reported settings, leaving unreported settings to configured defaults', () => {
    const form = createFormFromRoom(listingToRoom({ Name: 'bare' }, 'ph'));
    expect(form.image).toBeUndefined();
    expect(form.storage).toBeUndefined();
    expect(form.cpuReq).toBeUndefined();
    expect(form.cpuLim).toBeUndefined();
    expect(form.memReq).toBeUndefined();
    expect(form.memLim).toBeUndefined();
    expect(form.ports).toBeUndefined();
    expect(form.capabilities).toBeUndefined();
    expect(form.sshKey).toBeUndefined();
    expect(form.env).toBeUndefined();
    expect(form.git).toBeUndefined();
    expect(form.copy).toBeUndefined();
    expect(form.exposure).toBeUndefined();
    expect(form.readOnly).toBeUndefined();
    expect(form.workspaceNamespace).toBeUndefined();
    expect(form.noWait).toBeUndefined();
  });

  it('copies persistent storage and explicitly empty ports', () => {
    const form = createFormFromRoom(
      listingToRoom({ ...listing, DiskType: 'persistent', Ports: [] }, 'ph'),
    );
    expect(form.ephemeral).toBe(false);
    expect(form.ports).toEqual(['']);
  });

  it('leaves an unknown capability profile at its default and names it in the hint', () => {
    const room = listingToRoom({ ...listing, CapabilityProfile: 'future-profile' }, 'ph');
    expect(createFormFromRoom(room).capabilities).toBeUndefined();
    expect(settingsNotCopiedFromRoom(room)).toContain('capability profile');
  });

  it('does not borrow the source arrays', () => {
    const room = listingToRoom(listing, 'ph');
    const form = createFormFromRoom(room);
    form.capAdd?.push('SYS_PTRACE');
    form.ports?.push('9000');
    expect(room.capabilityAdditions).toEqual(['NET_RAW']);
    expect(room.portForwards).toHaveLength(2);
  });

  it('names settings that cannot be copied', () => {
    const hint = settingsNotCopiedFromRoom(listingToRoom(listing, 'ph'));
    for (const text of [
      'Not copied:',
      'SSH key',
      'environment',
      'Git',
      'copies',
      'connectivity',
      'system options',
      'run options',
    ]) {
      expect(hint).toContain(text);
    }
  });
});
