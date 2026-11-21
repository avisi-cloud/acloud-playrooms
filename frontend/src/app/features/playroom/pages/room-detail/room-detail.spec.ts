import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { BehaviorSubject, of } from 'rxjs';
import { By } from '@angular/platform-browser';
import { PlayroomActionsHostComponent } from '../../../../shared/components';
import { CliConsoleService } from '../../../../core/services/cli-console';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { wailsApi } from '../../../../core/services/wails-api';
import { ListingDto } from '../../../../shared/models';
import { RoomDetailPageComponent } from './room-detail';

describe('Playroom details', () => {
  const listing: ListingDto = {
    Name: 'demo',
    Owner: 'sam@example.test',
    Status: 'Ready',
    CreatedAt: '2026-10-23T09:00:00Z',
    SSHHost: 'demo.example.test',
    Image: 'opencode',
    CPURequest: '250m',
    CPULimit: '4',
    MemRequest: '2Gi',
    MemLimit: '2Gi',
    DiskSize: '20Gi',
    DiskType: 'ephemeral',
    System: 'read-only',
    CapabilityProfile: 'minimal',
    CapabilityAdditions: ['NET_RAW'],
    Ports: [
      { Port: 80, TargetPort: 8080 },
      { Port: 3000, TargetPort: 3000 },
    ],
  };

  beforeEach(async () => {
    localStorage.clear();
    vi.spyOn(wailsApi, 'listPlayrooms').mockResolvedValue([]);
    vi.spyOn(wailsApi, 'previewConnectPlayroom').mockResolvedValue([
      'acloud',
      'playroom',
      'connect',
      'demo',
      '--playhouse',
      'ph',
      '--forward-agent=false',
    ]);
    await TestBed.configureTestingModule({
      imports: [RoomDetailPageComponent],
      providers: [
        MessageService,
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ name: 'demo' })),
            queryParamMap: of(convertToParamMap({})),
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  async function render(overrides: Partial<ListingDto> = {}) {
    vi.mocked(wailsApi.listPlayrooms).mockResolvedValue([{ ...listing, ...overrides }]);
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('ph');
    const fixture = TestBed.createComponent(RoomDetailPageComponent);
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.refreshing).toBe(false));
    fixture.detectChanges();
    return fixture;
  }

  it('copies a link and updates its button after the clipboard resolves', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { userAgent: navigator.userAgent, clipboard: { writeText: copy } });
    try {
      const fixture = await render();
      await fixture.componentInstance.copyLink();
      await fixture.whenStable();
      expect(copy).toHaveBeenCalledWith('acloud-playrooms://rooms/ph/demo');
      expect(fixture.componentInstance.linkCopied()).toBe(true);
      expect(fixture.nativeElement.querySelector('.page-header-right').textContent).toContain(
        'Copied',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('opens Connect once after the room loads and waits for user confirmation', async () => {
    const query = new BehaviorSubject(convertToParamMap({ connect: '1' }));
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        paramMap: of(convertToParamMap({ name: 'demo' })),
        queryParamMap: query,
      },
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const connect = vi.spyOn(wailsApi, 'connectPlayroom');
    const fixture = await render();
    const host = fixture.debugElement.query(By.directive(PlayroomActionsHostComponent))
      .componentInstance as PlayroomActionsHostComponent;
    expect(host.showConnect).toBe(true);
    expect(host.room?.name).toBe('demo');
    expect(connect).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { connect: null }, replaceUrl: true }),
    );
    host.close();
    fixture.detectChanges();
    expect(host.showConnect).toBe(false);
    query.next(convertToParamMap({ connect: '1' }));
    await fixture.whenStable();
    expect(host.showConnect).toBe(true);
    expect(connect).not.toHaveBeenCalled();
  });

  it('clears a Connect request for a missing room without opening a dialog', async () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        paramMap: of(convertToParamMap({ name: 'missing' })),
        queryParamMap: of(convertToParamMap({ connect: '1' })),
      },
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    TestBed.inject(PlayroomStateService).selectPlayhouse('ph');
    const fixture = TestBed.createComponent(RoomDetailPageComponent);
    await fixture.whenStable();
    await vi.waitFor(() => expect(fixture.componentInstance.refreshing).toBe(false));
    fixture.detectChanges();
    const host = fixture.debugElement.query(By.directive(PlayroomActionsHostComponent))
      .componentInstance as PlayroomActionsHostComponent;
    expect(host.showConnect).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Playroom not found');
    expect(navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { connect: null } }),
    );
  });

  it('shows the selected playhouse and room in the page header breadcrumb', async () => {
    const fixture = await render();
    const breadcrumb = fixture.nativeElement.querySelector('header nav[aria-label="Breadcrumb"]');
    expect(breadcrumb?.textContent).toContain('ph');
    expect(breadcrumb?.querySelector('[aria-current="page"]')?.textContent).toBe('demo');
    fixture.destroy();
  });

  it('shows four sections, distinct port mappings, the real date and the disposable-storage warning', async () => {
    const fixture = await render();
    const root = fixture.nativeElement as HTMLElement;
    expect(
      [...root.querySelectorAll('.section-title')].map((heading) => heading.textContent?.trim()),
    ).toEqual(['Connection', 'Resources', 'Storage & security', 'Metadata']);
    expect(
      [...root.querySelectorAll('.actions-row p-button')]
        .slice(0, 5)
        .map((button) => button.textContent?.trim()),
    ).toEqual(['Connect', 'Open in editor', 'Stop', 'Edit', 'Copy details']);
    expect(root.querySelectorAll('.port-row')).toHaveLength(2);
    expect(root.querySelector('.port-row')?.textContent).toContain('8080');
    expect(root.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-23T09:00:00.000Z');
    expect(root.querySelector('.storage-warning')?.textContent).toContain(
      'wiped whenever this playroom restarts',
    );
    expect(root.textContent).toContain('not live usage');
    expect(
      root.querySelector('.connection-command-text:not(.ssh-command-text)')?.textContent,
    ).toContain('--forward-agent=false');
  });

  it('opens Create similar from the detail menu with the source settings', async () => {
    vi.spyOn(wailsApi, 'listPlayroomImages').mockResolvedValue([]);
    vi.spyOn(wailsApi, 'getPlayroomDefaults').mockResolvedValue([]);
    const fixture = await render();
    fixture.componentInstance
      .moreMenuItems()
      .find((item) => item.label === 'Create similar')
      ?.command?.({});
    fixture.detectChanges();
    await fixture.whenStable();
    const name = document.body.querySelector('#create-name') as HTMLInputElement;
    expect(name.value).toBe('');
    expect(document.body.querySelector('app-wizard-stepper')).not.toBeNull();
    expect(document.body.textContent).toContain('Not copied:');
    fixture.destroy();
  });

  it('shows a reported failure without pretending it is still provisioning', async () => {
    const fixture = await render({ Status: 'ImagePullBackOff' });
    const banner = fixture.nativeElement.querySelector('.status-banner') as HTMLElement;
    expect(banner.textContent).toContain('ImagePullBackOff');
    expect(banner.classList.contains('bad')).toBe(true);
    expect(banner.querySelector('.pi-spinner')).toBeNull();
  });

  it('does not invent a creation time or show the disposable warning for persistent storage', async () => {
    const fixture = await render({ CreatedAt: null, DiskType: 'persistent', Ports: null });
    expect(fixture.nativeElement.querySelector('time')).toBeNull();
    expect(fixture.componentInstance.ageLabel()).toBe('Not reported');
    expect(fixture.nativeElement.querySelector('.storage-warning')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.port-row')).toHaveLength(0);
  });

  it('opens only a command associated with the room in the current scope', async () => {
    const fixture = await render();
    const activity = TestBed.inject(CliConsoleService);
    const operationId = activity.recordHandoff('acloud playroom connect demo', 'Terminal');
    activity.associatePlayroom(operationId, { name: 'demo', playhouse: 'ph', scopeRevision: 0 });
    fixture.componentInstance.openRoomActivity();
    expect(activity.focus()).toBe(operationId);
    activity.close();
    TestBed.inject(PlayroomStateService).noteScopeChange();
    fixture.componentInstance.openRoomActivity();
    expect(activity.visible()).toBe(false);
  });

  it('reports an unavailable command preview and supports retrying it', async () => {
    vi.mocked(wailsApi.previewConnectPlayroom).mockRejectedValueOnce(
      new Error('Preview unavailable'),
    );
    const fixture = await render();
    expect(fixture.componentInstance.connectionCommand()).toBe('');
    expect(fixture.componentInstance.connectionCommandFailure()).toContain('Preview unavailable');
    fixture.componentInstance.retryConnectionCommand();
    await fixture.whenStable();
    expect(fixture.componentInstance.connectionCommand()).toContain('acloud playroom connect demo');
    expect(fixture.componentInstance.connectionCommandFailure()).toBe('');
  });

  it('discards a slow preview after the selected scope changes', async () => {
    let finishOldPreview = (_command: string[]) => {};
    vi.mocked(wailsApi.previewConnectPlayroom).mockReturnValueOnce(
      new Promise<string[]>((resolve) => {
        finishOldPreview = resolve;
      }),
    );
    const fixture = await render();
    TestBed.inject(PlayroomStateService).noteScopeChange();
    await fixture.whenStable();
    const currentCommand = fixture.componentInstance.connectionCommand();
    finishOldPreview(['old-scope-command']);
    await fixture.whenStable();
    expect(currentCommand).not.toBe('');
    expect(fixture.componentInstance.connectionCommand()).toBe(currentCommand);
  });
  it('opens and copies the exposed tailnet port, never the container port', async () => {
    const open = vi.spyOn(wailsApi, 'openUrlInDefaultBrowser').mockResolvedValue();
    const copy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { userAgent: navigator.userAgent, clipboard: { writeText: copy } });
    try {
      const fixture = await render({ SSHHost: 'demo.example.ts.net' });
      const link = fixture.nativeElement.querySelector('.port-row a') as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe('http://demo.example.ts.net:80');
      expect(link.textContent).toContain('Port 80 → container port 8080');
      expect(fixture.nativeElement.querySelector('.ports-hint')).toBeNull();
      expect(fixture.nativeElement.querySelectorAll('.ports-label')).toHaveLength(1);
      link.click();
      await fixture.whenStable();
      expect(open).toHaveBeenCalledWith('http://demo.example.ts.net:80');
      await fixture.componentInstance.copyPort(80);
      expect(copy).toHaveBeenCalledWith('http://demo.example.ts.net:80');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.port-row').textContent).toContain('Copied');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps ports without a reported tailnet host unlinked and copies their number', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { userAgent: navigator.userAgent, clipboard: { writeText: copy } });
    try {
      const fixture = await render();
      expect(fixture.nativeElement.querySelector('.port-row a')).toBeNull();
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('.port-row')?.textContent).toContain(
        'Port 80 → container port 8080',
      );
      expect(root.querySelector('.port-row .section-note')).toBeNull();
      expect(root.querySelectorAll('.ports-hint')).toHaveLength(1);
      expect(root.querySelector('.ports-hint')?.textContent?.trim()).toBe(
        'Reachable on the tailnet only.',
      );
      await fixture.componentInstance.copyPort(80);
      expect(copy).toHaveBeenCalledWith('80');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('copies the SSH alias and details with launch metadata and the sidebar acloud version', async () => {
    vi.spyOn(wailsApi, 'getAppVersion').mockResolvedValue('0.29.1');
    const { AcloudSessionService } = await import('../../../../core/services/acloud-session');
    vi.spyOn(TestBed.inject(AcloudSessionService), 'version').mockReturnValue('0.40.0');
    const copy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { userAgent: navigator.userAgent, clipboard: { writeText: copy } });
    try {
      const fixture = await render();
      await fixture.componentInstance.copySshCommand();
      expect(copy).toHaveBeenLastCalledWith('ssh playroom-demo');
      await fixture.componentInstance.copyDetails();
      expect(copy).toHaveBeenLastCalledWith(
        expect.stringContaining('App version: 0.29.1\nAcloud version: 0.40.0'),
      );
      expect(fixture.componentInstance.sshCopied()).toBe(true);
      expect(fixture.componentInstance.detailsCopied()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('pins and unpins the room from details', async () => {
    const fixture = await render();
    const state = TestBed.inject(PlayroomStateService);
    (
      fixture.nativeElement.querySelector(
        'button[aria-label="Pin playroom demo"]',
      ) as HTMLButtonElement
    ).click();
    expect(state.isPinned('ph', 'demo')).toBe(true);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        'button[aria-label="Unpin playroom demo"]',
      ) as HTMLButtonElement
    ).click();
    expect(state.isPinned('ph', 'demo')).toBe(false);
  });
});
