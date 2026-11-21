import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { AcloudSessionService } from '../../../../core/services/acloud-session';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { ToastService } from '../../../../core/services/toast';
import { HealthCheck, wailsApi } from '../../../../core/services/wails-api';
import { listingToRoom, updateCache } from '../../../../shared/utils';
import { HealthCheckPageComponent } from './health-check';

function check(fields: Partial<HealthCheck>): HealthCheck {
  return {
    Key: 'acloud',
    Name: 'acloud',
    Status: 'passed',
    Explanation: 'Fine.',
    Fix: '',
    Command: '',
    Action: '',
    ...fields,
  } as HealthCheck;
}

const results = [
  check({ Explanation: 'acloud 0.40.0 at /bin/acloud.' }),
  check({
    Key: 'sign-in',
    Name: 'Signed in to Acloud',
    Status: 'failed',
    Explanation: 'No credentials.',
    Fix: 'Sign in.',
    Command: 'acloud auth login',
    Action: 'sign-in',
  }),
  check({ Key: 'editor', Name: 'Editor', Status: 'warning', Explanation: 'No Gateway.' }),
];

async function render() {
  const fixture = TestBed.createComponent(HealthCheckPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('Health check page', () => {
  let checkHealth: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    localStorage.clear();
    checkHealth = vi.spyOn(wailsApi, 'checkHealth').mockResolvedValue(results);
    vi.spyOn(wailsApi, 'getAppVersion').mockResolvedValue('1.2.3');
    await TestBed.configureTestingModule({
      imports: [HealthCheckPageComponent],
      providers: [MessageService, provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows every check with its status, fix and command', async () => {
    const element: HTMLElement = (await render()).nativeElement;
    expect(element.querySelectorAll('.health-check')).toHaveLength(3);
    expect(element.querySelector('.health-summary')?.textContent).toContain(
      '2 checks need attention.',
    );
    const signIn = element.querySelector('[aria-labelledby="health-sign-in"]')!;
    expect(signIn.textContent).toContain('No credentials.');
    expect(signIn.textContent).toContain('Sign in.');
    expect(signIn.querySelector('.health-command')?.textContent).toBe('acloud auth login');
  });

  it('checks the terminal and editor last used to connect', async () => {
    updateCache({ lastTerminal: 'iterm', lastEditor: 'webstorm' });
    await render();
    expect(checkHealth).toHaveBeenCalledWith({
      Terminal: 'iterm',
      Editor: 'webstorm',
      CheckTailscale: true,
    });
  });

  it('skips Tailscale only when the playhouse rooms report other hosts', async () => {
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('ph');
    state.setRooms([listingToRoom({ Name: 'a', SSHHost: '203.0.113.5:30022' }, 'ph')]);
    state.markRoomsLoaded('ph');
    await render();
    expect(checkHealth.mock.calls[0][0]).toMatchObject({ CheckTailscale: false });
  });

  it('runs the checks again', async () => {
    const fixture = await render();
    await fixture.componentInstance.runChecks();
    expect(checkHealth).toHaveBeenCalledTimes(2);
  });

  it('copies the results for a support question', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const fixture = await render();
    await fixture.componentInstance.copyResults();
    expect(writeText.mock.calls[0][0]).toContain('Acloud Playrooms health check (app 1.2.3)');
    expect(writeText.mock.calls[0][0]).toContain('[failed] Signed in to Acloud: No credentials.');
    expect(TestBed.inject(ToastService).history()[0].detail).toBe(
      'Copied the health check results',
    );
  });

  it('signs in from the failed check and checks again', async () => {
    const signIn = vi
      .spyOn(TestBed.inject(AcloudSessionService), 'signInThroughTerminal')
      .mockResolvedValue(true);
    const fixture = await render();
    await fixture.componentInstance.runAction(results[1]);
    expect(signIn).toHaveBeenCalledOnce();
    expect(checkHealth).toHaveBeenCalledTimes(2);
  });

  it('opens Settings for a path fix', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = await render();
    await fixture.componentInstance.runAction(check({ Action: 'open-settings' }));
    expect(navigate).toHaveBeenCalledWith(['/settings']);
  });

  it('says when the checks could not run', async () => {
    checkHealth.mockRejectedValue(new Error('backend unavailable'));
    const element: HTMLElement = (await render()).nativeElement;
    expect(element.querySelector('.health-summary')?.textContent).toContain(
      'Could not run the checks: Backend unavailable',
    );
  });
});
