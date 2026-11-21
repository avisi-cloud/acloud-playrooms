import { Playroom, PlayroomSort } from '../models/playroom';

export interface PlayroomOwnerGroup {
  owner: string;
  label: string;
  rooms: Playroom[];
}

export function sortPlayrooms(
  rooms: readonly Playroom[],
  sort: PlayroomSort,
  isPinned: (room: Playroom) => boolean,
): Playroom[] {
  return [...rooms].sort((left, right) => {
    const pinned = Number(isPinned(right)) - Number(isPinned(left));
    return (
      pinned ||
      (sort === 'age'
        ? left.ageMin - right.ageMin || left.name.localeCompare(right.name)
        : sort === 'status'
          ? left.status.localeCompare(right.status) || left.name.localeCompare(right.name)
          : left.name.localeCompare(right.name))
    );
  });
}

export function groupPlayroomsByOwner(
  rooms: readonly Playroom[],
  currentUser: string,
): PlayroomOwnerGroup[] {
  const groups = new Map<string, PlayroomOwnerGroup>();
  for (const room of rooms) {
    let group = groups.get(room.owner);
    if (!group) {
      group = {
        owner: room.owner,
        label: room.owner && room.owner === currentUser ? 'Mine' : room.owner || 'Not reported',
        rooms: [],
      };
      groups.set(room.owner, group);
    }
    group.rooms.push(room);
  }
  return [...groups.values()].sort((left, right) => {
    const mine =
      Number(!!right.owner && right.owner === currentUser) -
      Number(!!left.owner && left.owner === currentUser);
    return (
      mine || Number(!left.owner) - Number(!right.owner) || left.owner.localeCompare(right.owner)
    );
  });
}
