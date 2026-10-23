import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { T3CodePathStatus, wailsApi } from '../../../../core/services/wails-api';
import { T3CodePathCardComponent } from './t3-code-path';

function status(overrides: Partial<T3CodePathStatus> = {}): T3CodePathStatus {
  return {
    Path: '/Applications/T3 Code (Beta).app',
    Source: 'known-location',
    Found: true,
    Version: '0.1.2',
    Message: 'Found T3 Code',
    ConfiguredPath: '',
    IsApplication: true,
    ...overrides,
  };
}

describe('T3 Code path', () => {
  beforeEach(async () => {
    vi.spyOn(wailsApi, 'getT3CodePathStatus').mockResolvedValue(status());
    await TestBed.configureTestingModule({
      imports: [T3CodePathCardComponent],
      providers: [MessageService],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  async function render() {
    const fixture = TestBed.createComponent(T3CodePathCardComponent);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('shows a detected desktop app as a collapsed optional integration', async () => {
    const fixture = await render();
    expect(fixture.componentInstance.found()).toBe(true);
    expect(fixture.componentInstance.expanded()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('/Applications/T3 Code (Beta).app');
  });

  it('does not present an absent optional integration as a broken tool', async () => {
    vi.mocked(wailsApi.getT3CodePathStatus).mockResolvedValue(
      status({ Found: false, Path: '', Version: '', Source: 'none', IsApplication: false }),
    );
    const fixture = await render();
    expect(fixture.componentInstance.stateLabel()).toBe('optional');
    expect(fixture.componentInstance.stateSeverity()).toBe('secondary');
    expect(fixture.nativeElement.querySelector('.is-broken')).toBeNull();
  });

  it('keeps a broken saved selection visible and offers automatic discovery', async () => {
    vi.mocked(wailsApi.getT3CodePathStatus).mockResolvedValue(
      status({
        Found: false,
        Source: 'configured',
        ConfiguredPath: '/missing/T3 Code.app',
        Path: '/missing/T3 Code.app',
      }),
    );
    const fixture = await render();
    expect(fixture.componentInstance.expanded()).toBe(true);
    expect(fixture.componentInstance.hasSavedPath()).toBe(true);
    expect(fixture.componentInstance.draft()).toBe('/missing/T3 Code.app');
  });

  it('persists a selected path and refreshes its status', async () => {
    const save = vi.spyOn(wailsApi, 'setT3CodePath').mockResolvedValue();
    const fixture = await render();
    fixture.componentInstance.draft.set('/custom/t3');
    vi.mocked(wailsApi.getT3CodePathStatus).mockResolvedValue(
      status({
        Path: '/custom/t3',
        ConfiguredPath: '/custom/t3',
        Source: 'configured',
        IsApplication: false,
      }),
    );
    await fixture.componentInstance.save();
    expect(save).toHaveBeenCalledWith('/custom/t3');
    expect(fixture.componentInstance.draft()).toBe('/custom/t3');
    expect(fixture.componentInstance.expanded()).toBe(false);
  });

  it('retains rejected input and shows the error inline', async () => {
    vi.spyOn(wailsApi, 'setT3CodePath').mockRejectedValue(new Error('Not T3 Code'));
    const fixture = await render();
    fixture.componentInstance.expanded.set(true);
    fixture.componentInstance.draft.set('/wrong/app');
    await fixture.componentInstance.save();
    expect(fixture.componentInstance.draft()).toBe('/wrong/app');
    expect(fixture.componentInstance.expanded()).toBe(true);
    expect(fixture.componentInstance.problem()).toContain('Not T3 Code');
  });

  it('clears the preference without treating missing T3 Code as a failure', async () => {
    const clear = vi.spyOn(wailsApi, 'clearT3CodePath').mockResolvedValue();
    const fixture = await render();
    vi.mocked(wailsApi.getT3CodePathStatus).mockResolvedValue(
      status({ Found: false, Path: '', Source: 'none', Version: '' }),
    );
    await fixture.componentInstance.useAutomatic();
    expect(clear).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.stateLabel()).toBe('optional');
  });

  it('reports a failed status read instead of claiming that the path was saved', async () => {
    const fixture = await render();
    vi.mocked(wailsApi.getT3CodePathStatus).mockRejectedValue(
      new Error('Native service unavailable'),
    );
    expect(await fixture.componentInstance.refresh()).toBe(false);
    expect(fixture.componentInstance.problem()).toContain('Native service unavailable');
  });
});
