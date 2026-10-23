import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { of } from 'rxjs';
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
          useValue: { paramMap: of(convertToParamMap({ name: 'demo' })) },
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

  it('shows four sections, distinct port mappings, the real date and the disposable-storage warning', async () => {
    const fixture = await render();
    const root = fixture.nativeElement as HTMLElement;
    expect(
      [...root.querySelectorAll('.section-title')].map((heading) => heading.textContent?.trim()),
    ).toEqual(['Connection', 'Resources', 'Storage & security', 'Metadata']);
    expect(root.querySelectorAll('.port-row')).toHaveLength(2);
    expect(root.querySelector('.port-row')?.textContent).toContain('8080');
    expect(root.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-23T09:00:00.000Z');
    expect(root.querySelector('.storage-warning')?.textContent).toContain(
      'wiped whenever this playroom restarts',
    );
    expect(root.textContent).toContain('not live usage');
    expect(root.querySelector('.connection-command-text')?.textContent).toContain(
      '--forward-agent=false',
    );
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
});
