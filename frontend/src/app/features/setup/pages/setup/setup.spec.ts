import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MessageService } from 'primeng/api';
import { SetupPageComponent } from './setup';
import { AcloudSessionService } from '../../../../core/services/acloud-session';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { SetupService } from '../../../../core/services/setup';
import {
  AcloudBinaryStatus,
  PlayroomDefaultEntry,
  wailsApi,
} from '../../../../core/services/wails-api';
import { readCache } from '../../../../shared/utils';

const STEP = {
  welcome: 0,
  acloud: 1,
  login: 2,
  playhouse: 3,
  tools: 4,
  defaults: 5,
  done: 6,
} as const;

function binary(found: boolean): AcloudBinaryStatus {
  return {
    Path: found ? '/opt/homebrew/bin/acloud' : '',
    Source: found ? 'path' : 'none',
    Found: found,
    Version: found ? '0.37.0' : '',
    Message: '',
    ConfiguredPath: '',
    EnvironmentOverride: false,
  } as AcloudBinaryStatus;
}

function defaultEntry(key: string, value: string, builtin: string): PlayroomDefaultEntry {
  return { Key: key, Value: value, Builtin: builtin, Source: value ? 'config' : 'built-in' };
}

describe('SetupPageComponent', () => {
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    localStorage.clear();
    vi.spyOn(wailsApi, 'getAcloudBinaryStatus').mockResolvedValue(binary(false));
    vi.spyOn(wailsApi, 'listPlayhouses').mockResolvedValue([]);
    vi.spyOn(wailsApi, 'getCurrentContext').mockResolvedValue('');
    vi.spyOn(wailsApi, 'getCurrentOrganisation').mockResolvedValue('');
    vi.spyOn(wailsApi, 'listContexts').mockResolvedValue([]);
    vi.spyOn(wailsApi, 'listOrganisations').mockResolvedValue([]);
    vi.spyOn(wailsApi, 'listPlayroomImages').mockResolvedValue([]);
    vi.spyOn(wailsApi, 'getPlayroomDefaults').mockResolvedValue([
      defaultEntry('ssh-key', '', ''),
      defaultEntry('image', '', 'opencode'),
    ]);

    await TestBed.configureTestingModule({
      imports: [SetupPageComponent],
      providers: [MessageService, provideRouter([])],
    }).compileComponents();
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  async function render() {
    const fixture = TestBed.createComponent(SetupPageComponent);
    await fixture.whenStable();
    return fixture;
  }

  /** Every required step done, as for a returning user. */
  function completeTheRequiredSteps(): void {
    // The acloud step's card reads the status again when it opens.
    vi.spyOn(wailsApi, 'getAcloudBinaryStatus').mockResolvedValue(binary(true));
    TestBed.inject(AcloudSessionService).setBinaryStatus(binary(true));
    TestBed.inject(PlayroomStateService).setLoggedIn(true);
    TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-demo');
  }

  it('keeps Next disabled on a required step until it is done', async () => {
    const fixture = await render();
    const page = fixture.componentInstance;
    page.goToStep(STEP.acloud);
    await fixture.whenStable();

    page.goToNextStep();
    await fixture.whenStable();
    expect(page.activeIndex()).toBe(STEP.acloud);
    const next = () =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '.setup-actions p-button:last-child button',
      );
    expect(next()?.disabled).toBe(true);

    TestBed.inject(AcloudSessionService).setBinaryStatus(binary(true));
    await fixture.whenStable();
    expect(next()?.disabled).toBe(false);
    page.goToNextStep();
    expect(page.activeIndex()).toBe(STEP.login);
  });

  it('does not let the stepper jump past a required step that is not done', async () => {
    const page = (await render()).componentInstance;

    page.goToStep(STEP.done);

    expect(page.activeIndex()).toBe(STEP.welcome);
  });

  it('lets a returning user click straight through to the end', async () => {
    completeTheRequiredSteps();
    const fixture = await render();
    const page = fixture.componentInstance;

    for (let step = STEP.welcome; step < STEP.done; step++) {
      page.goToNextStep();
      await fixture.whenStable();
    }

    expect(page.activeIndex()).toBe(STEP.done);
  });

  it('skips the optional defaults step without saving anything', async () => {
    completeTheRequiredSteps();
    const setPlayroomDefault = vi.spyOn(wailsApi, 'setPlayroomDefault');
    const fixture = await render();
    const page = fixture.componentInstance;
    page.goToStep(STEP.defaults);
    await fixture.whenStable();

    page.goToNextStep();

    expect(page.activeIndex()).toBe(STEP.done);
    expect(setPlayroomDefault).not.toHaveBeenCalled();
  });

  it('saves only the defaults that changed, the way the Defaults screen does', async () => {
    completeTheRequiredSteps();
    const setPlayroomDefault = vi.spyOn(wailsApi, 'setPlayroomDefault').mockResolvedValue();
    const unsetPlayroomDefault = vi.spyOn(wailsApi, 'unsetPlayroomDefault').mockResolvedValue();
    const fixture = await render();
    const page = fixture.componentInstance;
    page.goToStep(STEP.defaults);
    await fixture.whenStable();
    expect(page.imageDraft()).toBe('opencode');

    page.sshKeyDraft.set('~/.ssh/id_ed25519.pub');
    await page.saveDefaultsAndContinue();

    expect(setPlayroomDefault).toHaveBeenCalledWith(
      expect.any(String),
      'ssh-key',
      '~/.ssh/id_ed25519.pub',
    );
    expect(setPlayroomDefault).toHaveBeenCalledTimes(1);
    expect(unsetPlayroomDefault).not.toHaveBeenCalled();
    expect(page.activeIndex()).toBe(STEP.done);
  });

  it('finishes setup and opens Rooms with the create drawer', async () => {
    completeTheRequiredSteps();
    const page = (await render()).componentInstance;

    page.finishAndCreateFirstPlayroom();

    expect(TestBed.inject(SetupService).setupCompleted()).toBe(true);
    expect(readCache().setupCompleted).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/rooms'], { queryParams: { create: true } });
  });

  it('finishes setup and opens Rooms without the create drawer', async () => {
    completeTheRequiredSteps();
    const page = (await render()).componentInstance;

    page.finishAndGoToPlayrooms();

    expect(readCache().setupCompleted).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['/rooms']);
  });

  it('leaves without marking setup completed when set up later', async () => {
    const page = (await render()).componentInstance;

    page.setUpLater();

    expect(readCache().setupCompleted).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/rooms']);
  });

  it('opens at the step the launch asked for', async () => {
    TestBed.inject(Router).resetConfig([{ path: 'setup', component: SetupPageComponent }]);
    const harness = await RouterTestingHarness.create();

    const page = await harness.navigateByUrl('/setup?step=login', SetupPageComponent);

    expect(page.activeIndex()).toBe(STEP.login);
  });
});
