import { DesktopNotificationsService } from './desktop-notifications';
import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { PlayroomLifecycleService, nextRefreshDelay, updateInputFor } from './playroom-lifecycle';
import { UpdateForm } from '../../shared/models';
import { blankCreateForm, listingToRoom, readCache } from '../../shared/utils';
import { PlayroomStateService } from './playroom-state';
import { UiSessionService } from './ui-session';
import { ToastService } from './toast';
import { CliConsoleService } from './cli-console';
import { wailsApi } from './wails-api';

function form(overrides: Partial<UpdateForm> = {}): UpdateForm {
  return {
    name: 'demo',
    playhouse: 'ph',
    image: '',
    cpuReq: '',
    cpuLim: '',
    memReq: '',
    memLim: '',
    storage: '',
    capabilities: '',
    changeReadOnly: false,
    readOnly: true,
    changePorts: false,
    clearPorts: false,
    ports: [''],
    changeCapAdd: false,
    clearCapAdd: false,
    capAdd: [''],
    changeWorkspaceNamespace: false,
    workspaceNamespace: true,
    acknowledgeWorkspaceNamespaceRemoval: false,
    moveToTailscale: false,
    changeNodePortSSH: false,
    nodePortSSH: true,
    noWait: false,
    waitTimeout: '5m',
    ...overrides,
  };
}

describe('updateInputFor', () => {
  // An empty exposure keeps the playroom's current one, so the toggle being off
  // must send nothing rather than a value.
  it('sends no exposure when the tailnet toggle is off', () => {
    expect(updateInputFor(form()).Exposure).toBe('');
  });

  // tailscale is the only target `playroom update` accepts; the others require
  // recreating the playroom, so the UI never offers them.
  it('sends tailscale when the tailnet toggle is on', () => {
    expect(updateInputFor(form({ moveToTailscale: true })).Exposure).toBe('tailscale');
  });

  // The backend only sends --nodeport-ssh when the change toggle is on.
  it('carries the NodePort SSH change and its value', () => {
    expect(updateInputFor(form()).ChangeNodePortSSH).toBe(false);
    const input = updateInputFor(form({ changeNodePortSSH: true, nodePortSSH: false }));
    expect(input.ChangeNodePortSSH).toBe(true);
    expect(input.NodePortSSH).toBe(false);
  });

  it('passes none through for an unset request and limit', () => {
    const input = updateInputFor(
      form({ cpuReq: 'none', cpuLim: 'none', memReq: 'none', memLim: 'none' }),
    );
    expect(input.CPURequest).toBe('none');
    expect(input.CPULimit).toBe('none');
    expect(input.MemoryRequest).toBe('none');
    expect(input.MemoryLimit).toBe('none');
  });

  it('passes the new storage size and capability profile through', () => {
    const input = updateInputFor(form({ storage: '40Gi', capabilities: 'standard' }));
    expect(input.Storage).toBe('40Gi');
    expect(input.Capabilities).toBe('standard');
  });

  it('sends the added capabilities without blank rows', () => {
    const input = updateInputFor(form({ changeCapAdd: true, capAdd: ['NET_ADMIN', ''] }));
    expect(input.ChangeCapAdd).toBe(true);
    expect(input.CapAdd).toEqual(['NET_ADMIN']);
  });

  // An empty list is what the backend turns into `--cap-add none`.
  it('sends an empty list when every added capability is removed', () => {
    const input = updateInputFor(
      form({ changeCapAdd: true, clearCapAdd: true, capAdd: ['NET_ADMIN'] }),
    );
    expect(input.CapAdd).toEqual([]);
  });

  it('passes the namespace toggle and whether it was touched', () => {
    const input = updateInputFor(
      form({ changeWorkspaceNamespace: true, workspaceNamespace: false }),
    );
    expect(input.ChangeWorkspaceNamespace).toBe(true);
    expect(input.WorkspaceNamespace).toBe(false);
  });
});

