import { TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';
import { PlayroomLifecycleService, updateInputFor } from './playroom-lifecycle';
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
