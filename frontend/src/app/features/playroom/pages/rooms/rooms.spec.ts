import { vi } from 'vitest';

import { By } from '@angular/platform-browser';
import { ShortcutsService } from '../../../../core/services/shortcuts';
import { CreatePlayroomDrawerComponent } from '../../components/create-playroom-drawer/create-playroom-drawer';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MessageService } from 'primeng/api';
import { RoomsPageComponent } from './rooms';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { ListingDto } from '../../../../shared/models';
import { wailsApi } from '../../../../core/services/wails-api';

/**
 * The rooms on screen must always belong to the playhouse in the sidebar, in
 * both the cases that used to come apart.
 */
describe('RoomsPageComponent', () => {
  let listPlayrooms: ReturnType<typeof vi.fn>;

  const roomsIn = (playhouse: string): ListingDto[] => [
    { Name: `${playhouse}-room`, Owner: 'sem@avisi.nl', Status: 'Running' },
  ];

  beforeEach(async () => {
    vi.spyOn(wailsApi, 'getCurrentUserEmail').mockResolvedValue('sem@avisi.nl');
    listPlayrooms = vi
      .spyOn(wailsApi, 'listPlayrooms')
      .mockImplementation((input) => Promise.resolve(roomsIn(input.Playhouse ?? '')));

    await TestBed.configureTestingModule({
      imports: [RoomsPageComponent],
      providers: [MessageService, provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  /** The playhouses each `playroom list` was asked for, in order. */
  const playhousesRead = (): (string | undefined)[] =>
    listPlayrooms.mock.calls.map(
      (call: unknown[]) => (call[0] as { Playhouse?: string }).Playhouse,
    );

  it('reads the rooms once when the screen opens', async () => {
    TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-a');

    const fixture = TestBed.createComponent(RoomsPageComponent);
    await fixture.whenStable();

    expect(playhousesRead()).toEqual(['playhouse-a']);
  });

  it('reads them again for a playhouse chosen while it is already open', async () => {
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('playhouse-a');
    const fixture = TestBed.createComponent(RoomsPageComponent);
    await fixture.whenStable();

    // What the sidebar does: no navigation, because this is the route it is on.
    state.selectPlayhouse('playhouse-b');
    await fixture.whenStable();

    expect(playhousesRead()).toEqual(['playhouse-a', 'playhouse-b']);
    expect(state.rooms().every((room) => room.playhouse === 'playhouse-b')).toBe(true);
  });

  it('still reads the playhouse chosen before the previous read landed', async () => {
    let finishTheFirstRead = (_: ListingDto[]) => {};
    listPlayrooms.mockImplementationOnce(
      () => new Promise<ListingDto[]>((resolve) => (finishTheFirstRead = resolve)),
    );

    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('playhouse-a');
    const fixture = TestBed.createComponent(RoomsPageComponent);
    TestBed.tick();

    state.selectPlayhouse('playhouse-b');
    finishTheFirstRead(roomsIn('playhouse-a'));
    await fixture.whenStable();

    expect(playhousesRead()).toEqual(['playhouse-a', 'playhouse-b']);
    expect(state.roomsLoadedFor()).toBe('playhouse-b');
  });

  // Setup's "Create your first playroom" lands here with the drawer open.
  it('opens the create drawer when the URL asks for it, then clears the parameter', async () => {
    vi.spyOn(wailsApi, 'listPlayroomImages').mockResolvedValue([]);
    vi.spyOn(wailsApi, 'getPlayroomDefaults').mockResolvedValue([]);
    TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-a');
    const router = TestBed.inject(Router);
    router.resetConfig([{ path: 'rooms', component: RoomsPageComponent }]);
    const harness = await RouterTestingHarness.create();

    const page = await harness.navigateByUrl('/rooms?create=true', RoomsPageComponent);
    await harness.fixture.whenStable();

    expect(page.showCreate).toBe(true);
    // Cleared, so Back or a reload does not open the drawer again.
    expect(router.url).toBe('/rooms');
  });

  for (const source of ['c', 'command-n', 'menu'] as const) {
    it(`renders the create drawer from ${source} without another template event`, async () => {
      let menuAction = (_action: string) => {};
      vi.spyOn(wailsApi, 'onMenuAction').mockImplementation((handler) => {
        menuAction = handler;
        return () => undefined;
      });
      vi.spyOn(wailsApi, 'listPlayroomImages').mockResolvedValue([]);
      vi.spyOn(wailsApi, 'getPlayroomDefaults').mockResolvedValue([]);
      TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-a');
      const router = TestBed.inject(Router);
      router.resetConfig([{ path: 'rooms', component: RoomsPageComponent }]);
      const harness = await RouterTestingHarness.create();
      const page = await harness.navigateByUrl('/rooms', RoomsPageComponent);
      await harness.fixture.whenStable();
      const openCreate = vi.spyOn(page, 'openCreate');
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

      if (source === 'menu') menuAction('new-playroom');
      else
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: source === 'c' ? 'c' : 'n',
            metaKey: source === 'command-n',
            cancelable: true,
          }),
        );

      expect(openCreate).toHaveBeenCalledOnce();
      expect(page.showCreate).toBe(true);
      await harness.fixture.whenStable();
      const drawer = harness.routeDebugElement!.query(By.directive(CreatePlayroomDrawerComponent))
        .componentInstance as CreatePlayroomDrawerComponent;
      expect(drawer.visible).toBe(true);
      expect(TestBed.inject(ShortcutsService).overviewOpen()).toBe(false);
    });
  }

  it('drops a poll that ticks while a read is already running', async () => {
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('playhouse-a');
    const fixture = TestBed.createComponent(RoomsPageComponent);
    const page = fixture.componentInstance;

    let finishTheFirstRead = (_: ListingDto[]) => {};
    listPlayrooms.mockImplementationOnce(
      () => new Promise<ListingDto[]>((resolve) => (finishTheFirstRead = resolve)),
    );
    TestBed.tick();

    void page.refreshRooms(true);
    finishTheFirstRead(roomsIn('playhouse-a'));
    await fixture.whenStable();

    expect(playhousesRead()).toEqual(['playhouse-a']);
  });
  it('routes each preferred action through the existing connect and editor handlers', async () => {
    const fixture = TestBed.createComponent(RoomsPageComponent);
    const component = fixture.componentInstance;
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('ph');
    await fixture.whenStable();
    const { listingToRoom } = await import('../../../../shared/utils');
    state.setRooms([listingToRoom({ Name: 'demo', Status: 'Ready' }, 'ph')]);
    const openConnect = vi.spyOn(component, 'openConnect').mockImplementation(() => {});
    state.setPreferredAction('connect');
    component.runPreferredAction('demo');
    expect(openConnect).toHaveBeenLastCalledWith('demo', 'connect');
    state.setPreferredAction('open');
    component.runPreferredAction('demo');
    expect(openConnect).toHaveBeenLastCalledWith('demo', 'open');
    openConnect.mockClear();
    state.setPreferredAction('nothing');
    component.runPreferredAction('demo');
    state.setPreferredAction('connect');
    state.setRooms([listingToRoom({ Name: 'demo', Status: 'Stopped' }, 'ph')]);
    component.runPreferredAction('demo');
    component.runPreferredAction('missing');
    expect(openConnect).not.toHaveBeenCalled();
  });
});