describe('Background room changes', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [MessageService] });
    TestBed.inject(PlayroomStateService).selectPlayhouse('ph');
    TestBed.inject(PlayroomLifecycleService);
    TestBed.tick();
    vi.spyOn(wailsApi, 'listPlayrooms').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function prepareChange(kind: 'create' | 'update') {
    const state = TestBed.inject(PlayroomStateService);
    const actions = TestBed.inject(PlayroomLifecycleService);
    const session = TestBed.inject(UiSessionService);
    const submittedForm = kind === 'create' ? blankCreateForm('ph') : form();
    submittedForm.name = 'demo';
    const draftKey = kind === 'create' ? 'create' : 'update:demo';
    session.remember(draftKey, submittedForm);
    state.setRooms([listingToRoom({ Name: 'demo', Status: 'Ready' }, 'ph')]);
    let resolveCommand = () => {};
    let rejectCommand = (_error: Error) => {};
    const command = new Promise<void>((resolve, reject) => {
      resolveCommand = resolve;
      rejectCommand = reject;
    });
    const execute = vi
      .spyOn(wailsApi, kind === 'create' ? 'createPlayroom' : 'updatePlayroom')
      .mockReturnValue(command);
    const start = () =>
      kind === 'create'
        ? actions.startCreate(submittedForm as ReturnType<typeof blankCreateForm>)
        : actions.startUpdate(submittedForm as UpdateForm);
    return {
      actions,
      state,
      session,
      submittedForm,
      draftKey,
      execute,
      start,
      resolveCommand,
      rejectCommand,
    };
  }

  describe.each(['create', 'update'] as const)('%s', (kind) => {
    it('accepts immediately, snapshots input and rejects a duplicate without changing state', async () => {
      const change = prepareChange(kind);
      expect(change.start()).toBe(true);
      const pendingStatus = change.state.rooms()[0].status;
      change.submittedForm.image = 'edited-after-submission';
      change.submittedForm.ports.push('8080');
      expect(change.start()).toBe(false);
      expect(change.execute).toHaveBeenCalledTimes(1);
      expect(change.execute.mock.calls[0][1].Image).not.toBe('edited-after-submission');
      expect(change.execute.mock.calls[0][1].Ports).not.toContain('8080');
      expect(change.state.rooms()[0].status).toBe(pendingStatus);
      expect(change.actions.pendingOperation('demo')).not.toBe('');
      const toast = vi.spyOn(TestBed.inject(ToastService), 'toast');
      change.submittedForm.name = 'renamed-after-submission';
      change.resolveCommand();
      await vi.waitFor(() => expect(change.actions.pendingOperation('demo')).toBe(''));
      expect(change.session.recall(change.draftKey)).toBeUndefined();
      expect(toast).toHaveBeenCalledWith(
        kind === 'create' ? 'Created "demo"' : 'Updated "demo"',
        'ok',
        expect.any(String),
      );
    });

    it('retains a failed submission and reloads because the CLI may already have changed the room', async () => {
      const change = prepareChange(kind);
      const reportFailure = vi.spyOn(TestBed.inject(ToastService), 'failure');
      change.start();
      change.rejectCommand(new Error('wait timed out'));
      await vi.waitFor(() => expect(change.actions.pendingOperation('demo')).toBe(''));
      expect(change.session.recall(change.draftKey)).toEqual(change.submittedForm);
      expect(wailsApi.listPlayrooms).toHaveBeenCalledWith({ Playhouse: 'ph' });
      expect(reportFailure).toHaveBeenCalledWith(
        expect.stringContaining('demo'),
        expect.any(Error),
        expect.any(String),
        undefined,
      );
    });

    it('does not erase a newer draft when the command succeeds', async () => {
      const change = prepareChange(kind);
      change.start();
      change.session.remember(change.draftKey, { ...change.submittedForm, image: 'new-draft' });
      change.resolveCommand();
      await vi.waitFor(() => expect(change.actions.pendingOperation('demo')).toBe(''));
      expect(change.session.recall(change.draftKey)).toMatchObject({ image: 'new-draft' });
    });

    it('reports a refresh failure separately from a successful command', async () => {
      const change = prepareChange(kind);
      vi.mocked(wailsApi.listPlayrooms).mockRejectedValue(new Error('read failed'));
      const reportFailure = vi.spyOn(TestBed.inject(ToastService), 'failure');
      const toast = vi.spyOn(TestBed.inject(ToastService), 'toast');
      change.start();
      change.resolveCommand();
      await vi.waitFor(() => expect(change.actions.pendingOperation('demo')).toBe(''));
      expect(toast).toHaveBeenCalledWith(
        kind === 'create' ? 'Created "demo"' : 'Updated "demo"',
        'ok',
        expect.any(String),
      );
      expect(reportFailure).toHaveBeenCalledExactlyOnceWith(
        'Could not refresh the playrooms',
        expect.any(Error),
        '',
        undefined,
      );
      expect(change.session.recall(change.draftKey)).toBeUndefined();
    });

    it('does not refresh, clear drafts or move cached selection after a scope change', async () => {
      const change = prepareChange(kind);
      change.start();
      change.state.noteScopeChange();
      change.state.selectPlayhouse('another-ph');
      TestBed.tick();
      change.session.remember(change.draftKey, { image: 'another-scope' });
      const cachedSelection = readCache();
      change.resolveCommand();
      await vi.waitFor(() => expect(TestBed.inject(CliConsoleService).isRunning()).toBe(false));
      expect(wailsApi.listPlayrooms).not.toHaveBeenCalled();
      expect(change.session.recall(change.draftKey)).toEqual({ image: 'another-scope' });
      expect(readCache()).toEqual(cachedSelection);
    });

    it('rejects a form opened for another playhouse', () => {
      const change = prepareChange(kind);
      change.submittedForm.playhouse = 'another-ph';
      expect(change.start()).toBe(false);
      expect(change.execute).not.toHaveBeenCalled();
      expect(change.state.rooms()[0].status).toBe('ready');
    });
  });

  it.each(['start', 'stop', 'delete'] as const)(
    'does not patch the room for a duplicate %s',
    async (operation) => {
      const change = prepareChange('update');
      change.start();
      const pendingRoom = change.state.rooms()[0];
      if (operation === 'delete') await change.actions.delete(pendingRoom, false, '5m');
      else await change.actions[operation](pendingRoom);
      expect(change.state.rooms()[0]).toBe(pendingRoom);
      change.resolveCommand();
      await vi.waitFor(() => expect(change.actions.pendingOperation('demo')).toBe(''));
    },
  );
});

