import { CacheState } from '../models/system';

const CACHE_KEY = 'acloud-playroom-gui-cache';

export const defaultCache: CacheState = {
  lastPlayhouse: '',
  lastPlayroom: '',
  lastEditor: 'vscode',
  lastTerminal: 'terminal',
  lastTheme: 'dark',
};

export function readCache(): CacheState {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? { ...defaultCache, ...JSON.parse(raw) } : { ...defaultCache };
  } catch {
    return { ...defaultCache };
  }
}

export function writeCache(next: CacheState): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    // localStorage may be unavailable in tests or restricted environments.
  }
}

export function updateCache(partial: Partial<CacheState>): CacheState {
  const next = { ...readCache(), ...partial };
  writeCache(next);
  return next;
}
