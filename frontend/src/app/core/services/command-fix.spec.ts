import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { CommandFixService } from './command-fix';
import { PlayroomLifecycleService } from './playroom-lifecycle';
import { PlayroomStateService } from './playroom-state';
import { PlayroomConnectService } from './playroom-connect';
import { ToastService } from './toast';
import { CliConsoleService } from './cli-console';
import { wailsApi } from './wails-api';
import { blankCreateForm, blankUpdateForm, listingToRoom } from '../../shared/utils';

const expired = new Error('ensure local kubeconfig: session not active');
const outdated =
  'playroom "demo" is missing the latest security hardening; run acloud playroom update demo --playhouse ph to apply it (the playroom restarts)';

beforeEach(() => {
  localStorage.clear();
  TestBed.configureTestingModule({ providers: [MessageService] });
  TestBed.inject(PlayroomStateService).selectPlayhouse('ph');
  vi.spyOn(TestBed.inject(CliConsoleService), 'run').mockImplementation(async (_label, run) => {
    await run('fix-test');
  });
  vi.spyOn(wailsApi, 'listPlayrooms').mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

it('keeps the action in toast data and notification history', () => {
  const add = vi.spyOn(TestBed.inject(MessageService), 'add');
  const action = TestBed.inject(CommandFixService).action(expired, { signIn: vi.fn() });
  TestBed.inject(ToastService).failure('Could not list', expired, 'failed', action);
  expect(add.mock.calls[0][0].data.action).toBe(action);
  expect(TestBed.inject(ToastService).history()[0].action).toBe(action);
});

it('refuses stale actions even after switching away and back', async () => {
  const run = vi.fn();
  const state = TestBed.inject(PlayroomStateService);
  const action = TestBed.inject(CommandFixService).action(expired, { signIn: run })!;
  state.selectPlayhouse('other');
  state.selectPlayhouse('ph');
  await action.run();
  expect(run).not.toHaveBeenCalled();
});

it('prevents duplicate clicks and reports a failed fix', async () => {
  let reject = (_error: Error) => {};
  const run = vi.fn(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      }),
  );
  const action = TestBed.inject(CommandFixService).action(expired, { signIn: run })!;
  const pending = action.run();
  await action.run();
  expect(run).toHaveBeenCalledTimes(1);
  expect(action.busy()).toBe(true);
  reject(new Error('network unavailable'));
  await pending;
  expect(action.busy()).toBe(false);
  expect(TestBed.inject(ToastService).history()[0].summary).toBe('Could not apply the fix');
});

for (const kind of ['start', 'stop', 'delete', 'create', 'update'] as const) {
  it(`repeats ${kind} with the original input and ForceInstall`, async () => {
    const service = TestBed.inject(PlayroomLifecycleService);
    TestBed.tick();
    const room = listingToRoom({ Name: 'demo', Status: 'Ready' }, 'ph');
    const method =
      kind === 'start'
        ? 'startPlayroom'
        : kind === 'stop'
          ? 'stopPlayroom'
          : kind === 'delete'
            ? 'deletePlayroom'
            : kind === 'create'
              ? 'createPlayroom'
              : 'updatePlayroom';
    const command = vi.spyOn(wailsApi, method).mockRejectedValueOnce(expired).mockResolvedValue();
    if (kind === 'start') await service.start(room);
    if (kind === 'stop') await service.stop(room);
    if (kind === 'delete') await service.delete(room, false, '7m', true);
    if (kind === 'create')
      service.startCreate({ ...blankCreateForm('ph'), name: 'demo', image: 'opencode' });
    if (kind === 'update') service.startUpdate({ ...blankUpdateForm(room), image: 'opencode' });
    await vi.waitFor(() => expect(service.pendingOperation('demo')).toBe(''));
    const firstInput = command.mock.calls[0][1];
    const action = TestBed.inject(ToastService)
      .history()
      .find((entry) => entry.action)?.action;
    expect(action?.label).toBe('Sign in to the playhouse again');
    await action!.run();
    await vi.waitFor(() => expect(command).toHaveBeenCalledTimes(2));
    expect(command.mock.calls[1][1]).toEqual({ ...firstInput, ForceInstall: true });
    await vi.waitFor(() => expect(service.pendingOperation('demo')).toBe(''));
  });
}

