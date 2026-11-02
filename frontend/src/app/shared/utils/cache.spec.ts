import { CACHE_KEY, readCache, updateCache } from './cache';

describe('background grain preference', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('defaults to on for a fresh installation', () => {
    expect(readCache().backgroundGrain).toBe(true);
  });

  it('defaults to on for preferences saved before background grain existed', () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ lastTheme: 'light' }));

    expect(readCache().backgroundGrain).toBe(true);
    expect(readCache().lastTheme).toBe('light');
  });

  it('keeps background grain off when other preferences change', () => {
    updateCache({ backgroundGrain: false });
    updateCache({ lastTheme: 'light' });

    expect(readCache().backgroundGrain).toBe(false);
  });
});

describe('AME Robot preference', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('defaults to on for fresh and existing installations', () => {
    expect(readCache().ameRobot).toBe(true);
    localStorage.setItem(CACHE_KEY, JSON.stringify({ lastTheme: 'light' }));
    expect(readCache().ameRobot).toBe(true);
  });

  it('keeps AME Robot off when other preferences change', () => {
    updateCache({ ameRobot: false });
    updateCache({ backgroundGrain: false, lastTheme: 'system' });
    expect(readCache().ameRobot).toBe(false);
  });
});
