import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { listingToRoom, readCache, updateCache } from '../../shared/utils';
import { describeMenuBarRooms, MenuBarService } from './menu-bar';
import { PlayroomConnectService } from './playroom-connect';
import { PlayroomDefaultsService } from './playroom-defaults';
import { PlayroomLifecycleService } from './playroom-lifecycle';
import { PlayroomStateService } from './playroom-state';
import { ToastService } from './toast';
import { MenuBarRequest, wailsApi } from './wails-api';

const room = (status: string, name = 'demo', playhouse = 'ph') =>
  listingToRoom({ Name: name, Status: status }, playhouse);

describe('describeMenuBarRooms', () => {
  it('lists the loaded rooms of the current playhouse by name, with their card status', () => {
    const rooms = [
      room('Stopped', 'web'),
      room('Ready', 'api'),
      room('Ready', 'elsewhere', 'other'),
      { ...room('Ready', 'odd'), status: 'unknown' as const, rawStatus: 'Hibernating' },
    ];
    expect(
      describeMenuBarRooms('ph', 'ph', rooms, (name) => (name === 'web' ? 'Starting' : '')),
    ).toEqual({
      Playhouse: 'ph',
      Loaded: true,
      Rooms: [
        { Name: 'api', Status: 'ready', StatusLabel: 'Ready', PendingOperation: '' },
        { Name: 'odd', Status: 'unknown', StatusLabel: 'Hibernating', PendingOperation: '' },
        { Name: 'web', Status: 'stopped', StatusLabel: 'Stopped', PendingOperation: 'Starting' },
      ],
    });
  });

  it('claims no rooms until a list for the current playhouse has loaded', () => {
    const rooms = [room('Ready')];
    expect(describeMenuBarRooms('ph', null, rooms, () => '')).toEqual({
      Playhouse: 'ph',
      Loaded: false,
      Rooms: [],
    });
    expect(describeMenuBarRooms('ph', 'other', rooms, () => '').Loaded).toBe(false);
    expect(describeMenuBarRooms('', '', rooms, () => '').Loaded).toBe(false);
  });
});