it('refreshes the failed room list with ForceInstall', async () => {
  const service = TestBed.inject(PlayroomLifecycleService);
  vi.mocked(wailsApi.listPlayrooms).mockRejectedValueOnce(expired);
  await expect(service.reload('ph')).rejects.toThrow();
  await service.loadFix()!.run();
  expect(wailsApi.listPlayrooms).toHaveBeenLastCalledWith({ Playhouse: 'ph', ForceInstall: true });
  expect(service.loadFix()).toBeUndefined();
});

it('updates an outdated persistent room using only its name and playhouse', async () => {
  const service = TestBed.inject(PlayroomLifecycleService);
  const room = listingToRoom({ Name: 'demo', Status: 'Ready' }, 'ph');
  vi.spyOn(wailsApi, 'startPlayroom').mockRejectedValue(new Error(outdated));
  const update = vi.spyOn(wailsApi, 'updatePlayroom').mockResolvedValue();
  await service.start(room);
  await TestBed.inject(ToastService)
    .history()
    .find((entry) => entry.action)!
    .action!.run();
  expect(update).toHaveBeenCalledWith('fix-test', { Name: 'demo', Playhouse: 'ph' });
});

it('offers no update for an ephemeral room', async () => {
  vi.spyOn(wailsApi, 'startPlayroom').mockRejectedValue(new Error(outdated));
  const room = { ...listingToRoom({ Name: 'demo' }, 'ph'), ephemeral: true };
  await TestBed.inject(PlayroomLifecycleService).start(room);
  expect(
    TestBed.inject(ToastService)
      .history()
      .some((entry) => entry.action),
  ).toBe(false);
});

it('reopens create Options after the exact privileged image failure', async () => {
  const service = TestBed.inject(PlayroomLifecycleService);
  TestBed.tick();
  vi.spyOn(wailsApi, 'createPlayroom').mockRejectedValue(
    new Error(
      'image "claude-code-dind" runs a Docker daemon and requires a privileged playroom (--privileged at create); use another image',
    ),
  );
  const options = vi.fn();
  service.startCreate({ ...blankCreateForm('ph'), name: 'demo' }, options);
  await vi.waitFor(() => expect(service.pendingOperation('demo')).toBe(''));
  const action = TestBed.inject(ToastService)
    .history()
    .find((entry) => entry.action)!.action!;
  expect(action.label).toBe('Go to Options');
  await action.run();
  expect(options).toHaveBeenCalledOnce();
});

it('sends ForceInstall and preserves all connect settings', async () => {
  const connect = vi.spyOn(wailsApi, 'connectPlayroom').mockResolvedValue();
  vi.spyOn(wailsApi, 'previewConnectPlayroom').mockResolvedValue(['acloud', 'playroom', 'connect']);
  vi.spyOn(TestBed.inject(CliConsoleService), 'recordHandoff').mockReturnValue('handoff');
  await TestBed.inject(PlayroomConnectService).connect(
    listingToRoom({ Name: 'demo' }, 'ph'),
    'root',
    'terminal',
    false,
    'nodeport',
    true,
  );
  expect(connect).toHaveBeenCalledWith({
    Name: 'demo',
    Playhouse: 'ph',
    User: 'root',
    Terminal: 'terminal',
    ForwardAgent: false,
    Via: 'nodeport',
    ForceInstall: true,
  });
});

it('offers a forced retry if updating an outdated room needs a new session', async () => {
  const room = listingToRoom({ Name: 'demo' }, 'ph');
  const update = vi
    .spyOn(wailsApi, 'updatePlayroom')
    .mockRejectedValueOnce(expired)
    .mockResolvedValue();
  await TestBed.inject(PlayroomLifecycleService).updateOutdated(room);
  const action = TestBed.inject(ToastService)
    .history()
    .find((entry) => entry.action)!.action!;
  await action.run();
  expect(update).toHaveBeenLastCalledWith('fix-test', {
    Name: 'demo',
    Playhouse: 'ph',
    ForceInstall: true,
  });
});
