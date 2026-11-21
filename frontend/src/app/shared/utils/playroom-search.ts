import { Playroom } from '../models';

export function buildSearchableRoomText(room: Playroom): string {
  return [
    room.name,
    room.owner,
    room.image,
    room.ports,
    ...(room.portForwards ?? []).flatMap((port) => [port.Port, port.TargetPort]),
  ]
    .join(' ')
    .toLowerCase();
}
