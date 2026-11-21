import { listingToRoom } from './playroom-mappers';
import { groupPlayroomsByOwner, sortPlayrooms } from './playroom-overview';

const room = (name: string, owner = '', ageMin = 0, status = 'Ready') => ({
  ...listingToRoom({ Name: name, Owner: owner, Status: status }, 'playhouse-platform-dev'),
  ageMin,
});

describe('sortPlayrooms', () => {
  const rooms = [room('zeta', '', 2, 'Stopped'), room('alpha', '', 1), room('beta', '', 1)];
  const isPinned = (candidate: { name: string }) => candidate.name === 'zeta';

  for (const sort of ['name', 'age', 'status'] as const) {
    it(`puts pins first, sorts by ${sort} and breaks ties by name without mutating input`, () => {
      const sorted = sortPlayrooms(rooms, sort, isPinned);
      expect(sorted.map((candidate) => candidate.name)).toEqual(['zeta', 'alpha', 'beta']);
      expect(sorted).not.toBe(rooms);
      expect(rooms.map((candidate) => candidate.name)).toEqual(['zeta', 'alpha', 'beta']);
    });
  }

  it('sorts ages ascending and statuses alphabetically within pinned and unpinned rooms', () => {
    const rooms = [
      room('alpha', '', 5, 'Stopped'),
      room('zeta', '', 1),
      room('beta', '', 3, 'Failed'),
    ];
    expect(sortPlayrooms(rooms, 'age', () => false).map((candidate) => candidate.name)).toEqual([
      'zeta',
      'beta',
      'alpha',
    ]);
    expect(sortPlayrooms(rooms, 'status', () => false).map((candidate) => candidate.name)).toEqual([
      'beta',
      'zeta',
      'alpha',
    ]);
  });
});

describe('groupPlayroomsByOwner', () => {
  it('puts Mine first, then full owners alphabetically, and unreported ownership last', () => {
    const rooms = [
      room('unknown'),
      room('other', 'z@example.test'),
      room('mine', 'me@example.test'),
      room('first', 'a@example.test'),
    ];
    const groups = groupPlayroomsByOwner(rooms, 'me@example.test');
    expect(groups.map((group) => [group.owner, group.label, group.rooms.length])).toEqual([
      ['me@example.test', 'Mine', 1],
      ['a@example.test', 'a@example.test', 1],
      ['z@example.test', 'z@example.test', 1],
      ['', 'Not reported', 1],
    ]);
    expect(rooms[0].name).toBe('unknown');
  });

  it('preserves sorted pin order inside each group and never combines different full owners', () => {
    const rooms = [
      room('alpha', 'dev@b.test'),
      room('zeta', 'dev@a.test'),
      room('beta', 'dev@a.test'),
    ];
    const sorted = sortPlayrooms(rooms, 'name', (candidate) => candidate.name === 'zeta');
    const groups = groupPlayroomsByOwner(sorted, '');
    expect(groups.map((group) => group.rooms.map((candidate) => candidate.name))).toEqual([
      ['zeta', 'beta'],
      ['alpha'],
    ]);
  });

  it('does not call unknown ownership Mine when the current user is missing, and omits empty groups', () => {
    expect(groupPlayroomsByOwner([room('unknown')], '')[0].label).toBe('Not reported');
    expect(groupPlayroomsByOwner([], 'me@example.test')).toEqual([]);
    expect(
      groupPlayroomsByOwner([room('other', 'other@example.test')], 'me@example.test').map(
        (group) => group.label,
      ),
    ).toEqual(['other@example.test']);
  });
});
