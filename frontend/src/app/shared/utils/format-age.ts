export function formatAge(min: number): string {
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** How long ago something happened, in the cards' age format once it is a minute or more. */
export function formatTimeSince(seconds: number): string {
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  return `${formatAge(Math.floor(seconds / 60))} ago`;
}
