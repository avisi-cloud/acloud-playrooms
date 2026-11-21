import { Playroom } from '../models';

/** What deleting a playroom removes, built only from what the room reports; unreported facts get no line. */
export function listDeleteConsequences(room: Pick<Playroom, 'disk' | 'diskType'>): string[] {
  const consequences = [
    room.disk
      ? `The home folder /home/playroom (${room.disk}) and everything in it`
      : 'The home folder /home/playroom and everything in it',
  ];
  if (room.diskType === 'persistent') {
    consequences.push('Its persistent storage, which cannot be recovered');
  } else if (room.diskType === 'ephemeral') {
    consequences.push('Its ephemeral storage, which a restart wipes anyway');
  }
  return consequences;
}
