import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { CreateForm, Playroom, UpdateForm } from '../../shared/models';
import { isTransitional, listingToRoom, readCache, updateCache } from '../../shared/utils';
import { CliConsoleService } from './cli-console';
import { ToastService } from './toast';
import { PlayroomSelection, PlayroomStateService } from './playroom-state';
import { PlayroomCreateInput, PlayroomUpdateInput, wailsApi } from './wails-api';
import { UiSessionService } from './ui-session';

/**
 * Playroom create, start, stop, update and delete, with optimistic patching and
 * toasts around them. All of it against the shared PlayroomStateService list.
 */
@Injectable({ providedIn: 'root' })
export class PlayroomLifecycleService {
  private readonly state = inject(PlayroomStateService);
  private readonly notify = inject(ToastService);
  private readonly console = inject(CliConsoleService);
  private readonly session = inject(UiSessionService);
  readonly loadError = signal('');
  private readSequence = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor() {
    effect(() => {
      const selection = this.state.captureSelection();
      const transitional = this.state
        .rooms()
        .some((room) => room.playhouse === selection.playhouse && isTransitional(room.status));
      untracked(() => {
        if (this.pollTimer) clearTimeout(this.pollTimer);
        this.pollTimer = null;
        if (selection.playhouse && transitional) this.schedulePoll(selection);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      if (this.pollTimer) clearTimeout(this.pollTimer);
    });
  }

  private schedulePoll(selection: PlayroomSelection): void {
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      if (!this.state.isCurrentSelection(selection) || this.destroyed) return;
      void this.reload(selection.playhouse, selection).catch(() => {
        if (this.state.isCurrentSelection(selection) && !this.destroyed)
          this.schedulePoll(selection);
      });
    }, 10_000);
  }

  private readonly pending = signal<Record<string, string>>({});

  pendingOperation(name: string): string {
    return this.pending()[`${this.state.scopeRevision()}:${this.state.playhouse()}:${name}`] ?? '';
  }

  private beginOperation(name: string, playhouse: string, label: string): (() => void) | null {
    const key = `${this.state.scopeRevision()}:${playhouse}:${name}`;
    if (this.pending()[key]) return null;
    this.pending.update((operations) => ({ ...operations, [key]: label }));
    return () =>
      this.pending.update((operations) => {
        const next = { ...operations };
        delete next[key];
        return next;
      });
  }

  /** Optimistically patch a single room in the shared list. */
  patch(name: string, fields: Partial<Playroom>, playhouse = this.state.playhouse()): void {
    this.state.setRooms(
      this.state
        .rooms()
        .map((room) =>
          room.name === name && room.playhouse === playhouse ? { ...room, ...fields } : room,
        ),
    );
  }

  /** Remove a room from the shared list. */
  remove(name: string, playhouse: string): void {
    this.state.setRooms(
      this.state.rooms().filter((room) => room.name !== name || room.playhouse !== playhouse),
    );
    this.state.setRoomsCount(this.state.rooms().length);
  }

  /**
   * Fetches the playroom list for a playhouse into shared state. Not logged: it
   * is polled, and would bury the commands worth reading.
   */
  async reload(playhouse: string, selection = this.state.captureSelection()): Promise<Playroom[]> {
    if (
      !playhouse ||
      playhouse !== selection.playhouse ||
      !this.state.isCurrentSelection(selection)
    )
      return [];
    const sequence = ++this.readSequence;
    try {
      const listings = await wailsApi.listPlayrooms({ Playhouse: playhouse });
      const rooms = listings.map((listing) => listingToRoom(listing, playhouse));
      if (sequence === this.readSequence && this.state.isCurrentSelection(selection)) {
        this.state.setRooms(rooms);
        this.state.setRoomsCount(rooms.length);
        this.state.markRoomsLoaded(playhouse);
        this.loadError.set('');
      }
      return rooms;
    } catch (error) {
      if (sequence === this.readSequence && this.state.isCurrentSelection(selection))
        this.loadError.set(String(error));
      throw error;
    }
  }

  private async reloadAfterMutation(selection: PlayroomSelection): Promise<void> {
    if (!this.state.isCurrentSelection(selection)) return;
    try {
      await this.reload(selection.playhouse, selection);
    } catch (error) {
      this.notify.failure('Could not refresh the playrooms', error);
    }
  }

  startCreate(form: CreateForm): boolean {
    const selection = this.state.captureSelection();
    if (form.playhouse !== selection.playhouse) return false;
    const finish = this.beginOperation(form.name, form.playhouse, 'Creating');
    if (!finish) return false;
    const submittedForm = structuredClone(form);
    const submittedRevision = this.session.draftRevision('create');
    void this.create(submittedForm, selection, submittedRevision, finish);
    return true;
  }

