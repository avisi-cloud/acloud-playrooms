import { Tooltip } from 'primeng/tooltip';
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
import { listingToRoom, updateCache } from '../../../../shared/utils';
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
    localStorage.clear();
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

  it('renders loaded totals, keeps them independent of filters and reacts to rooms and ownership', async () => {
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('playhouse-a');
    const fixture = TestBed.createComponent(RoomsPageComponent);
    await fixture.whenStable();
    state.setUser('developer@example.test');
    state.setRooms([
      listingToRoom(
        {
          Name: 'mine',
          Owner: 'developer@example.test',
          CPURequest: '250m',
          MemRequest: '2Gi',
          DiskSize: '20Gi',
        },
        'playhouse-a',
      ),
      listingToRoom(
        {
          Name: 'other',
          Owner: 'other@example.test',
          CPURequest: '2',
          MemRequest: '8Gi',
          DiskSize: '40Gi',
        },
        'playhouse-a',
      ),
      listingToRoom({ Name: 'unknown' }, 'playhouse-a'),
    ]);
    const page = fixture.componentInstance;
    page.query.set('missing');
    page.mineOnly.set(true);
    page.statusFilter.set('stopped');
    await fixture.whenStable();
    const summary = fixture.nativeElement.querySelector(
      'button[aria-label="Requested resources"]',
    ) as HTMLButtonElement;
    expect(summary.querySelector('.requested-resources-wide')!.textContent).toBe(
      '2.25 CPU · 10 GiB · 60 GiB',
    );
    expect(summary.querySelector('.requested-resources-narrow')!.textContent).toBe(
      '2.25 CPU · 10 GiB',
    );
    expect(
      fixture.debugElement.query(By.css('[aria-label="Requested resources"]')).injector.get(Tooltip)
        .content,
    ).toBe(
      'Requested: 2.25 CPU · 10 GiB memory · 60 GiB storage (yours: 0.25 CPU · 2 GiB memory · 20 GiB storage)',
    );
    expect(summary.querySelector('.pi-exclamation-circle')).not.toBeNull();
    expect(page.requestedResources().unknown).toContain('1 room without a CPU request');
    summary.click();
    await fixture.whenStable();
    expect(document.body.textContent).toContain('1 room without a CPU request');
    state.setUser('other@example.test');
    expect(page.requestedResources().yours).toBe('2 CPU · 8 GiB memory · 40 GiB storage');
    state.setUser('');
    expect(page.requestedResources().yours).toBe('Not reported');
    state.setRooms([]);
    expect(page.requestedResources().all).toBe('0 CPU · 0 GiB memory · 0 GiB storage');
    state.selectPlayhouse('playhouse-b');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('button[aria-label="Requested resources"]'),
    ).toBeNull();
    fixture.destroy();
  });

  it('selects only owned rooms, toggles names and adds a visible Shift range', async () => {
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('playhouse-a');
    const fixture = TestBed.createComponent(RoomsPageComponent);
    await fixture.whenStable();
    state.setUser('developer@example.test');
    state.setRooms(
      ['alpha', 'beta', 'gamma', 'zeta'].map((name) =>
        listingToRoom(
          {
            Name: name,
            Owner: name === 'beta' ? 'other@example.test' : 'developer@example.test',
            Status: 'Ready',
          },
          'playhouse-a',
        ),
      ),
    );
    const page = fixture.componentInstance;
    page.selectRoom({ name: 'beta', shiftKey: false });
    expect(page.selectedRooms()).toEqual([]);
    page.selectRoom({ name: 'alpha', shiftKey: false });
    page.selectRoom({ name: 'gamma', shiftKey: true });
    expect(page.selectedRooms().map((room) => room.name)).toEqual(['alpha', 'gamma']);
    page.selectRoom({ name: 'alpha', shiftKey: false });
    expect(page.selectedRooms().map((room) => room.name)).toEqual(['gamma']);
    page.query.set('zeta');
    page.selectAllMine();
    expect(page.selectedNames()).toEqual(['zeta']);
    state.setUser('');
    expect(page.selectedRooms()).toEqual([]);
    page.selectAllMine();
    expect(page.selectedNames()).toEqual([]);
    fixture.destroy();
  });

  it('snapshots delete names, prevents duplicate submission and clears selection on scope changes', async () => {
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('playhouse-a');
    const fixture = TestBed.createComponent(RoomsPageComponent);
    await fixture.whenStable();
    const page = fixture.componentInstance;
    const owner = state.user();
    state.setRooms(
      ['alpha', 'beta'].map((name) =>
        listingToRoom({ Name: name, Owner: owner, Status: 'Stopped' }, 'playhouse-a'),
      ),
    );
    page.selectMode.set(true);
    page.selectAllMine();
    page.askBulkDelete();
    page.selectedNames.set(['alpha']);
    expect(page.bulkDeleteNames()).toEqual(['alpha', 'beta']);
    let finish = () => {};
    const run = vi
      .spyOn(page.actions, 'runForEach')
      .mockImplementation(async (_names, _operation, progress) => {
        progress?.([{ name: 'alpha', status: 'running', reason: '' }]);
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        progress?.([
          { name: 'alpha', status: 'failed', reason: '' },
          { name: 'beta', status: 'succeeded', reason: '' },
        ]);
        return [];
      });
    const pending = page.runBulk('delete');
    await page.runBulk('delete');
    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][0]).toEqual(['alpha', 'beta']);
    expect(page.bulkRunning()).toBe(true);
    finish();
    await pending;
    expect(page.bulkSummary()).toBe('1 succeeded, 1 failed, 0 skipped');
    expect(page.bulkRunning()).toBe(false);
    state.selectPlayhouse('playhouse-b');
    await fixture.whenStable();
    expect(page.selectedNames()).toEqual([]);
    expect(page.bulkDeleteNames()).toEqual([]);
    fixture.destroy();
  });

  it('shows the selected playhouse in the page header breadcrumb', async () => {
    TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-a');
    const fixture = TestBed.createComponent(RoomsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    const breadcrumb = fixture.nativeElement.querySelector('header nav[aria-label="Breadcrumb"]');
    expect(breadcrumb?.textContent).toContain('playhouse-a');
    fixture.destroy();
  });

  it('opens Create similar when a card emits the action', async () => {
    vi.spyOn(wailsApi, 'listPlayroomImages').mockResolvedValue([]);
    vi.spyOn(wailsApi, 'getPlayroomDefaults').mockResolvedValue([]);
    TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-a');
    const fixture = TestBed.createComponent(RoomsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.debugElement
      .query(By.css('app-playroom-card'))
      .triggerEventHandler('createSimilarRoom', 'playhouse-a-room');
    fixture.detectChanges();
    await fixture.whenStable();
    const drawers = fixture.debugElement.queryAll(By.directive(CreatePlayroomDrawerComponent));
    const opened = drawers
      .map((drawer) => drawer.componentInstance as CreatePlayroomDrawerComponent)
      .find((drawer) => drawer.visible);
    expect(opened?.form.name).toBe('');
    expect(opened?.form.playhouse).toBe('playhouse-a');
    expect(opened?.mode).toBe('advanced');
    fixture.destroy();
  });

  it('offers Easy create as the first step in an empty playhouse', async () => {
    vi.spyOn(wailsApi, 'listPlayroomImages').mockResolvedValue([]);
    vi.spyOn(wailsApi, 'getPlayroomDefaults').mockResolvedValue([]);
    listPlayrooms.mockResolvedValue([]);
    updateCache({ createPlayroomMode: 'advanced' });
    TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-a');
    const fixture = TestBed.createComponent(RoomsPageComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (element) => element.textContent?.includes('Create your first playroom'),
    );
    button!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const drawer = fixture.debugElement
      .queryAll(By.directive(CreatePlayroomDrawerComponent))
      .map((element) => element.componentInstance as CreatePlayroomDrawerComponent)
      .find((candidate) => candidate.visible);
    expect(drawer?.mode).toBe('easy');
    fixture.destroy();
  });

  it('says in the header when the list was last read', async () => {
    let finishTheFirstRead = (_: ListingDto[]) => {};
    listPlayrooms.mockImplementationOnce(
      () => new Promise<ListingDto[]>((resolve) => (finishTheFirstRead = resolve)),
    );
    TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-a');
    const fixture = TestBed.createComponent(RoomsPageComponent);
    TestBed.tick();
    const header = () => (fixture.nativeElement as HTMLElement).querySelector('header');
    expect(header()?.textContent).not.toContain('Updated');

    finishTheFirstRead(roomsIn('playhouse-a'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(header()?.textContent).toContain('Updated just now');
    fixture.destroy();
  });

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
  it('opens create again when a second link reaches the reused rooms page', async () => {
    vi.spyOn(wailsApi, 'getPlayroomDefaults').mockResolvedValue([]);
    vi.spyOn(wailsApi, 'listPlayroomImages').mockResolvedValue([]);
    TestBed.inject(Router).resetConfig([{ path: 'rooms', component: RoomsPageComponent }]);
    TestBed.inject(PlayroomStateService).selectPlayhouse('ph');
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/rooms?create=1', RoomsPageComponent);
    await harness.fixture.whenStable();
    expect(page.showCreate).toBe(true);
    page.showCreate = false;
    await harness.navigateByUrl('/rooms?create=1', RoomsPageComponent);
    await harness.fixture.whenStable();
    expect(page.showCreate).toBe(true);
    expect(TestBed.inject(Router).url).toBe('/rooms');
  });

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
  it('counts after Search and Mine, independently of the selected status', async () => {
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('playhouse-platform-dev');
    const fixture = TestBed.createComponent(RoomsPageComponent);
    await fixture.whenStable();
    const page = fixture.componentInstance;
    state.setUser('developer@example.test');
    state.setRooms([
      listingToRoom(
        { Name: 'api', Owner: 'developer@example.test', Status: 'Ready', Image: 'ubuntu' },
        'playhouse-platform-dev',
      ),
      listingToRoom(
        { Name: 'review', Owner: 'developer@example.test', Status: 'Stopped', Image: 'ubuntu' },
        'playhouse-platform-dev',
      ),
      listingToRoom(
        { Name: 'other', Owner: 'other@example.test', Status: 'Failed', Image: 'ubuntu' },
        'playhouse-platform-dev',
      ),
      listingToRoom(
        { Name: 'elsewhere', Status: 'Ready', Image: 'ubuntu' },
        'playhouse-platform-shared',
      ),
    ]);
    page.query.set(' UBUNTU ');
    page.mineOnly.set(true);
    page.statusFilter.set('ready');
    expect(page.statusChips()).toEqual([
      { status: '', label: 'All', count: 2 },
      { status: 'ready', label: 'Ready', count: 1 },
      { status: 'stopped', label: 'Stopped', count: 1 },
    ]);
    expect(page.filteredRooms().map((room) => room.name)).toEqual(['api']);
    page.query.set('review');
    expect(page.statusChips()).toContainEqual({ status: 'ready', label: 'Ready', count: 0 });
    expect(page.filteredRooms()).toEqual([]);
    fixture.detectChanges();
    const active = fixture.nativeElement.querySelectorAll('.status-chip[aria-pressed="true"]');
    expect(active.length).toBe(1);
    expect(active[0].textContent).toContain('Ready 0');
    (fixture.nativeElement.querySelector('.status-chip') as HTMLButtonElement).click();
    expect(page.filteredRooms().map((room) => room.name)).toEqual(['review']);
    page.mineOnly.set(false);
    page.query.set('');
    expect(page.statusChips()[0].count).toBe(3);
  });

  for (const sort of ['name', 'age', 'status'] as const) {
    it(`keeps pins first while preserving ${sort} ordering in each group`, async () => {
      const state = TestBed.inject(PlayroomStateService);
      state.selectPlayhouse('playhouse-platform-dev');
      const fixture = TestBed.createComponent(RoomsPageComponent);
      await fixture.whenStable();
      const page = fixture.componentInstance;
      state.setRooms([
        {
          ...listingToRoom({ Name: 'alpha', Status: 'Stopped' }, 'playhouse-platform-dev'),
          ageMin: 1,
        },
        {
          ...listingToRoom({ Name: 'beta', Status: 'Ready' }, 'playhouse-platform-dev'),
          ageMin: 3,
        },
        {
          ...listingToRoom({ Name: 'gamma', Status: 'Failed' }, 'playhouse-platform-dev'),
          ageMin: 4,
        },
        {
          ...listingToRoom({ Name: 'zeta', Status: 'Stopped' }, 'playhouse-platform-dev'),
          ageMin: 2,
        },
      ]);
      state.togglePinned('playhouse-platform-dev', 'gamma');
      state.togglePinned('playhouse-platform-dev', 'zeta');
      page.sort.set(sort);
      const expected =
        sort === 'name'
          ? ['gamma', 'zeta', 'alpha', 'beta']
          : sort === 'age'
            ? ['zeta', 'gamma', 'alpha', 'beta']
            : ['gamma', 'zeta', 'beta', 'alpha'];
      expect(page.filteredRooms().map((room) => room.name)).toEqual(expected);
      state.togglePinned('playhouse-platform-dev', 'gamma');
      expect(page.filteredRooms()[0].name).toBe('zeta');
    });
  }
  it('remembers the view and owner grouping across screen recreation and app sessions', async () => {
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('playhouse-a');
    const fixture = TestBed.createComponent(RoomsPageComponent);
    await fixture.whenStable();
    const page = fixture.componentInstance;
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.view-toggle button:last-child')!.click();
    root.querySelector<HTMLInputElement>('#group-by-owner')!.click();
    await fixture.whenStable();
    expect(page.playroomView()).toBe('list');
    expect(page.groupByOwner()).toBe(true);
    expect(root.querySelectorAll('table tbody tr')).toHaveLength(1);
    const { readCache } = await import('../../../../shared/utils/cache');
    expect(readCache()).toMatchObject({ playroomView: 'list', groupByOwner: true });
    fixture.destroy();
    const restored = TestBed.createComponent(RoomsPageComponent);
    await restored.whenStable();
    expect(restored.componentInstance.playroomView()).toBe('list');
    expect(restored.componentInstance.groupByOwner()).toBe(true);
    const { UiSessionService } = await import('../../../../core/services/ui-session');
    const restarted = TestBed.runInInjectionContext(() => new UiSessionService());
    expect(restarted.playroomView()).toBe('list');
    expect(restarted.groupByOwner()).toBe(true);
  });

  it('keeps filters, pins and selection across both views and counts only matching rooms in groups', async () => {
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('playhouse-a');
    const fixture = TestBed.createComponent(RoomsPageComponent);
    await fixture.whenStable();
    state.setUser('developer@example.test');
    state.setRooms([
      listingToRoom(
        { Name: 'alpha', Owner: 'developer@example.test', Status: 'Ready' },
        'playhouse-a',
      ),
      listingToRoom(
        { Name: 'zeta', Owner: 'developer@example.test', Status: 'Ready' },
        'playhouse-a',
      ),
      listingToRoom(
        { Name: 'beta', Owner: 'developer@example.test', Status: 'Stopped' },
        'playhouse-a',
      ),
      listingToRoom({ Name: 'other', Owner: 'other@example.test', Status: 'Ready' }, 'playhouse-a'),
    ]);
    const page = fixture.componentInstance;
    page.session.setGroupByOwner(true);
    state.togglePinned('playhouse-a', 'zeta');
    page.statusFilter.set('ready');
    page.selectRoom({ name: 'alpha', shiftKey: false });
    for (const view of ['grid', 'list'] as const) {
      page.session.setPlayroomView(view);
      fixture.detectChanges();
      expect(page.roomGroups().map((group) => [group.label, group.rooms.length])).toEqual([
        ['Mine', 2],
        ['other@example.test', 1],
      ]);
      const names = [
        ...fixture.nativeElement.querySelectorAll(view === 'grid' ? '.card-name' : '.row-name'),
      ].map((element) => (element as HTMLElement).textContent?.trim().replace(/\.$/, ''));
      expect(names).toEqual(['zeta', 'alpha', 'other']);
      expect(
        fixture.nativeElement.querySelectorAll(
          view === 'grid' ? 'article.selected' : 'tr.selected',
        ),
      ).toHaveLength(1);
      expect(page.selectedNames()).toEqual(['alpha']);
    }
    page.query.set('other');
    expect(page.roomGroups().map((group) => [group.label, group.rooms.length])).toEqual([
      ['other@example.test', 1],
    ]);
    page.mineOnly.set(true);
    expect(page.roomGroups()).toEqual([]);
    expect(page.selectedNames()).toEqual(['alpha']);
  });

  it('uses displayed group order for Shift ranges and excludes collapsed rooms', async () => {
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('playhouse-a');
    const fixture = TestBed.createComponent(RoomsPageComponent);
    await fixture.whenStable();
    state.setUser('developer@example.test');
    state.setRooms(
      ['alpha', 'beta', 'gamma'].map((name) =>
        listingToRoom(
          { Name: name, Owner: 'developer@example.test', Status: 'Ready' },
          'playhouse-a',
        ),
      ),
    );
    const page = fixture.componentInstance;
    page.session.setGroupByOwner(true);
    page.selectRoom({ name: 'alpha', shiftKey: false });
    page.toggleOwner('developer@example.test');
    fixture.detectChanges();
    expect(page.visibleRooms()).toEqual([]);
    const toggle = fixture.nativeElement.querySelector('.owner-toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Mine, 3 rooms');
    expect(fixture.nativeElement.querySelector('#owner-rooms-0').hidden).toBe(true);
    page.selectRoom({ name: 'gamma', shiftKey: true });
    expect(page.selectedNames()).toEqual(['alpha', 'gamma']);
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    page.selectRoom({ name: 'alpha', shiftKey: true });
    expect(page.selectedNames()).toEqual(['alpha', 'gamma', 'beta']);
    page.toggleOwner('developer@example.test');
    state.selectPlayhouse('playhouse-b');
    await fixture.whenStable();
    expect(page.collapsedOwners()).toEqual([]);
    expect(page.selectedNames()).toEqual([]);
    expect(page.playroomView()).toBe('grid');
    expect(page.groupByOwner()).toBe(true);
  });
});
