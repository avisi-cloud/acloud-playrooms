import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ScopeService } from './scope';
import { PlayroomStateService } from './playroom-state';
import { Playroom } from '../../shared/models';
import { PlayhouseEntry, wailsApi } from './wails-api';

describe('ScopeService', () => {
  let scope: ScopeService;
  let state: PlayroomStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    scope = TestBed.inject(ScopeService);
    state = TestBed.inject(PlayroomStateService);
  });

  afterEach(() => vi.restoreAllMocks());

  const playhouse = (slug: string) =>
    ({
      Identity: slug,
      Slug: slug,
      Status: 'active',
      Region: 'eu',
      Version: '1',
    }) as PlayhouseEntry;

  /**
   * The reset exists in one place so a scope switch and a sign-out cannot clear
   * different things.
   */
  it('drops everything that belonged to the scope being left', async () => {
    vi.spyOn(wailsApi, 'listPlayhouses').mockResolvedValue([playhouse('a')]);
    await scope.loadPlayhousesForMenu();
    state.selectPlayhouse('a');
    state.setRooms([{ name: 'room-a' } as Playroom]);
    state.setRoomsCount(1);
    const revisionBefore = state.scopeRevision();

    scope.forgetEverythingBelongingToPreviousScope();

    expect(state.playhouse()).toBe('');
    expect(state.rooms()).toEqual([]);
    expect(state.roomsCount()).toBe(0);
    expect(scope.playhouses()).toEqual([]);
    // Screens already open watch this; without it a switch made while on the
    // playhouse screen left the previous organisation's list on display.
    expect(state.scopeRevision()).toBe(revisionBefore + 1);
  });

  it('does nothing when the picker chooses what is already selected', async () => {
    const switchOrganisation = vi.spyOn(wailsApi, 'switchOrganisation');
    vi.spyOn(wailsApi, 'getCurrentContext').mockResolvedValue('ctx');
    vi.spyOn(wailsApi, 'getCurrentOrganisation').mockResolvedValue('avisi');
    vi.spyOn(wailsApi, 'listContexts').mockResolvedValue([]);
    vi.spyOn(wailsApi, 'listOrganisations').mockResolvedValue([]);
    await scope.loadContextAndOrganisation();

    expect(await scope.switchToOrganisation('avisi')).toBeNull();
    expect(await scope.switchToContext('ctx')).toBeNull();
    expect(switchOrganisation).not.toHaveBeenCalled();
  });

  it('reports a failed switch instead of throwing, so the shell can toast it', async () => {
    vi.spyOn(wailsApi, 'switchOrganisation').mockRejectedValue(new Error('no such organisation'));

    const result = await scope.switchToOrganisation('nope');

    expect(result?.succeeded).toBe(false);
    expect(result?.errorMessage).toContain('no such organisation');
    expect(result?.operationId).not.toBe('');
  });
});
