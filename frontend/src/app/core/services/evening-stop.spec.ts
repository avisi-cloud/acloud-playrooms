import { provideRouter } from '@angular/router';
import { PlayroomLifecycleService } from './playroom-lifecycle';
import { PlayroomStateService } from './playroom-state';
import { listingToRoom } from '../../shared/utils';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { EveningStopService } from './evening-stop';
import { ScheduleEvent, wailsApi } from './wails-api';

describe('EveningStopService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MessageService, provideRouter([])] });
  });
  it('loads settings, saves only after success and retains settings on failure', async () => {
    const service = TestBed.inject(EveningStopService);
    await TestBed.tick();
    await Promise.resolve();
    expect(service.settings()?.Enabled).toBe(false);
    await service.save({ Enabled: true });
    expect(service.settings()?.Enabled).toBe(true);
    vi.spyOn(wailsApi, 'setScheduleSettings').mockRejectedValue(new Error('disk full'));
    await service.save({ Time: '23:00' });
    expect(service.settings()?.Time).toBe('22:00');
    expect(service.error()).toContain('Could not save');
    expect(service.busy()).toBe(false);
  });
  it('receives notices and applies their actions', async () => {
    let receive!: (event: ScheduleEvent) => void;
    vi.spyOn(wailsApi, 'onScheduleNotice').mockImplementation((callback) => {
      receive = callback;
      return () => undefined;
    });
    const act = vi.spyOn(wailsApi, 'runScheduleAction').mockResolvedValue();
    const service = TestBed.inject(EveningStopService);
    await Promise.resolve();
    await Promise.resolve();
    receive({ ID: 'notice', Kind: 'warning', Title: 'Stopping soon', Rooms: [] });
    await service.act('notice', 'snooze');
    expect(act).toHaveBeenCalledWith('notice', 'snooze');
    expect(service.notices()).toEqual([]);
  });
  it('keeps dismissed reminders hidden when the backend repeats them', async () => {
    let receive!: (event: ScheduleEvent) => void;
    vi.spyOn(wailsApi, 'onScheduleNotice').mockImplementation((callback) => {
      receive = callback;
      return () => undefined;
    });
    const service = TestBed.inject(EveningStopService);
    await Promise.resolve();
    await Promise.resolve();
    const event: ScheduleEvent = {
      ID: 'notice',
      Kind: 'idle',
      Title: 'No connection from this app for 4 hours',
      Rooms: [],
    };
    receive(event);
    service.dismiss('notice');
    receive(event);
    expect(service.notices()).toEqual([]);
  });
  it('waits for Stop before reloading signal-backed room state for the captured selection', async () => {
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('ph');
    state.setRooms([listingToRoom({ Name: 'demo', Status: 'Ready' }, 'ph')]);
    let finish!: () => void;
    vi.spyOn(wailsApi, 'runScheduleAction').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    vi.spyOn(wailsApi, 'listPlayrooms').mockResolvedValue([{ Name: 'demo', Status: 'Stopped' }]);
    const reload = vi.spyOn(TestBed.inject(PlayroomLifecycleService), 'reload');
    const service = TestBed.inject(EveningStopService);
    const action = service.act('idle-notice', 'stop');
    expect(reload).not.toHaveBeenCalled();
    expect(state.rooms()[0].status).toBe('ready');
    finish();
    await action;
    expect(reload).toHaveBeenCalledWith('ph', state.captureSelection());
    expect(state.rooms()[0].status).toBe('stopped');
    expect(service.busy()).toBe(false);
  });

  it('does not refresh the previous playhouse after a scope change during Stop', async () => {
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('ph');
    let finish!: () => void;
    vi.spyOn(wailsApi, 'runScheduleAction').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const reload = vi.spyOn(TestBed.inject(PlayroomLifecycleService), 'reload');
    const service = TestBed.inject(EveningStopService);
    const action = service.act('idle-notice', 'stop');
    state.selectPlayhouse('other');
    finish();
    await action;
    expect(reload).not.toHaveBeenCalled();
  });
});
