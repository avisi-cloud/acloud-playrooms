import { PaletteCommand, rankCommands, rememberCommand } from './rank-commands';

const commands: PaletteCommand[] = [
  'Settings',
  'Start workspace',
  'Playrooms',
  'Stop workspace',
].map((label) => ({
  id: label,
  label,
  category: 'Action',
  run: () => {},
}));

describe('command ranking', () => {
  it('finds case insensitive subsequences and rejects missing or out of order letters', () => {
    expect(rankCommands(commands, '  STRW  ', []).map((command) => command.label)).toEqual([
      'Start workspace',
    ]);
    expect(rankCommands(commands, 'zz', [])).toEqual([]);
    expect(rankCommands(commands, 'wst', [])).toEqual([]);
  });
  it('ranks Settings first among loose matches for sttng', () => {
    const matches: PaletteCommand[] = ['Start integration-tests', 'Stop testing', 'Settings'].map(
      (label) => ({
        id: label,
        label,
        category: 'Action',
        run: () => {},
      }),
    );
    expect(rankCommands(matches, 'sttng', [])).toHaveLength(3);
    expect(rankCommands(matches, 'sttng', [])[0].label).toBe('Settings');
  });
  it('ranks contiguous matches before scattered ones, retaining registry order for ties', () => {
    expect(rankCommands(commands, 'st', []).map((command) => command.label)).toEqual([
      'Start workspace',
      'Stop workspace',
      'Settings',
    ]);
    expect(rankCommands(commands, '', [])).toEqual(commands);
  });
  it('puts recently used matches first without returning nonmatches or stale ids', () => {
    expect(
      rankCommands(commands, 'st', ['missing', 'Stop workspace', 'Playrooms']).map(
        (command) => command.label,
      ),
    ).toEqual(['Stop workspace', 'Start workspace', 'Settings']);
  });
  it('deduplicates recent items and keeps the latest twenty in session order', () => {
    expect(rememberCommand(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(
      rememberCommand(
        Array.from({ length: 25 }, (_, index) => String(index)),
        'new',
      ),
    ).toHaveLength(20);
  });
});
