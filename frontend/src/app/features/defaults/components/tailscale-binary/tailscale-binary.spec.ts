import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { AcloudSessionService } from '../../../../core/services/acloud-session';
import { ToastService } from '../../../../core/services/toast';
import { TailscaleBinaryStatus, wailsApi } from '../../../../core/services/wails-api';
import { TailscaleBinaryCardComponent } from './tailscale-binary';

function status(overrides: Partial<TailscaleBinaryStatus> = {}): TailscaleBinaryStatus {
  return {
    Path: '/opt/homebrew/bin/tailscale',
    Source: 'known-location',
    Found: true,
    Version: '1.104.2',
    Message: 'Using Tailscale',
    ConfiguredPath: '',
    ...overrides,
  };
}

async function render(initial = status()) {
  vi.spyOn(wailsApi, 'getTailscaleBinaryStatus').mockResolvedValue(initial);
  const fixture = TestBed.createComponent(TailscaleBinaryCardComponent);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('Tailscale binary card', () => {
  beforeEach(async () => {
    vi.spyOn(wailsApi, 'getToolStatuses').mockResolvedValue([
      {
        Name: 'Tailscale',
        Command: 'tailscale',
        State: 'installed',
        Path: '/opt/homebrew/bin/tailscale',
        Message: '',
      },
    ]);
    await TestBed.configureTestingModule({
      imports: [TailscaleBinaryCardComponent],
      providers: [MessageService],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows the automatically found Homebrew path without expanding', async () => {
    const fixture = await render();
    expect(fixture.componentInstance.expanded()).toBe(false);
    expect(fixture.nativeElement.querySelector('.binary-path-inline').textContent).toContain(
      '/opt/homebrew/bin/tailscale',
    );
  });

  it('opens a broken saved path for correction', async () => {
    const fixture = await render(
      status({ Found: false, ConfiguredPath: '/old/tailscale', Path: '/old/tailscale' }),
    );
    expect(fixture.componentInstance.expanded()).toBe(true);
    expect(fixture.componentInstance.draft()).toBe('/old/tailscale');
    expect(fixture.nativeElement.querySelector('#tailscale-binary-path')).not.toBeNull();
  });

  it('keeps a refused path and its error visible', async () => {
    const fixture = await render(status({ Found: false, Path: '', Source: 'none' }));
    vi.spyOn(wailsApi, 'setTailscaleBinary').mockRejectedValue(new Error('not an executable file'));
    fixture.componentInstance.draft.set('/nope');
    await fixture.componentInstance.save();
    expect(fixture.componentInstance.problem()).toContain('executable');
    expect(fixture.componentInstance.expanded()).toBe(true);
    expect(fixture.componentInstance.draft()).toBe('/nope');
  });

  it('saves the path, refreshes the sidebar status and collapses', async () => {
    const fixture = await render(status({ Found: false, Path: '', Source: 'none' }));
    const save = vi.spyOn(wailsApi, 'setTailscaleBinary').mockResolvedValue();
    vi.mocked(wailsApi.getTailscaleBinaryStatus).mockResolvedValue(
      status({
        Source: 'configured',
        Path: '/custom/Tailscale',
        ConfiguredPath: '/custom/Tailscale',
      }),
    );
    fixture.componentInstance.draft.set(' /custom/Tailscale ');
    await fixture.componentInstance.save();
    expect(save).toHaveBeenCalledWith('/custom/Tailscale');
    expect(fixture.componentInstance.expanded()).toBe(false);
    expect(fixture.componentInstance.status()?.ConfiguredPath).toBe('/custom/Tailscale');
    expect(TestBed.inject(AcloudSessionService).toolStatuses()[0].State).toBe('installed');
  });

  it('does not report success when the saved status cannot be read', async () => {
    const fixture = await render(status({ Found: false, Path: '', Source: 'none' }));
    vi.spyOn(wailsApi, 'setTailscaleBinary').mockResolvedValue();
    vi.mocked(wailsApi.getTailscaleBinaryStatus).mockRejectedValue(
      new Error('could not read status'),
    );
    const toast = vi.spyOn(TestBed.inject(ToastService), 'toast');
    fixture.componentInstance.draft.set('/custom/tailscale');
    await fixture.componentInstance.save();
    expect(toast).not.toHaveBeenCalled();
    expect(fixture.componentInstance.expanded()).toBe(true);
    expect(fixture.componentInstance.problem()).toContain('read status');
  });

  it('treats a cancelled picker as no change and saves a chosen path', async () => {
    const fixture = await render();
    const browse = vi.spyOn(wailsApi, 'browseForTailscaleBinary').mockResolvedValue('');
    const save = vi.spyOn(wailsApi, 'setTailscaleBinary').mockResolvedValue();
    await fixture.componentInstance.browse();
    expect(save).not.toHaveBeenCalled();
    browse.mockResolvedValue('/picked/tailscale');
    await fixture.componentInstance.browse();
    expect(save).toHaveBeenCalledWith('/picked/tailscale');
  });

  it('clears the saved path and returns to automatic lookup', async () => {
    const fixture = await render(
      status({ ConfiguredPath: '/custom/tailscale', Source: 'configured' }),
    );
    const clear = vi.spyOn(wailsApi, 'clearTailscaleBinary').mockResolvedValue();
    vi.mocked(wailsApi.getTailscaleBinaryStatus).mockResolvedValue(status());
    await fixture.componentInstance.useAutomatic();
    expect(clear).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.hasSavedPath()).toBe(false);
    expect(fixture.componentInstance.draft()).toBe('/opt/homebrew/bin/tailscale');
  });
});