describe('room task desktop notifications', () => {
  let state: PlayroomStateService;
  let actions: PlayroomLifecycleService;
  let finished: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [MessageService] });
    state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('ph');
    actions = TestBed.inject(PlayroomLifecycleService);
    finished = vi.spyOn(TestBed.inject(DesktopNotificationsService), 'roomFinished');
    vi.spyOn(TestBed.inject(CliConsoleService), 'run').mockImplementation(async (_title, run) =>
      run('op'),
    );
    vi.spyOn(wailsApi, 'listPlayrooms').mockResolvedValue([{ Name: 'demo', Status: 'Starting' }]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });
  const demo = () => listingToRoom({ Name: 'demo', Status: 'Stopped' }, 'ph');

  it('waits for a start to settle and only notifies once', async () => {
    vi.spyOn(wailsApi, 'startPlayroom').mockResolvedValue();
    await actions.start(demo());
    expect(finished).not.toHaveBeenCalled();
    vi.mocked(wailsApi.listPlayrooms).mockResolvedValue([{ Name: 'demo', Status: 'Ready' }]);
    await actions.reload('ph');
    await actions.reload('ph');
    expect(finished).toHaveBeenCalledExactlyOnceWith(
      'start',
      'demo',
      state.captureSelection(),
      false,
    );
  });

  it('reports a polled failure and ignores unrelated room transitions', async () => {
    vi.spyOn(wailsApi, 'startPlayroom').mockResolvedValue();
    await actions.start(demo());
    vi.mocked(wailsApi.listPlayrooms).mockResolvedValue([
      { Name: 'demo', Status: 'Failed' },
      { Name: 'other', Status: 'Ready' },
    ]);
    await actions.reload('ph');
    expect(finished).toHaveBeenCalledExactlyOnceWith(
      'start',
      'demo',
      state.captureSelection(),
      true,
    );
  });

  it('does not notify for polled rooms without a task started here', async () => {
    vi.mocked(wailsApi.listPlayrooms).mockResolvedValue([{ Name: 'demo', Status: 'Ready' }]);
    await actions.reload('ph');
    expect(finished).not.toHaveBeenCalled();
  });

  it('waits for a no-wait creation to become ready', async () => {
    vi.spyOn(wailsApi, 'createPlayroom').mockResolvedValue();
    const form = blankCreateForm('ph');
    form.name = 'demo';
    form.noWait = true;
    actions.startCreate(form);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(finished).not.toHaveBeenCalled();
    vi.mocked(wailsApi.listPlayrooms).mockResolvedValue([{ Name: 'demo', Status: 'Ready' }]);
    await actions.reload('ph');
    expect(finished).toHaveBeenCalledExactlyOnceWith(
      'create',
      'demo',
      state.captureSelection(),
      false,
    );
  });

  it('remembers the git repositories of a created room, and none of a failed one', async () => {
    const create = vi.spyOn(wailsApi, 'createPlayroom').mockRejectedValueOnce(new Error('no'));
    const form = blankCreateForm('ph');
    form.name = 'demo';
    form.git = ['https://github.com/team/failed.git'];
    actions.startCreate(form);
    await vi.waitFor(() => expect(actions.pendingOperation('demo')).toBe(''));
    expect(readCache().recentGitRepositories).toEqual([]);
    create.mockResolvedValue();
    form.git = ['https://github.com/team/api.git@main'];
    actions.startCreate(form);
    await vi.waitFor(() => expect(actions.pendingOperation('demo')).toBe(''));
    expect(readCache().recentGitRepositories).toEqual(['https://github.com/team/api.git']);
  });

  it('waits for a no-wait deletion to disappear', async () => {
    vi.spyOn(wailsApi, 'deletePlayroom').mockResolvedValue();
    await actions.delete(demo(), true, '5m');
    expect(finished).not.toHaveBeenCalled();
    vi.mocked(wailsApi.listPlayrooms).mockResolvedValue([]);
    await actions.reload('ph');
    expect(finished).toHaveBeenCalledExactlyOnceWith(
      'delete',
      'demo',
      state.captureSelection(),
      false,
    );
  });

  it('does not mistake an existing failed room for a failed no-wait deletion', async () => {
    vi.spyOn(wailsApi, 'deletePlayroom').mockResolvedValue();
    vi.mocked(wailsApi.listPlayrooms).mockResolvedValue([{ Name: 'demo', Status: 'Failed' }]);
    await actions.delete(demo(), true, '5m');
    expect(finished).not.toHaveBeenCalled();
    vi.mocked(wailsApi.listPlayrooms).mockResolvedValue([]);
    await actions.reload('ph');
    expect(finished).toHaveBeenCalledExactlyOnceWith(
      'delete',
      'demo',
      state.captureSelection(),
      false,
    );
  });

  it('does not claim no-wait deletion finished if the selection changed during the command', async () => {
    vi.spyOn(wailsApi, 'deletePlayroom').mockImplementation(async () => {
      state.selectPlayhouse('other');
    });
    await actions.delete(demo(), true, '5m');
    expect(finished).not.toHaveBeenCalled();
  });

  it('replaces a pending start watch when a stop is submitted', async () => {
    vi.spyOn(wailsApi, 'startPlayroom').mockResolvedValue();
    vi.spyOn(wailsApi, 'stopPlayroom').mockResolvedValue();
    await actions.start(demo());
    await actions.stop(demo());
    vi.mocked(wailsApi.listPlayrooms).mockResolvedValue([{ Name: 'demo', Status: 'Ready' }]);
    await actions.reload('ph');
    expect(finished).toHaveBeenCalledExactlyOnceWith('stop', 'demo', state.captureSelection());
  });

  it('discards pending settlements after a scope change', async () => {
    vi.spyOn(wailsApi, 'startPlayroom').mockResolvedValue();
    await actions.start(demo());
    state.noteScopeChange();
    vi.mocked(wailsApi.listPlayrooms).mockResolvedValue([{ Name: 'demo', Status: 'Ready' }]);
    await actions.reload('ph');
    expect(finished).not.toHaveBeenCalled();
  });

  it('reports command failures without a second notification from the poll', async () => {
    vi.spyOn(wailsApi, 'startPlayroom').mockRejectedValue(new Error('failed'));
    await actions.start(demo());
    vi.mocked(wailsApi.listPlayrooms).mockResolvedValue([{ Name: 'demo', Status: 'Failed' }]);
    await actions.reload('ph');
    expect(finished).toHaveBeenCalledExactlyOnceWith(
      'start',
      'demo',
      state.captureSelection(),
      true,
    );
  });

  it('reports a completed stop with its original selection after navigation', async () => {
    const selection = state.captureSelection();
    vi.spyOn(wailsApi, 'stopPlayroom').mockImplementation(async () => {
      state.selectPlayhouse('other');
    });
    await actions.stop(demo());
    expect(finished).toHaveBeenCalledExactlyOnceWith('stop', 'demo', selection);
  });
});

