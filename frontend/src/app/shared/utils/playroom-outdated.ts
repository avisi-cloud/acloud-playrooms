import { Playroom } from '../models';

export interface OutdatedBadge {
  label: string;
  hint: string;
  /** False for a disposable room, which `playroom update` refuses. */
  opensUpdate: boolean;
}

/** What an outdated room should do about it, the way `playroom list` says it; null when current. */
export function describeOutdated(
  room: Pick<Playroom, 'outdated' | 'ephemeral'>,
): OutdatedBadge | null {
  if (!room.outdated) return null;
  if (room.ephemeral) {
    return {
      label: 'outdated',
      hint: 'Missing the latest security hardening. A disposable playroom cannot be updated: delete it and create a new one.',
      opensUpdate: false,
    };
  }
  return {
    label: 'update available',
    hint: 'Missing the latest security hardening. Update applies it; the playroom restarts.',
    opensUpdate: true,
  };
}

/** Rendered like acloud's CAPABILITIES column: "minimal + NET_RAW,SYS_PTRACE". */
export function renderCapabilities(
  room: Pick<Playroom, 'capabilityProfile' | 'capabilityAdditions'>,
): string {
  if (!room.capabilityProfile) return '';
  if (room.capabilityAdditions.length === 0) return room.capabilityProfile;
  return `${room.capabilityProfile} + ${room.capabilityAdditions.join(',')}`;
}
