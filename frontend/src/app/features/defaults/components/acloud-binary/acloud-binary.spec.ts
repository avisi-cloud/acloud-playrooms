import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { AcloudBinaryCardComponent } from './acloud-binary';
import { AcloudBinaryStatus, wailsApi } from '../../../../core/services/wails-api';

function status(overrides: Partial<AcloudBinaryStatus> = {}): AcloudBinaryStatus {
  return {
    Path: '/opt/homebrew/bin/acloud',
    Source: 'path',
    Found: true,
    Version: '0.35.0',
    Message: 'Found /opt/homebrew/bin/acloud on PATH.',
    ConfiguredPath: '',
    EnvironmentOverride: false,
    ...overrides,
  } as AcloudBinaryStatus;
}

async function render(initial: AcloudBinaryStatus) {
  vi.spyOn(wailsApi, 'getAcloudBinaryStatus').mockResolvedValue(initial);
  const fixture = TestBed.createComponent(AcloudBinaryCardComponent);
  await fixture.whenStable();
  return fixture;
}

describe('Acloud binary card', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AcloudBinaryCardComponent],
      providers: [MessageService],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  // A working install should not nag: the card is a collapsed one-liner.
  it('stays collapsed when acloud was found', async () => {
    const fixture = await render(status());
    expect(fixture.componentInstance.expanded()).toBe(false);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.binary-path-inline')?.textContent).toContain(
      '/opt/homebrew/bin/acloud',
    );
    expect(element.querySelector('.binary-input')).toBeNull();
  });

  // The whole point: when nothing was found, the field is already open, because
  // every other screen is empty and this is the only way out.
  it('opens the path field when acloud is missing', async () => {
    const fixture = await render(
      status({ Found: false, Path: '', Version: '', Source: 'none', Message: 'cannot find it' }),
    );
    expect(fixture.componentInstance.expanded()).toBe(true);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.binary-input')).not.toBeNull();
    expect(element.querySelector('.binary-nudge')?.textContent).toContain('empty');
  });

  it('prefills the field with the saved path so it can be corrected', async () => {
    const fixture = await render(
      status({ Found: false, ConfiguredPath: '/old/acloud', Message: 'no file at /old/acloud' }),
    );
    expect(fixture.componentInstance.draft()).toBe('/old/acloud');
  });

  it('keeps a refused path on screen with the reason', async () => {
    const fixture = await render(status({ Found: false, Path: '', Source: 'none' }));
    vi.spyOn(wailsApi, 'setAcloudBinary').mockRejectedValue(new Error('no file at /nope'));

    fixture.componentInstance.draft.set('/nope');
    await fixture.componentInstance.save();
    await fixture.whenStable();

    // explainFailure capitalises what the CLI said before showing it.
    expect(fixture.componentInstance.problem()).toContain('o file at /nope');
    expect(fixture.componentInstance.draft()).toBe('/nope');
    expect(fixture.componentInstance.expanded()).toBe(true);
  });

  it('collapses once a path is accepted', async () => {
    const fixture = await render(status({ Found: false, Path: '', Source: 'none' }));
    vi.spyOn(wailsApi, 'setAcloudBinary').mockResolvedValue(
      status({ Source: 'configured', ConfiguredPath: '/custom/acloud', Path: '/custom/acloud' }),
    );

    fixture.componentInstance.draft.set('/custom/acloud');
    await fixture.componentInstance.save();

    expect(fixture.componentInstance.problem()).toBe('');
    expect(fixture.componentInstance.found()).toBe(true);
    expect(fixture.componentInstance.expanded()).toBe(false);
  });

  // ACLOUD_BINARY outranks anything saved here, so an edit would not take
  // effect and is not offered.
  it('offers no field when the environment variable pins the binary', async () => {
    const fixture = await render(status({ Source: 'environment', EnvironmentOverride: true }));
    fixture.componentInstance.expanded.set(true);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.binary-input')).toBeNull();
    expect(element.textContent).toContain('ACLOUD_BINARY');
  });

  it('treats a cancelled file picker as nothing happening', async () => {
    const fixture = await render(status({ Found: false, Path: '', Source: 'none' }));
    vi.spyOn(wailsApi, 'browseForAcloudBinary').mockResolvedValue('');
    const save = vi.spyOn(wailsApi, 'setAcloudBinary');

    await fixture.componentInstance.browse();

    expect(save).not.toHaveBeenCalled();
    expect(fixture.componentInstance.problem()).toBe('');
  });

  it('saves straight away when a file is picked', async () => {
    const fixture = await render(status({ Found: false, Path: '', Source: 'none' }));
    vi.spyOn(wailsApi, 'browseForAcloudBinary').mockResolvedValue('/picked/acloud');
    const save = vi
      .spyOn(wailsApi, 'setAcloudBinary')
      .mockResolvedValue(
        status({ Source: 'configured', ConfiguredPath: '/picked/acloud', Path: '/picked/acloud' }),
      );

    await fixture.componentInstance.browse();

    expect(save).toHaveBeenCalledWith('/picked/acloud');
    expect(fixture.componentInstance.found()).toBe(true);
  });
});
