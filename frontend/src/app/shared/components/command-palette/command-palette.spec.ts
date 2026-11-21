import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { CommandPaletteComponent } from './command-palette';
import { PlayroomStateService } from '../../../core/services/playroom-state';
import { PlayroomLifecycleService } from '../../../core/services/playroom-lifecycle';
import { ShortcutsService } from '../../../core/services/shortcuts';
import { PlayhouseEntry, wailsApi } from '../../../core/services/wails-api';
import { listingToRoom } from '../../utils/playroom-mappers';

const playhouse: PlayhouseEntry = {
  Slug: 'playhouse-b',
  Region: 'example',
  Identity: '',
  Status: '',
  Version: '',
  LayoutVersion: null,
  LayoutStatus: 'unknown',
};

describe('CommandPaletteComponent', () => {
  const lifecycle = { pendingOperation: vi.fn(), start: vi.fn(), stop: vi.fn(), reload: vi.fn() };
  beforeEach(async () => {
    vi.spyOn(wailsApi, 'onMenuAction').mockReturnValue(() => {});
    vi.spyOn(wailsApi, 'listPlayhouses').mockResolvedValue([]);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: PlayroomLifecycleService, useValue: lifecycle }],
    });
    TestBed.overrideComponent(CommandPaletteComponent, { set: { template: '', imports: [] } });
    await TestBed.compileComponents();
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('playhouse-a');
    state.markRoomsLoaded('playhouse-a');
    state.setRooms([
      listingToRoom({ Name: 'workspace', Status: 'Ready' }, 'playhouse-a'),
      listingToRoom({ Name: 'sleeping', Status: 'Stopped' }, 'playhouse-a'),
      listingToRoom({ Name: 'other', Status: 'Ready' }, 'playhouse-b'),
    ]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('wraps arrows, resets selection on search and runs only after the palette hides', () => {
    const fixture = TestBed.createComponent(CommandPaletteComponent);
    fixture.detectChanges();
    const palette = fixture.componentInstance;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    palette.handleKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(palette.activeIndex()).toBe(palette.results().length - 1);
    palette.changeQuery('settings');
    expect(palette.activeIndex()).toBe(0);
    palette.handleKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(navigate).not.toHaveBeenCalled();
    palette.runPendingCommand();
    expect(navigate).toHaveBeenCalledWith('/settings');
    expect(palette.recent()[0]).toBe('settings');
    palette.runPendingCommand();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('uses the shared connect dialog and lifecycle paths, limiting actions to valid statuses', () => {
    const fixture = TestBed.createComponent(CommandPaletteComponent);
    fixture.detectChanges();
    const palette = fixture.componentInstance;
    const connect = vi.spyOn(palette.connectRequest, 'set');
    const labels = palette.commands().map((command) => command.label);
    expect(labels).toContain('Start sleeping');
    expect(labels).not.toContain('Stop sleeping');
    expect(labels).not.toContain('Start workspace');
    expect(labels.some((label) => label.includes('other'))).toBe(false);
    for (const label of [
      'Connect workspace',
      'Open workspace',
      'Stop workspace',
      'Start sleeping',
    ]) {
      palette.chooseCommand(palette.commands().find((command) => command.label === label)!);
      palette.runPendingCommand();
    }
    expect(connect).toHaveBeenCalledWith({
      room: expect.objectContaining({ name: 'workspace' }),
      tab: 'connect',
    });
    expect(connect).toHaveBeenCalledWith({
      room: expect.objectContaining({ name: 'workspace' }),
      tab: 'open',
    });
    expect(lifecycle.stop).toHaveBeenCalledWith(expect.objectContaining({ name: 'workspace' }));
    expect(lifecycle.start).toHaveBeenCalledWith(expect.objectContaining({ name: 'sleeping' }));
  });

  it('refuses pending room actions after selection or status changes', () => {
    const fixture = TestBed.createComponent(CommandPaletteComponent);
    fixture.detectChanges();
    const palette = fixture.componentInstance;
    palette.chooseCommand(
      palette.commands().find((command) => command.label === 'Start sleeping')!,
    );
    TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-b');
    palette.runPendingCommand();
    expect(lifecycle.start).not.toHaveBeenCalled();
  });

  it('removes pending and stale status actions before dispatch', () => {
    const fixture = TestBed.createComponent(CommandPaletteComponent);
    fixture.detectChanges();
    const palette = fixture.componentInstance;
    palette.chooseCommand(
      palette.commands().find((command) => command.label === 'Start sleeping')!,
    );
    const state = TestBed.inject(PlayroomStateService);
    state.setRooms(state.rooms().map((room) => ({ ...room, status: 'ready' })));
    palette.runPendingCommand();
    expect(lifecycle.start).not.toHaveBeenCalled();
    lifecycle.pendingOperation.mockReturnValue('Starting');
    state.setRooms([...state.rooms()]);
    expect(palette.commands().some((command) => command.label === 'Stop workspace')).toBe(false);
    lifecycle.pendingOperation.mockReset();
  });

  it('loads rooms outside the list screen and reports failures without guessing results', async () => {
    const fixture = TestBed.createComponent(CommandPaletteComponent);
    fixture.detectChanges();
    const palette = fixture.componentInstance;
    TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-b');
    lifecycle.reload.mockRejectedValueOnce(new Error('Rooms unavailable'));
    await palette.loadRooms();
    expect(lifecycle.reload).toHaveBeenCalledWith(
      'playhouse-b',
      expect.objectContaining({ playhouse: 'playhouse-b' }),
    );
    expect(palette.roomFailure()).toContain('Rooms unavailable');
    expect(palette.loadingRooms()).toBe(false);
  });

  it('uses the shared refresh, create and theme actions', () => {
    const fixture = TestBed.createComponent(CommandPaletteComponent);
    fixture.detectChanges();
    const palette = fixture.componentInstance;
    const shortcuts = TestBed.inject(ShortcutsService);
    const dispatch = vi.spyOn(shortcuts, 'runAction');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    for (const id of ['refresh', 'new-playroom', 'theme-light'] as const) {
      palette.chooseCommand(palette.commands().find((command) => command.id === id)!);
      palette.runPendingCommand();
      expect(dispatch).toHaveBeenCalledWith(id);
    }
    expect(navigate).toHaveBeenCalledWith(['/rooms'], { queryParams: { create: true } });
    expect(TestBed.inject(PlayroomStateService).themePreference()).toBe('light');
  });

  it('switches playhouses using the chooser selection path and forgets old rooms', async () => {
    const fixture = TestBed.createComponent(CommandPaletteComponent);
    fixture.detectChanges();
    const palette = fixture.componentInstance;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    vi.mocked(wailsApi.listPlayhouses).mockResolvedValueOnce([playhouse]);
    await palette.loadPlayhouses();
    palette.chooseCommand(
      palette.commands().find((command) => command.label === 'Switch playhouse: playhouse-b')!,
    );
    palette.runPendingCommand();
    expect(TestBed.inject(PlayroomStateService).playhouse()).toBe('playhouse-b');
    expect(TestBed.inject(PlayroomStateService).rooms()).toEqual([]);
    expect(navigate).toHaveBeenCalledWith('/rooms');
  });

  it('shows playhouse failures and ignores responses from closed palettes', async () => {
    const fixture = TestBed.createComponent(CommandPaletteComponent);
    fixture.detectChanges();
    const palette = fixture.componentInstance;
    vi.mocked(wailsApi.listPlayhouses).mockRejectedValueOnce(new Error('Unavailable'));
    await palette.loadPlayhouses();
    expect(palette.failure()).toContain('Unavailable');
    expect(palette.loading()).toBe(false);
    let resolve!: (value: PlayhouseEntry[]) => void;
    vi.mocked(wailsApi.listPlayhouses).mockReturnValueOnce(new Promise((done) => (resolve = done)));
    TestBed.inject(ShortcutsService).paletteOpen.set(true);
    fixture.detectChanges();
    TestBed.inject(ShortcutsService).paletteOpen.set(false);
    fixture.detectChanges();
    resolve([playhouse]);
    await Promise.resolve();
    expect(palette.playhouses()).toEqual([]);
  });
});