  private async create(
    form: CreateForm,
    selection: PlayroomSelection,
    submittedRevision: number | undefined,
    finish: () => void,
  ): Promise<void> {
    const optimistic: Playroom = {
      name: form.name,
      owner: this.state.user(),
      status: 'creating',
      rawStatus: '',
      host: '',
      ageMin: 0,
      disk: form.storage,
      diskType: form.ephemeral ? 'ephemeral' : 'persistent',
      image: form.image,
      cpuReq: form.cpuReq,
      cpuLim: form.cpuLim,
      memReq: form.memReq,
      memLim: form.memLim,
      ports: form.ports.filter(Boolean).join(', '),
      system: form.readOnly ? 'read-only' : 'writable',
      capabilityProfile: form.capabilities,
      capabilityAdditions: form.capAdd.filter(Boolean),
      outdated: false,
      playhouse: form.playhouse,
      ephemeral: form.ephemeral,
      env: [],
      git: [],
      copy: [],
    };
    this.state.setRooms([
      optimistic,
      ...this.state.rooms().filter((room) => room.name !== form.name),
    ]);
    this.state.setRoomsCount(this.state.rooms().length);
    let startedOperationId = '';
    try {
      await this.console.run(`Creating "${form.name}"`, (operationId) => {
        startedOperationId = operationId;
        this.notify.toast(`Creating "${form.name}" ...`, 'busy', operationId);
        return wailsApi.createPlayroom(operationId, createInputFor(form));
      });
      this.notify.toast(`Created "${form.name}"`, 'ok', startedOperationId);
      if (this.state.isCurrentSelection(selection)) {
        updateCache({ lastPlayroom: form.name, lastPlayhouse: form.playhouse });
        this.session.forgetSubmittedDraft('create', submittedRevision);
      }
    } catch (error) {
      this.notify.failure(`Could not create "${form.name}"`, error, startedOperationId);
    } finally {
      // A wait can fail after creation, so the CLI list decides what exists.
      await this.reloadAfterMutation(selection);
      finish();
    }
  }

  async stop(room: Playroom): Promise<void> {
    const selection = this.state.captureSelection();
    const finish = this.beginOperation(room.name, room.playhouse, 'Stopping');
    if (!finish) return;
    this.patch(room.name, { status: 'stopped', host: '', rawStatus: '' }, room.playhouse);
    let startedOperationId = '';
    try {
      await this.console.run(`Stopping "${room.name}"`, (operationId) => {
        startedOperationId = operationId;
        return wailsApi.stopPlayroom(operationId, { Name: room.name, Playhouse: room.playhouse });
      });
      this.notify.toast(`Stopped "${room.name}" (storage retained)`, 'idle', startedOperationId);
    } catch (error) {
      this.notify.failure(`Could not stop "${room.name}"`, error, startedOperationId);
    } finally {
      await this.reloadAfterMutation(selection);
      finish();
    }
  }

  async start(room: Playroom): Promise<void> {
    const selection = this.state.captureSelection();
    const finish = this.beginOperation(room.name, room.playhouse, 'Starting');
    if (!finish) return;
    this.patch(room.name, { status: 'starting', host: '', rawStatus: '' }, room.playhouse);
    let startedOperationId = '';
    try {
      await this.console.run(`Starting "${room.name}"`, (operationId) => {
        startedOperationId = operationId;
        this.notify.toast(`Starting "${room.name}" ...`, 'busy', operationId);
        // --no-wait keeps the call short; the list polls until the room is ready.
        return wailsApi.startPlayroom(operationId, {
          Name: room.name,
          Playhouse: room.playhouse,
          NoWait: true,
        });
      });
    } catch (error) {
      this.notify.failure(`Could not start "${room.name}"`, error, startedOperationId);
    } finally {
      await this.reloadAfterMutation(selection);
      finish();
    }
  }

  startUpdate(form: UpdateForm): boolean {
    const selection = this.state.captureSelection();
    if (form.playhouse !== selection.playhouse) return false;
    const finish = this.beginOperation(form.name, form.playhouse, 'Updating');
    if (!finish) return false;
    const submittedForm = structuredClone(form);
    const submittedRevision = this.session.draftRevision('update:' + form.name);
    void this.update(submittedForm, selection, submittedRevision, finish);
    return true;
  }

