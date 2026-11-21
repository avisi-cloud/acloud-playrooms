import { CAPABILITIES } from '../data/images';
import { CreateForm, ListingDto, Playroom, PortForwardDto, StatusKey } from '../models/playroom';

const FAILED_STATES = new Set([
  'CrashLoopBackOff',
  'ImagePullBackOff',
  'ErrImagePull',
  'OOMKilled',
  'Error',
  'CreateContainerConfigError',
  'InvalidImageName',
  'Failed',
]);

/** States the backend reports while a room is still coming up. */
const PENDING_STATES = new Set([
  'Pending',
  'ContainerCreating',
  'PodInitializing',
  'Init',
  'Creating',
  'Provisioning',
]);

export function mapStatus(status = ''): StatusKey {
  if (status === 'Ready') return 'ready';
  if (status === 'Stopped') return 'stopped';
  if (status === 'NotReady' || status === 'Unknown') return 'no-host';
  if (FAILED_STATES.has(status)) return 'failed';
  if (PENDING_STATES.has(status)) return 'creating';
  // Anything else is unrecognised and says so. Still transitional, so it keeps
  // polling, but it never claims to be "creating".
  return 'unknown';
}

export function listingToRoom(listing: ListingDto, playhouse: string): Playroom {
  const createdAt = listing.CreatedAt ? new Date(listing.CreatedAt).getTime() : Date.now();
  const ageMin = Math.max(0, Math.floor((Date.now() - createdAt) / 60000));
  const mapped = mapStatus(listing.Status);
  return {
    name: listing.Name || '',
    owner: listing.Owner || '',
    status: mapped,
    ageMin,
    createdAt:
      listing.CreatedAt && Number.isFinite(createdAt) && new Date(createdAt).getUTCFullYear() > 1
        ? new Date(createdAt).toISOString()
        : null,
    rawStatus: mapped === 'ready' || mapped === 'stopped' ? '' : listing.Status || '',
    disk: listing.DiskSize || '',
    diskType: listing.DiskType || 'persistent',
    host: listing.SSHHost || '',
    image: listing.Image || '',
    cpuReq: listing.CPURequest || '',
    cpuLim: listing.CPULimit || '',
    memReq: listing.MemRequest || '',
    memLim: listing.MemLimit || '',
    ports: renderPortForwards(listing.Ports),
    portForwards:
      listing.Ports === undefined
        ? undefined
        : (listing.Ports ?? []).map((forward) => ({ ...forward })),
    system: listing.System || '',
    capabilityProfile: listing.CapabilityProfile || '',
    capabilityAdditions: listing.CapabilityAdditions ?? [],
    outdated: listing.Outdated === true,
    playhouse,
    ephemeral: listing.DiskType === 'ephemeral',
    env: [],
    git: [],
    copy: [],
  };
}

/** Rendered like acloud's PORTS column, which `parseRenderedPorts` reads back. */
export function renderPortForwards(ports: PortForwardDto[] | null | undefined): string {
  return (ports ?? [])
    .map((forward) =>
      forward.TargetPort === forward.Port
        ? `${forward.Port}`
        : `${forward.Port} → ${forward.TargetPort}`,
    )
    .join(', ');
}

/** Only reported settings override the new room's configured defaults. */
export function createFormFromRoom(room: Playroom): Partial<CreateForm> {
  const form: Partial<CreateForm> = {
    name: '',
    playhouse: room.playhouse,
    privileged: false,
    acknowledgePrivileged: false,
  };
  if (room.image) form.image = room.image;
  if (room.disk) form.storage = room.disk;
  if (room.cpuReq) form.cpuReq = room.cpuReq;
  if (room.cpuLim) form.cpuLim = room.cpuLim;
  if (room.memReq) form.memReq = room.memReq;
  if (room.memLim) form.memLim = room.memLim;
  if (room.portForwards !== undefined) {
    form.ports = room.portForwards.map((forward) =>
      forward.Port === forward.TargetPort
        ? `${forward.Port}`
        : `${forward.Port}:${forward.TargetPort}`,
    );
    if (!form.ports.length) form.ports = [''];
  }
  const profile = CAPABILITIES.find((profile) => profile.id === room.capabilityProfile);
  if (profile) form.capabilities = profile.id;
  if (room.capabilityAdditions.length) form.capAdd = [...room.capabilityAdditions];
  if (room.diskType === 'ephemeral' || room.diskType === 'persistent') {
    form.ephemeral = room.diskType === 'ephemeral';
  }
  return form;
}

export function settingsNotCopiedFromRoom(room: Playroom): string {
  const form = createFormFromRoom(room);
  const missing: string[] = [];
  if (!form.image) missing.push('image');
  if (!form.storage) missing.push('storage size');
  if (!form.cpuReq || !form.cpuLim || !form.memReq || !form.memLim)
    missing.push('unreported resources');
  if (!form.ports) missing.push('ports');
  if (!form.capabilities) missing.push('capability profile');
  return `Not copied: ${[...missing, 'SSH key', 'environment', 'Git', 'copies', 'connectivity', 'system options', 'run options'].join(', ')}. These use defaults; privileged mode requires acknowledgement.`;
}
