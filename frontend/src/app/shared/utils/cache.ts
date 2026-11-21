import { runtimeMode } from '../../core/development/runtime-mode';
import { CacheState } from '../models/system';

export const CACHE_KEY = runtimeMode.dummy
  ? 'acloud-playroom-gui-dummy-cache'
  : 'acloud-playroom-gui-cache';

export const defaultCache: CacheState = {
  preferredAction: 'nothing',
  lastPlayhouse: runtimeMode.dummy ? 'playhouse-platform-dev' : '',
  lastPlayroom: '',
  lastEditor: 'vscode',
  lastTerminal: 'terminal',
  lastTheme: 'dark',
  backgroundGrain: true,
  ameRobot: true,
  createPlayroomMode: 'easy',
  setupCompleted: runtimeMode.dummy,
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

/** A cache from before setup has no `setupCompleted` key; one with a playhouse was set up by hand. */
export function installWasSetUpBeforeSetupExisted(): boolean {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const stored = JSON.parse(raw) as Partial<CacheState>;
    return !('setupCompleted' in stored) && !!stored.lastPlayhouse;
  } catch {
    return false;
  }
}

export function updateCache(partial: Partial<CacheState>): CacheState {
  const next = { ...readCache(), ...partial };
  writeCache(next);
  return next;
}