  private async update(
    form: UpdateForm,
    selection: PlayroomSelection,
    submittedRevision: number | undefined,
    finish: () => void,
  ): Promise<void> {
    this.patch(form.name, { status: 'starting' }, form.playhouse);
    let startedOperationId = '';
    try {
      await this.console.run(`Updating "${form.name}"`, (operationId) => {
        startedOperationId = operationId;
        this.notify.toast(`Updating "${form.name}" ...`, 'busy', operationId);
        return wailsApi.updatePlayroom(operationId, updateInputFor(form));
      });
      this.notify.toast(`Updated "${form.name}"`, 'ok', startedOperationId);
      if (this.state.isCurrentSelection(selection))
        this.session.forgetSubmittedDraft('update:' + form.name, submittedRevision);
    } catch (error) {
      this.notify.failure(`Could not update "${form.name}"`, error, startedOperationId);
    } finally {
      await this.reloadAfterMutation(selection);
      finish();
    }
  }

  /**
   * Delete a playroom. Returns true on success so the caller can navigate or
   * update caches; on failure it reloads the list and returns false.
   */
  async delete(
    room: Playroom,
    noWait: boolean,
    waitTimeout: string,
    force = false,
  ): Promise<boolean> {
    const selection = this.state.captureSelection();
    const finish = this.beginOperation(room.name, room.playhouse, 'Deleting');
    if (!finish) return false;
    this.patch(room.name, { status: 'deleting' }, room.playhouse);
    let startedOperationId = '';
    try {
      await this.console.run(`Deleting "${room.name}"`, (operationId) => {
        startedOperationId = operationId;
        this.notify.toast(`Deleting "${room.name}" ...`, 'busy', operationId);
        return wailsApi.deletePlayroom(operationId, {
          Name: room.name,
          Playhouse: room.playhouse,
          NoWait: noWait,
          Force: force,
          WaitTimeout: waitTimeout,
        });
      });
      if (this.state.isCurrentSelection(selection)) this.remove(room.name, room.playhouse);
      this.notify.toast(`Deleted "${room.name}"`, 'ok', startedOperationId);
      return true;
    } catch (error) {
      this.notify.failure(`Could not delete "${room.name}"`, error, startedOperationId);
      await this.reloadAfterMutation(selection);
      return false;
    } finally {
      finish();
    }
  }
}

// The preview and execution share this mapping so they cannot send different flags.
export function createInputFor(form: CreateForm): Partial<PlayroomCreateInput> {
  return {
    Name: form.name,
    Playhouse: form.playhouse,
    Image: form.image,
    Storage: form.storage,
    CPURequest: form.cpuReq,
    CPULimit: form.cpuLim,
    MemoryRequest: form.memReq,
    MemoryLimit: form.memLim,
    SSHKey: form.sshKey,
    EnvVars: form.env.filter(Boolean),
    GitRepos: form.git.filter(Boolean),
    Copies: form.copy.filter(Boolean),
    Ports: form.ports.filter(Boolean),
    ProxyGroup: form.proxyGroup,
    Exposure: form.exposure,
    // NodePort rooms already expose SSH on a NodePort.
    NodePortSSH: form.nodePortSSH && form.exposure !== 'nodeport',
    Capabilities: form.capabilities,
    CapAdd: form.capAdd.filter(Boolean),
    Ephemeral: form.ephemeral,
    ReadOnly: form.readOnly,
    Privileged: form.privileged && form.acknowledgePrivileged,
    WorkspaceNamespace: form.workspaceNamespace,
    NoWait: form.noWait,
    WaitTimeout: form.waitTimeout,
    ForceInstall: form.forceInstall,
  };
}

/**
 * Translates the update form into the backend input. Empty strings keep the
 * playroom's current value, so nothing is defaulted here.
 */
export function updateInputFor(form: UpdateForm): Partial<PlayroomUpdateInput> {
  return {
    Name: form.name,
    Playhouse: form.playhouse,
    Image: form.image,
    CPURequest: form.cpuReq,
    CPULimit: form.cpuLim,
    MemoryRequest: form.memReq,
    MemoryLimit: form.memLim,
    Storage: form.storage,
    Capabilities: form.capabilities,
    ChangeReadOnly: form.changeReadOnly,
    ReadOnly: form.readOnly,
    ChangePorts: form.changePorts,
    Ports: form.clearPorts ? [] : form.ports.filter(Boolean),
    ChangeCapAdd: form.changeCapAdd,
    CapAdd: form.clearCapAdd ? [] : form.capAdd.filter(Boolean),
    ChangeWorkspaceNamespace: form.changeWorkspaceNamespace,
    WorkspaceNamespace: form.workspaceNamespace,
    ChangeNodePortSSH: form.changeNodePortSSH,
    NodePortSSH: form.nodePortSSH,
    // tailscale is the only target the command accepts; empty keeps the current.
    Exposure: form.moveToTailscale ? 'tailscale' : '',
    NoWait: form.noWait,
    WaitTimeout: form.waitTimeout,
  };
}

/** The terminal the user last connected with, used for terminal hand-offs. */
export function preferredTerminal(): string {
  return readCache().lastTerminal ?? '';
}
