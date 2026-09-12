import { STATUS } from '../data/status';
import { Playroom, StatusKey } from '../models/playroom';

export type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary';

/**
 * Playroom statuses that warrant polling and a pulsing indicator. `unknown` is
 * here on purpose: an unseen status is more likely a new phase than a final one.
 */
export const TRANSITIONAL_STATUSES = new Set<StatusKey>([
  'creating',
  'starting',
  'no-host',
  'deleting',
  'unknown',
]);

export function isTransitional(status: StatusKey): boolean {
  return TRANSITIONAL_STATUSES.has(status);
}

/** Map a GUI status key to a PrimeNG tag/severity value. */
export function statusSeverity(status: StatusKey): Severity {
  const tone = STATUS[status]?.tone;
  if (tone === 'ok') return 'success';
  if (tone === 'busy') return 'info';
  if (tone === 'warn') return 'warn';
  if (tone === 'bad') return 'danger';
  return 'secondary';
}

export function statusLabel(room: Playroom): string {
  return room.rawStatus || STATUS[room.status]?.label || room.status;
}

export function statusDescription(room: Playroom): string {
  return STATUS[room.status]?.desc || '';
}

/** "you" for the current user, otherwise the local-part of the owner email,
    with an "· ephemeral" suffix for ephemeral rooms. */
export function ownerLabel(room: Playroom, currentUser: string): string {
  const owner = room.owner === currentUser ? 'you' : room.owner.split('@')[0];
  return `${owner}${room.ephemeral ? ' · ephemeral' : ''}`;
}
