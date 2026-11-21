import { TestBed } from '@angular/core/testing';
import { EnvironmentService } from './environment';
import { CACHE_KEY } from '../../shared/utils/cache';

describe('EnvironmentService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('defaults off and persists only the choice', () => {
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    });
    const service = TestBed.inject(EnvironmentService);
    expect(service.readVariablesFromLoginShell()).toBe(false);
    service.setReadVariablesFromLoginShell(true);
    expect(JSON.parse(saved.get(CACHE_KEY)!)).toMatchObject({ readVariablesFromLoginShell: true });
    expect(new EnvironmentService().readVariablesFromLoginShell()).toBe(true);
  });
});
