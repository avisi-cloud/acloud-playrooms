import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { DesktopNotificationsService, countDockBadge } from './desktop-notifications';
import { PlayroomStateService } from './playroom-state';
import { wailsApi } from './wails-api';
import { listingToRoom, readCache } from '../../shared/utils';

const room = (status: string, name = 'demo') => listingToRoom({ Name: name, Status: status }, 'ph');

describe('desktop notifications', () => {
  let service: DesktopNotificationsService;
  let state: PlayroomStateService;
  let click: (target: string) => void;
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.spyOn(wailsApi, 'onDesktopNotificationClick').mockImplementation((handler) => {
      click = handler;
      return vi.fn();
    });
    vi.spyOn(wailsApi, 'sendDesktopNotification').mockResolvedValue();
    vi.spyOn(wailsApi, 'setDockBadge').mockResolvedValue();
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('ph');
    service = TestBed.inject(DesktopNotificationsService);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('defaults to notifications on and failed rooms, and saves preferences', () => {
    expect(service.notifications()).toBe(true);
    expect(service.dockBadge()).toBe('failed');
    service.setNotifications(false);
    service.setDockBadge('running');
    expect(readCache()).toMatchObject({ notifications: false, dockBadge: 'running' });
  });

  it('only notifies when enabled and the window is not focused', () => {
    const selection = state.captureSelection();
    vi.mocked(document.hasFocus).mockReturnValue(true);
    service.roomFinished('create', 'demo', selection);
    expect(wailsApi.sendDesktopNotification).not.toHaveBeenCalled();
    vi.mocked(document.hasFocus).mockReturnValue(false);
    service.setNotifications(false);
    service.roomFinished('start', 'demo', selection);
    expect(wailsApi.sendDesktopNotification).not.toHaveBeenCalled();
    service.setNotifications(true);
    service.roomFinished('start', 'demo', selection, true);
    expect(wailsApi.sendDesktopNotification).toHaveBeenCalledWith(
      'demo failed to start',
      expect.any(String),
    );
  });

  it.each(['create', 'start', 'stop', 'delete'] as const)(
    'reports %s completion and failure',
    (task) => {
      service.roomFinished(task, 'demo', state.captureSelection());
      service.roomFinished(task, 'demo', state.captureSelection(), true);
      expect(wailsApi.sendDesktopNotification).toHaveBeenCalledTimes(2);
      expect(wailsApi.sendDesktopNotification).toHaveBeenLastCalledWith(
        `demo failed to ${task}`,
        expect.any(String),
      );
    },
  );

  it('opens the room only while its original selection remains current', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    service.roomFinished('start', 'demo', state.captureSelection());
    const target = vi.mocked(wailsApi.sendDesktopNotification).mock.calls[0][1];
    click(target);
    expect(navigate).toHaveBeenLastCalledWith(['/rooms', 'demo']);
    state.noteScopeChange();
    click(target);
    expect(navigate).toHaveBeenLastCalledWith(['/rooms']);
    expect(state.playhouse()).toBe('ph');
  });

  it('opens the overview for another playhouse, a previous session or a playhouse task', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    service.roomFinished('create', 'demo', state.captureSelection());
    const target = vi.mocked(wailsApi.sendDesktopNotification).mock.calls[0][1];
    click(JSON.stringify({ ...JSON.parse(target), session: 'previous-session' }));
    expect(navigate).toHaveBeenLastCalledWith(['/rooms']);
    state.selectPlayhouse('other');
    click(target);
    expect(navigate).toHaveBeenLastCalledWith(['/rooms']);
    service.playhouseFinished('update', 'other', state.captureSelection());
    click(vi.mocked(wailsApi.sendDesktopNotification).mock.calls[1][1]);
    expect(navigate).toHaveBeenLastCalledWith(['/rooms']);
  });

  it('debounces counts, ignores other playhouses and clears immediately on scope changes', async () => {
    state.setRooms([room('Failed'), { ...room('Failed', 'elsewhere'), playhouse: 'other' }]);
    state.markRoomsLoaded('ph');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(150);
    expect(wailsApi.setDockBadge).toHaveBeenLastCalledWith(1);
    state.noteScopeChange();
    TestBed.tick();
    await Promise.resolve();
    await Promise.resolve();
    expect(wailsApi.setDockBadge).toHaveBeenLastCalledWith(0);
  });

  it('counts only reported failed or running rooms, and supports Off', () => {
    const rooms = ['Failed', 'Ready', 'Running', 'Stopped', 'Starting', 'Unknown'].map((status) =>
      room(status),
    );
    expect(countDockBadge(rooms, 'failed')).toBe(1);
    expect(
      countDockBadge([room('Ready'), { ...room('Ready'), status: 'no-host' }], 'running'),
    ).toBe(2);
    expect(countDockBadge(rooms, 'off')).toBe(0);
  });
});
