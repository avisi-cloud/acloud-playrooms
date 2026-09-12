import { ListingDto, Playroom, StatusKey } from '../models/playroom';

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
    rawStatus: mapped === 'ready' || mapped === 'stopped' ? '' : listing.Status || '',
    disk: listing.DiskSize || '',
    diskType: listing.DiskType || 'persistent',
    host: listing.SSHHost || '',
    image: listing.Image || '',
    cpuReq: listing.CPURequest || '',
    cpuLim: listing.CPULimit || '',
    memReq: listing.MemRequest || '',
    memLim: listing.MemLimit || '',
    ports: listing.Ports || '',
    system: listing.System || '',
    playhouse,
    ephemeral: listing.DiskType === 'ephemeral',
    env: [],
    git: [],
    copy: [],
  };
}