describe('MenuBarService', () => {
  let service: MenuBarService;
  let state: PlayroomStateService;
  let lifecycle: PlayroomLifecycleService;
  let connections: PlayroomConnectService;
  let notify: ToastService;
  let choose: (request: MenuBarRequest) => void;

  const request = (action: MenuBarRequest['action'], name = 'demo'): MenuBarRequest => ({
    action,
    room: name,
    playhouse: 'ph',
  });

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(wailsApi, 'setMenuBarRooms').mockResolvedValue();
    vi.spyOn(wailsApi, 'setKeepRunningInMenuBar').mockResolvedValue();
    vi.spyOn(wailsApi, 'showMainWindow').mockResolvedValue();
    vi.spyOn(wailsApi, 'onMenuBarAction').mockImplementation((handler) => {
      choose = handler;
      return vi.fn();
    });
    TestBed.configureTestingModule({ providers: [provideRouter([]), MessageService] });
    state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('ph');
    lifecycle = TestBed.inject(PlayroomLifecycleService);
    connections = TestBed.inject(PlayroomConnectService);
    notify = TestBed.inject(ToastService);
    vi.spyOn(lifecycle, 'start').mockResolvedValue();
    vi.spyOn(lifecycle, 'stop').mockResolvedValue();
    vi.spyOn(connections, 'connect').mockResolvedValue('operation');
    vi.spyOn(connections, 'open').mockResolvedValue();
    vi.spyOn(notify, 'toast');
    vi.spyOn(notify, 'failure');
    const defaults = TestBed.inject(PlayroomDefaultsService);
    vi.spyOn(defaults, 'loadConfiguredDefaultsOnce').mockResolvedValue();
    vi.spyOn(defaults, 'configuredText').mockImplementation((key, fallback) =>
      key === 'user' ? 'root' : (fallback ?? ''),
    );
    vi.spyOn(defaults, 'configuredToggle').mockReturnValue(false);
    service = TestBed.inject(MenuBarService);
    state.setRooms([room('Ready', 'demo'), room('Stopped', 'idle')]);
    state.markRoomsLoaded('ph');
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('keeps running in the menu bar off by default, and saves and sends a change', () => {
    expect(service.keepRunningInMenuBar()).toBe(false);
    expect(wailsApi.setKeepRunningInMenuBar).toHaveBeenCalledWith(false);
    service.setKeepRunningInMenuBar(true);
    expect(readCache().keepRunningInMenuBar).toBe(true);
    expect(wailsApi.setKeepRunningInMenuBar).toHaveBeenLastCalledWith(true);
  });

  it('pushes the room list when it changes, and not when only ages tick', () => {
    TestBed.tick();
    expect(wailsApi.setMenuBarRooms).toHaveBeenCalledTimes(1);
    expect(vi.mocked(wailsApi.setMenuBarRooms).mock.calls[0][0].Rooms.map((r) => r.Name)).toEqual([
      'demo',
      'idle',
    ]);
    state.setRooms(state.rooms().map((entry) => ({ ...entry, ageMin: entry.ageMin + 1 })));
    TestBed.tick();
    expect(wailsApi.setMenuBarRooms).toHaveBeenCalledTimes(1);
    state.setRooms([room('Ready', 'demo')]);
    TestBed.tick();
    expect(wailsApi.setMenuBarRooms).toHaveBeenCalledTimes(2);
    expect(vi.mocked(wailsApi.setMenuBarRooms).mock.lastCall?.[0].Rooms).toHaveLength(1);
  });

  it('connects with the configured user and the last terminal, without the window', async () => {
    updateCache({ lastTerminal: 'ghostty' });
    choose(request('connect'));
    await vi.waitFor(() => expect(connections.connect).toHaveBeenCalled());
    expect(connections.connect).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'demo', playhouse: 'ph' }),
      'root',
      'ghostty',
      false,
      '',
      false,
    );
    expect(wailsApi.showMainWindow).not.toHaveBeenCalled();
  });

  it('opens in the last editor', async () => {
    updateCache({ lastEditor: 'cursor' });
    await service.runMenuBarRequest(request('open-in-editor'));
    expect(connections.open).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'demo' }),
      'cursor',
    );
  });

  it('starts and stops through the room lifecycle', async () => {
    await service.runMenuBarRequest(request('start', 'idle'));
    expect(lifecycle.start).toHaveBeenCalledWith(expect.objectContaining({ name: 'idle' }));
    await service.runMenuBarRequest(request('stop'));
    expect(lifecycle.stop).toHaveBeenCalledWith(expect.objectContaining({ name: 'demo' }));
  });

  it.each([
    ['a room that is gone', request('connect', 'missing')],
    ['a room in another playhouse', { ...request('connect'), playhouse: 'other' }],
    ['a status that no longer fits', request('start')],
  ])('runs nothing for %s and shows the window', async (_case, stale) => {
    await service.runMenuBarRequest(stale);
    expect(connections.connect).not.toHaveBeenCalled();
    expect(lifecycle.start).not.toHaveBeenCalled();
    expect(wailsApi.showMainWindow).toHaveBeenCalled();
    expect(notify.toast).toHaveBeenCalledWith(expect.stringContaining('Nothing ran'), 'warn');
  });

  it('runs nothing for a room with a task in progress', async () => {
    vi.spyOn(lifecycle, 'pendingOperation').mockReturnValue('Stopping');
    await service.runMenuBarRequest(request('stop'));
    expect(lifecycle.stop).not.toHaveBeenCalled();
  });

  it('shows the window with the failure when a connect fails', async () => {
    vi.mocked(connections.connect).mockRejectedValue(new Error('no route to host'));
    await service.runMenuBarRequest(request('connect'));
    expect(wailsApi.showMainWindow).toHaveBeenCalled();
    expect(notify.failure).toHaveBeenCalledWith(
      'Could not open "demo"',
      expect.any(Error),
      '',
      undefined,
    );
  });
});