describe('nextRefreshDelay', () => {
  const visible = { windowVisible: true, roomChanging: false, failedReadsInARow: 0 };

  it('reads every minute, and every ten seconds while a room changes state', () => {
    expect(nextRefreshDelay(visible)).toBe(60_000);
    expect(nextRefreshDelay({ ...visible, roomChanging: true })).toBe(10_000);
  });

  it('pauses while the window is hidden', () => {
    expect(nextRefreshDelay({ ...visible, windowVisible: false })).toBeNull();
    expect(
      nextRefreshDelay({ windowVisible: false, roomChanging: true, failedReadsInARow: 2 }),
    ).toBeNull();
  });

  it('backs off after failures, also while a room changes, and stays at five minutes', () => {
    for (const roomChanging of [false, true]) {
      const after = (failedReadsInARow: number) =>
        nextRefreshDelay({ windowVisible: true, roomChanging, failedReadsInARow });
      expect([after(1), after(2), after(3), after(4), after(10)]).toEqual([
        60_000, 120_000, 300_000, 300_000, 300_000,
      ]);
    }
  });
});

describe('background refresh of the room list', () => {
  let actions: PlayroomLifecycleService;
  let listPlayrooms: ReturnType<typeof vi.spyOn>;
  let failure: ReturnType<typeof vi.spyOn>;
  let visibility: DocumentVisibilityState;

  async function advance(milliseconds: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(milliseconds);
    TestBed.tick();
  }

  async function setWindowVisibility(state: DocumentVisibilityState): Promise<void> {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
    await advance(0);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    TestBed.configureTestingModule({ providers: [MessageService] });
    TestBed.inject(PlayroomStateService).selectPlayhouse('ph');
    actions = TestBed.inject(PlayroomLifecycleService);
    failure = vi.spyOn(TestBed.inject(ToastService), 'failure');
    listPlayrooms = vi
      .spyOn(wailsApi, 'listPlayrooms')
      .mockResolvedValue([{ Name: 'demo', Status: 'Ready' }]);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  async function firstRead(): Promise<void> {
    await actions.reload('ph');
    await advance(0);
    listPlayrooms.mockClear();
  }

  it('does not poll before a screen has read the list', async () => {
    TestBed.tick();
    await advance(5 * 60_000);
    expect(listPlayrooms).not.toHaveBeenCalled();
  });

  it('reads every minute, and every ten seconds while a room changes state', async () => {
    await firstRead();
    await advance(59_000);
    expect(listPlayrooms).not.toHaveBeenCalled();
    await advance(1_000);
    expect(listPlayrooms).toHaveBeenCalledTimes(1);

    listPlayrooms.mockResolvedValue([{ Name: 'demo', Status: 'Starting' }]);
    await advance(60_000);
    expect(listPlayrooms).toHaveBeenCalledTimes(2);
    await advance(10_000);
    expect(listPlayrooms).toHaveBeenCalledTimes(3);
  });

  it('does not push the next read back when rooms are edited locally', async () => {
    await firstRead();
    const state = TestBed.inject(PlayroomStateService);
    for (let second = 0; second < 60; second += 20) {
      state.setRooms(state.rooms().map((room) => ({ ...room, ageMin: room.ageMin + 1 })));
      await advance(20_000);
    }
    expect(listPlayrooms).toHaveBeenCalledTimes(1);
  });

  it('pauses while the window is hidden and reads once when it is shown again', async () => {
    await firstRead();
    await setWindowVisibility('hidden');
    await advance(10 * 60_000);
    expect(listPlayrooms).not.toHaveBeenCalled();

    await setWindowVisibility('visible');
    expect(listPlayrooms).toHaveBeenCalledTimes(1);
    await advance(59_000);
    expect(listPlayrooms).toHaveBeenCalledTimes(1);
    await advance(1_000);
    expect(listPlayrooms).toHaveBeenCalledTimes(2);
  });

  it('drops a poll while another read is still running', async () => {
    await firstRead();
    let landRead = () => {};
    listPlayrooms.mockReturnValueOnce(
      new Promise((resolve) => (landRead = () => resolve([{ Name: 'demo', Status: 'Ready' }]))),
    );
    const userRead = actions.reload('ph');
    await advance(60_000);
    expect(listPlayrooms).toHaveBeenCalledTimes(1);
    landRead();
    await userRead;
    await advance(60_000);
    expect(listPlayrooms).toHaveBeenCalledTimes(2);
  });

  it('backs off after failed reads and shows the error once', async () => {
    await firstRead();
    listPlayrooms.mockRejectedValue(new Error('Session expired'));
    await advance(60_000);
    expect(listPlayrooms).toHaveBeenCalledTimes(1);
    expect(failure).toHaveBeenCalledOnce();
    expect(actions.loadError()).toContain('Session expired');

    await advance(59_000);
    expect(listPlayrooms).toHaveBeenCalledTimes(1);
    await advance(1_000);
    expect(listPlayrooms).toHaveBeenCalledTimes(2);
    await advance(120_000);
    expect(listPlayrooms).toHaveBeenCalledTimes(3);
    await advance(299_000);
    expect(listPlayrooms).toHaveBeenCalledTimes(3);
    await advance(1_000);
    expect(listPlayrooms).toHaveBeenCalledTimes(4);
    expect(failure).toHaveBeenCalledOnce();

    listPlayrooms.mockResolvedValue([]);
    await advance(300_000);
    expect(listPlayrooms).toHaveBeenCalledTimes(5);
    expect(actions.loadError()).toBe('');
    await advance(60_000);
    expect(listPlayrooms).toHaveBeenCalledTimes(6);
  });

  it('stops polling the old selection when the playhouse changes', async () => {
    await firstRead();
    TestBed.inject(PlayroomStateService).selectPlayhouse('other');
    await advance(5 * 60_000);
    expect(listPlayrooms).not.toHaveBeenCalled();
  });
});

describe('Bulk playroom commands', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [MessageService] });
    const state = TestBed.inject(PlayroomStateService);
    state.selectPlayhouse('ph');
    state.setUser('developer@example.test');
    TestBed.inject(PlayroomLifecycleService);
    TestBed.tick();
  });
  afterEach(() => vi.restoreAllMocks());

  function ownedRooms() {
    return ['alpha', 'beta', 'gamma'].map((name) =>
      listingToRoom(
        {
          Name: name,
          Owner: 'developer@example.test',
          Status: 'Stopped',
        },
        'ph',
      ),
    );
  }

  it('runs sequentially, records every command, continues after failure and publishes a summary', async () => {
    const state = TestBed.inject(PlayroomStateService);
    const actions = TestBed.inject(PlayroomLifecycleService);
    state.setRooms(ownedRooms());
    vi.spyOn(wailsApi, 'listPlayrooms').mockResolvedValue(
      ownedRooms().map((room) => ({ Name: room.name, Owner: room.owner, Status: 'Stopped' })),
    );
    let resolveFirst = () => {};
    const command = vi
      .spyOn(wailsApi, 'startPlayroom')
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error('Could not start beta'))
      .mockResolvedValue(undefined);
    const consoleRun = vi.spyOn(TestBed.inject(CliConsoleService), 'run');
    const progress = vi.fn();
    const pending = actions.runForEach(['alpha', 'beta', 'gamma', 'alpha'], 'start', progress);
    expect(command).toHaveBeenCalledTimes(1);
    expect(progress.mock.calls.at(-1)?.[0][0].status).toBe('running');
    resolveFirst();
    const results = await pending;
    expect(results.map((result) => result.status)).toEqual(['succeeded', 'failed', 'succeeded']);
    expect(command).toHaveBeenCalledTimes(3);
    expect(consoleRun).toHaveBeenCalledTimes(3);
    expect(progress.mock.calls.at(-1)?.[0]).toEqual(results);
  });

  it.each(['start', 'stop', 'update', 'delete'] as const)(
    'suppresses bulk %s progress and success toasts while retaining failures',
    async (operation) => {
      const state = TestBed.inject(PlayroomStateService);
      const actions = TestBed.inject(PlayroomLifecycleService);
      const rooms = ownedRooms();
      if (operation === 'stop')
        rooms.forEach((room) => {
          room.status = 'ready';
        });
      if (operation === 'update')
        rooms.forEach((room) => {
          room.outdated = true;
        });
      state.setRooms(rooms);
      vi.spyOn(wailsApi, 'listPlayrooms').mockResolvedValue(
        rooms.map((room) => ({
          Name: room.name,
          Owner: room.owner,
          Status: operation === 'stop' ? 'Ready' : 'Stopped',
          Outdated: room.outdated,
        })),
      );
      const command =
        operation === 'start'
          ? 'startPlayroom'
          : operation === 'stop'
            ? 'stopPlayroom'
            : operation === 'update'
              ? 'updatePlayroom'
              : 'deletePlayroom';
      vi.spyOn(wailsApi, command)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Command failed'));
      const notify = TestBed.inject(ToastService);
      const toast = vi.spyOn(notify, 'toast');
      const failure = vi.spyOn(notify, 'failure').mockImplementation(() => undefined);
      const results = await actions.runForEach(['alpha', 'beta'], operation);
      expect(results.map((result) => result.status)).toEqual(['succeeded', 'failed']);
      expect(toast).not.toHaveBeenCalled();
      expect(failure).toHaveBeenCalledOnce();
    },
  );

  it('refuses unknown owners, other owners, missing rooms, busy rooms and inapplicable actions', async () => {
    const state = TestBed.inject(PlayroomStateService);
    const actions = TestBed.inject(PlayroomLifecycleService);
    const rooms = ownedRooms();
    rooms[0].owner = '';
    rooms[1].owner = 'other@example.test';
    rooms[2].status = 'ready';
    state.setRooms(rooms);
    const start = vi.spyOn(actions, 'start');
    const results = await actions.runForEach(['alpha', 'beta', 'gamma', 'missing'], 'start');
    expect(results.every((result) => result.status === 'skipped' && !!result.reason)).toBe(true);
    expect(start).not.toHaveBeenCalled();
    state.setRooms(ownedRooms());
    vi.spyOn(actions, 'pendingOperation').mockReturnValue('Updating');
    expect((await actions.runForEach(['alpha'], 'delete'))[0].status).toBe('skipped');
  });

  it('rechecks ownership and stops submitting after the scope changes', async () => {
    const state = TestBed.inject(PlayroomStateService);
    const actions = TestBed.inject(PlayroomLifecycleService);
    state.setRooms(ownedRooms());
    const start = vi.spyOn(actions, 'start').mockImplementation(async () => {
      state.setRooms(
        state
          .rooms()
          .map((room) => (room.name === 'beta' ? { ...room, owner: 'other@example.test' } : room)),
      );
      return true;
    });
    expect(
      (await actions.runForEach(['alpha', 'beta'], 'start')).map((result) => result.status),
    ).toEqual(['succeeded', 'skipped']);
    start.mockImplementation(async () => {
      state.selectPlayhouse('another');
      return true;
    });
    const results = await actions.runForEach(['alpha', 'gamma'], 'start');
    expect(results.map((result) => result.status)).toEqual(['succeeded', 'skipped']);
    expect(results[1].reason).toBe('The selection changed');
  });

  it('updates only outdated persistent rooms and deletes without force', async () => {
    const state = TestBed.inject(PlayroomStateService);
    const actions = TestBed.inject(PlayroomLifecycleService);
    const rooms = ownedRooms();
    rooms[0].outdated = true;
    rooms[1].outdated = true;
    rooms[1].ephemeral = true;
    state.setRooms(rooms);
    const update = vi.spyOn(actions, 'updateOutdated').mockResolvedValue(true);
    const results = await actions.runForEach(['alpha', 'beta', 'gamma'], 'update');
    expect(results.map((result) => result.status)).toEqual(['succeeded', 'skipped', 'skipped']);
    expect(update).toHaveBeenCalledExactlyOnceWith(rooms[0], false, 'bulk');
    const remove = vi.spyOn(actions, 'delete').mockResolvedValue(true);
    await actions.runForEach(['alpha'], 'delete');
    expect(remove).toHaveBeenCalledExactlyOnceWith(rooms[0], false, '5m', false, false, 'bulk');
    const stop = vi.spyOn(actions, 'stop').mockResolvedValue(true);
    rooms[0].status = 'ready';
    await actions.runForEach(['alpha', 'gamma'], 'stop');
    expect(stop).toHaveBeenCalledExactlyOnceWith(rooms[0], false, 'bulk');
  });
});
