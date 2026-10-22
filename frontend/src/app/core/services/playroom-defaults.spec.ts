import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PlayroomDefaultsService } from './playroom-defaults';
import { wailsApi } from './wails-api';

describe('PlayroomDefaultsService', () => {
  let defaults: PlayroomDefaultsService;
  let setPlayroomDefault: ReturnType<typeof vi.fn>;
  let unsetPlayroomDefault: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    defaults = TestBed.inject(PlayroomDefaultsService);
    setPlayroomDefault = vi.spyOn(wailsApi, 'setPlayroomDefault').mockResolvedValue();
    unsetPlayroomDefault = vi.spyOn(wailsApi, 'unsetPlayroomDefault').mockResolvedValue();
  });

  afterEach(() => vi.restoreAllMocks());

  it('sets a value that differs from the built-in', async () => {
    await defaults.saveDefault('image', 'claude-code', 'opencode');

    expect(setPlayroomDefault).toHaveBeenCalledWith(expect.any(String), 'image', 'claude-code');
    expect(unsetPlayroomDefault).not.toHaveBeenCalled();
  });

  // Pinning the built-in would stop the key following a later CLI default.
  it('clears a value set back to the built-in instead of pinning it', async () => {
    await defaults.saveDefault('image', 'opencode', 'opencode');

    expect(unsetPlayroomDefault).toHaveBeenCalledWith(expect.any(String), 'image');
    expect(setPlayroomDefault).not.toHaveBeenCalled();
  });

  it('clears an emptied value', async () => {
    await defaults.saveDefault('ssh-key', '', '');

    expect(unsetPlayroomDefault).toHaveBeenCalledWith(expect.any(String), 'ssh-key');
  });
});
