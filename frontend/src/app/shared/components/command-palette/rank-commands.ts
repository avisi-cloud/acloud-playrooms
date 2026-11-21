export interface PaletteCommand {
  id: string;
  label: string;
  category: 'Screen' | 'Action' | 'Playroom' | 'Playhouse';
  run: () => void;
}

function fuzzyScore(label: string, query: string): number {
  const text = label.toLowerCase();
  const exact = text.indexOf(query);
  if (exact >= 0) return exact;
  let position = -1;
  let gaps = 0;
  for (const character of query) {
    const next = text.indexOf(character, position + 1);
    if (next < 0) return Infinity;
    gaps += next - position - 1;
    position = next;
  }
  return text.length + gaps;
}

export function rankCommands(
  commands: PaletteCommand[],
  query: string,
  recent: string[],
): PaletteCommand[] {
  const search = query.trim().toLowerCase();
  const recentRank = (id: string) => {
    const index = recent.indexOf(id);
    return index < 0 ? Infinity : index;
  };
  return commands
    .map((command, index) => ({ command, index, score: fuzzyScore(command.label, search) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((first, second) => {
      const recency = recentRank(first.command.id) - recentRank(second.command.id);
      return (
        (Number.isNaN(recency) ? 0 : recency) ||
        (search ? first.score - second.score : 0) ||
        first.index - second.index
      );
    })
    .map((entry) => entry.command);
}

export function rememberCommand(recent: string[], id: string): string[] {
  return [id, ...recent.filter((entry) => entry !== id)].slice(0, 20);
}
