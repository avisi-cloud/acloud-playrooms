import { formatAge, formatTimeSince } from './format-age';

describe('formatAge', () => {
  it('uses the largest whole unit', () => {
    expect(formatAge(5)).toBe('5m');
    expect(formatAge(125)).toBe('2h');
    expect(formatAge(3000)).toBe('2d');
  });
});

describe('formatTimeSince', () => {
  it('says just now for the first seconds, then seconds, then the card age format', () => {
    expect(formatTimeSince(0)).toBe('just now');
    expect(formatTimeSince(4.9)).toBe('just now');
    expect(formatTimeSince(8.4)).toBe('8s ago');
    expect(formatTimeSince(59)).toBe('59s ago');
    expect(formatTimeSince(60)).toBe('1m ago');
    expect(formatTimeSince(2 * 3600)).toBe('2h ago');
  });
});
