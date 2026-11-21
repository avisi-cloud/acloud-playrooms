import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { DeepLinksService } from './deep-links';
import { PlayroomStateService } from './playroom-state';
import { ScopeService } from './scope';
import { ToastService } from './toast';
import { PlayhouseEntry, wailsApi } from './wails-api';

describe('Deep link routing', () => {
  let service: DeepLinksService;
  let state: PlayroomStateService;
  let scope: ScopeService;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    localStorage.clear();
    vi.spyOn(wailsApi, 'getCurrentContext').mockResolvedValue('development');
    vi.spyOn(wailsApi, 'getCurrentOrganisation').mockResolvedValue('platform');
    vi.spyOn(wailsApi, 'listContexts').mockResolvedValue([]);
    vi.spyOn(wailsApi, 'listOrganisations').mockResolvedValue([]);
    vi.spyOn(wailsApi, 'listPlayhouses').mockResolvedValue([{ Slug: 'ph' } as PlayhouseEntry]);
    TestBed.configureTestingModule({ providers: [provideRouter([]), MessageService] });
    state = TestBed.inject(PlayroomStateService);
    scope = TestBed.inject(ScopeService);
    await scope.loadContextAndOrganisation();
    service = TestBed.inject(DeepLinksService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it.each([
    ['rooms/ph/demo', ['/rooms', 'demo'], {}],
    ['connect/ph/demo', ['/rooms', 'demo'], { connect: '1' }],
    ['create?playhouse=ph', ['/rooms'], { create: '1' }],
  ])(
    'routes %s to the existing screen without running an action',
    async (path, route, queryParams) => {
      const connect = vi.spyOn(wailsApi, 'connectPlayroom');
      const create = vi.spyOn(wailsApi, 'createPlayroom');
      const switchContext = vi.spyOn(wailsApi, 'switchContext');
      const switchOrganisation = vi.spyOn(wailsApi, 'switchOrganisation');
      await service.open(`acloud-playrooms://${path}`);
      expect(state.playhouse()).toBe('ph');
      expect(navigate).toHaveBeenCalledWith(route, { queryParams });
      for (const command of [connect, create, switchContext, switchOrganisation])
        expect(command).not.toHaveBeenCalled();
    },
  );

  it('refuses a playhouse outside the current scope and keeps the selection', async () => {
    state.selectPlayhouse('ph');
    await service.open('acloud-playrooms://connect/elsewhere/demo');
    expect(navigate).not.toHaveBeenCalled();
    expect(state.playhouse()).toBe('ph');
    expect(TestBed.inject(ToastService).history()[0].detail).toContain(
      'current context and organisation',
    );
  });

  it('refuses links when validation fails', async () => {
    vi.mocked(wailsApi.listPlayhouses).mockRejectedValue(new Error('Could not list playhouses'));
    await service.open('acloud-playrooms://create?playhouse=ph');
    expect(navigate).not.toHaveBeenCalled();
    expect(TestBed.inject(ToastService).history()[0].detail).toContain('Could not list playhouses');
  });

  it('refuses a link if the selection changes while loading', async () => {
    vi.mocked(wailsApi.listPlayhouses).mockImplementation(async () => {
      state.noteScopeChange();
      return [{ Slug: 'ph' } as PlayhouseEntry];
    });
    await service.open('acloud-playrooms://rooms/ph/demo');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('refuses a context changed outside the app', async () => {
    vi.mocked(wailsApi.getCurrentContext).mockResolvedValue('other');
    await service.open('acloud-playrooms://rooms/ph/demo');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not navigate for an older link after a newer one arrives', async () => {
    let resolve!: (playhouses: PlayhouseEntry[]) => void;
    vi.mocked(wailsApi.listPlayhouses).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const older = service.open('acloud-playrooms://rooms/ph/old');
    await service.open('acloud-playrooms://rooms/ph/new');
    resolve([{ Slug: 'ph' } as PlayhouseEntry]);
    await older;
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/rooms', 'new'], { queryParams: {} });
  });

  it('does not subscribe when shell initialization finishes after teardown', () => {
    const subscribe = vi.spyOn(wailsApi, 'onDeepLink');
    TestBed.resetTestingModule();
    service.start();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('subscribes once and forwards native links', async () => {
    let receive!: (url: string) => void;
    const unsubscribe = vi.fn();
    const subscribe = vi.spyOn(wailsApi, 'onDeepLink').mockImplementation((handler) => {
      receive = handler;
      return unsubscribe;
    });
    service.start();
    service.start();
    receive('acloud-playrooms://rooms/ph/demo');
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(subscribe).toHaveBeenCalledTimes(1);
    TestBed.resetTestingModule();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
