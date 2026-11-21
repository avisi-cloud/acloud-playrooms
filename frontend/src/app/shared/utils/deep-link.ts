export type DeepLink =
  | { action: 'rooms' | 'connect'; playhouse: string; room: string }
  | { action: 'create'; playhouse: string };

function decodeName(value: string): string {
  const name = decodeURIComponent(value);
  if (
    !name.trim() ||
    /[\s/\\]/u.test(name) ||
    [...name].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    name === '.' ||
    name === '..'
  )
    throw new Error('The link contains an invalid playhouse or playroom name.');
  return name;
}

export function parseDeepLink(value: string): DeepLink {
  const match = /^acloud-playrooms:\/\/(rooms|connect|create)([^#]*)$/u.exec(value);
  if (!match) throw new Error('Use an acloud-playrooms link to rooms, connect or create.');
  const [, action, remainder] = match;
  if (action === 'create') {
    if (!/^\/?\?playhouse=[^&?]+$/u.test(remainder))
      throw new Error('Create links need exactly one playhouse.');
    return { action, playhouse: decodeName(remainder.slice(remainder.indexOf('=') + 1)) };
  }
  const parts = remainder.split('/');
  if (parts.length !== 3 || remainder.includes('?'))
    throw new Error('Room links need a playhouse and a playroom.');
  return {
    action: action as 'rooms' | 'connect',
    playhouse: decodeName(parts[1]),
    room: decodeName(parts[2]),
  };
}

export function roomDeepLink(playhouse: string, room: string): string {
  return `acloud-playrooms://rooms/${encodeURIComponent(playhouse)}/${encodeURIComponent(room)}`;
}
