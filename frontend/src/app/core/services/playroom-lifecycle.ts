import { DesktopNotificationsService, RoomTask } from './desktop-notifications';
import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { CreateForm, Playroom, UpdateForm } from '../../shared/models';
import {
  describeError,
  isTransitional,
  listingToRoom,
  readCache,
  updateCache,
} from '../../shared/utils';
import { CliConsoleService } from './cli-console';
import { ToastService } from './toast';
import { PlayroomSelection, PlayroomStateService } from './playroom-state';
import { PlayroomCreateInput, PlayroomUpdateInput, wailsApi } from './wails-api';
import { CommandFixService, FailureAction } from './command-fix';
import { UiSessionService } from './ui-session';

export const REFRESH_DELAY_WHILE_A_ROOM_CHANGES_MS = 10_000;
export const REFRESH_DELAY_MS = 60_000;
/** The waits after the first, second and third failed read in a row; later ones keep the last. */
export const REFRESH_BACK_OFF_MS = [60_000, 120_000, 300_000] as const;

export interface RefreshConditions {
  windowVisible: boolean;
  roomChanging: boolean;
  failedReadsInARow: number;
}

/** Milliseconds until the room list reads itself again, or null while the window is hidden. */
export function nextRefreshDelay(conditions: RefreshConditions): number | null {
  if (!conditions.windowVisible) return null;
  if (conditions.failedReadsInARow > 0)
    return REFRESH_BACK_OFF_MS[
      Math.min(conditions.failedReadsInARow, REFRESH_BACK_OFF_MS.length) - 1
    ];
  return conditions.roomChanging ? REFRESH_DELAY_WHILE_A_ROOM_CHANGES_MS : REFRESH_DELAY_MS;
}

interface LandedRead {
  selection: PlayroomSelection;
  failedReadsInARow: number;
}

/**
 * Playroom create, start, stop, update and delete, with optimistic patching and
 * toasts around them. All of it against the shared PlayroomStateService list.
 */
@Injectable({ providedIn: 'root' })
export class PlayroomLifecycleService {
  private readonly desktop = inject(DesktopNotificationsService);
  private readonly settlements = new Map<
    string,
    { task: RoomTask; selection: PlayroomSelection }
  >();
  private readonly state = inject(PlayroomStateService);
  private readonly notify = inject(ToastService);
  private readonly console = inject(CliConsoleService);
  private readonly session = inject(UiSessionService);
  readonly loadError = signal('');
  readonly loadFix = signal<FailureAction | undefined>(undefined);
  private readonly fixes = inject(CommandFixService);
  private readSequence = 0;
  private readsInFlight = 0;
  private readonly lastRead = signal<LandedRead | null>(null);
  private readonly windowVisible = signal(document.visibilityState === 'visible');
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduledPoll: { lastRead: LandedRead; delay: number } | null = null;
  private destroyed = false;

  constructor() {
    effect(() => {
      const selection = this.state.captureSelection();
      const roomChanging = this.state
        .rooms()
        .some((room) => room.playhouse === selection.playhouse && isTransitional(room.status));
      const lastRead = this.lastRead();
      const windowVisible = this.windowVisible();
      untracked(() => {
        for (const [name, tracked] of this.settlements) {
          if (!this.state.isCurrentSelection(tracked.selection)) this.settlements.delete(name);
        }
        // Polling starts with the first read a screen makes for this selection.
        const delay =
          selection.playhouse && lastRead && this.state.isCurrentSelection(lastRead.selection)
            ? nextRefreshDelay({
                windowVisible,
                roomChanging: roomChanging || this.settlements.size > 0,
                failedReadsInARow: lastRead.failedReadsInARow,
              })
            : null;
        // Other room edits (ages, patches) must not keep pushing the next read back.
        if (
          this.pollTimer &&
          this.scheduledPoll?.lastRead === lastRead &&
          this.scheduledPoll.delay === delay
        )
          return;
        this.cancelPoll();
        if (delay === null || !lastRead) return;
        this.scheduledPoll = { lastRead, delay };
        this.pollTimer = setTimeout(() => {
          this.pollTimer = null;
          this.scheduledPoll = null;
          this.refreshInTheBackground(selection);
        }, delay);
      });
    });
    const refreshWhenTheWindowIsShownAgain = () => {
      const wasVisible = this.windowVisible();
      this.windowVisible.set(document.visibilityState === 'visible');
      if (this.windowVisible() && !wasVisible)
        this.refreshInTheBackground(this.state.captureSelection());
    };
    document.addEventListener('visibilitychange', refreshWhenTheWindowIsShownAgain);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.cancelPoll();
      document.removeEventListener('visibilitychange', refreshWhenTheWindowIsShownAgain);
    });
  }

  private cancelPoll(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    this.scheduledPoll = null;
  }

  /** One poll: dropped while another read runs, and only a first failure in a row is shown. */
  private refreshInTheBackground(selection: PlayroomSelection): void {
    const lastRead = this.lastRead();
    if (
      this.destroyed ||
      this.readsInFlight > 0 ||
      !this.windowVisible() ||
      !lastRead ||
      !this.state.isCurrentSelection(selection) ||
      !this.state.isCurrentSelection(lastRead.selection)
    )
      return;
    const firstFailureInARow = lastRead.failedReadsInARow === 0;
    void this.reload(selection.playhouse, selection).catch((error) => {
      if (firstFailureInARow && this.state.isCurrentSelection(selection) && !this.destroyed)
        this.notify.failure('Could not refresh the playrooms', error, '', this.loadFix());
    });
  }

  private readonly pending = signal<Record<string, string>>({});

  pendingOperation(name: string): string {
    return this.pending()[`${this.state.scopeRevision()}:${this.state.playhouse()}:${name}`] ?? '';
  }

  private beginOperation(name: string, playhouse: string, label: string): (() => void) | null {
    const key = `${this.state.scopeRevision()}:${playhouse}:${name}`;
    if (this.pending()[key]) return null;
    this.settlements.delete(name);
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
  async reload(
    playhouse: string,
    selection = this.state.captureSelection(),
    forceInstall = false,
  ): Promise<Playroom[]> {
    if (
      !playhouse ||
      playhouse !== selection.playhouse ||
      !this.state.isCurrentSelection(selection)
    )
      return [];
    const sequence = ++this.readSequence;
    this.readsInFlight++;
    try {
      const listings = await wailsApi.listPlayrooms({
        Playhouse: playhouse,
        ...(forceInstall ? { ForceInstall: true } : {}),
      });
      const rooms = listings.map((listing) => listingToRoom(listing, playhouse));
      if (sequence === this.readSequence && this.state.isCurrentSelection(selection)) {
        for (const [name, tracked] of this.settlements) {
          if (!this.state.isCurrentSelection(tracked.selection)) {
            this.settlements.delete(name);
            continue;
          }
          const room = rooms.find((candidate) => candidate.name === name);
          const failed = tracked.task !== 'delete' && room?.status === 'failed';
          if (failed || (tracked.task === 'delete' ? !room : room?.status === 'ready')) {
            this.settlements.delete(name);
            this.desktop.roomFinished(tracked.task, name, tracked.selection, failed);
          }
        }
        this.state.setRooms(rooms);
        this.state.setRoomsCount(rooms.length);
        this.state.markRoomsLoaded(playhouse);
        this.loadError.set('');
        this.loadFix.set(undefined);
        this.lastRead.set({ selection, failedReadsInARow: 0 });
      }
      return rooms;
    } catch (error) {
      if (sequence === this.readSequence && this.state.isCurrentSelection(selection)) {
        const previous = this.lastRead();
        this.lastRead.set({
          selection,
          failedReadsInARow:
            previous && this.state.isCurrentSelection(previous.selection)
              ? previous.failedReadsInARow + 1
              : 1,
        });
        this.loadError.set(describeError(error));
        this.loadFix.set(
          this.fixes.action(
            error,
            { signIn: () => this.reload(playhouse, selection, true) },
            selection,
          ),
        );
      }
      throw error;
    } finally {
      this.readsInFlight--;
    }
  }

  private async reloadAfterMutation(selection: PlayroomSelection): Promise<void> {
    if (!this.state.isCurrentSelection(selection)) return;
    try {
      await this.reload(selection.playhouse, selection);
    } catch (error) {
      this.notify.failure('Could not refresh the playrooms', error, '', this.loadFix());
    }
  }

  async updateOutdated(room: Playroom, forceInstall = false): Promise<void> {
    if (room.ephemeral) return;
    const selection = this.state.captureSelection();
    const finish = this.beginOperation(room.name, room.playhouse, 'Updating');
    if (!finish) return;
    let startedOperationId = '';
    try {
      await this.console.run(`Updating "${room.name}"`, (operationId) => {
        startedOperationId = operationId;
        this.console.associatePlayroom(operationId, {
          name: room.name,
          playhouse: room.playhouse,
          scopeRevision: selection.scopeRevision,
        });
        return wailsApi.updatePlayroom(operationId, {
          Name: room.name,
          Playhouse: room.playhouse,
          ...(forceInstall ? { ForceInstall: true } : {}),
        });
      });
      this.notify.toast(`Updated "${room.name}"`, 'ok', startedOperationId);
    } catch (error) {
      this.notify.failure(
        `Could not update "${room.name}"`,
        error,
        startedOperationId,
        this.fixes.action(error, { signIn: () => this.updateOutdated(room, true) }, selection),
      );
    } finally {
      await this.reloadAfterMutation(selection);
      finish();
    }
  }

  startCreate(form: CreateForm, input = createInputFor(form), options?: () => void): boolean {
    const selection = this.state.captureSelection();
    if (form.playhouse !== selection.playhouse) return false;
    const finish = this.beginOperation(form.name, form.playhouse, 'Creating');
    if (!finish) return false;
    const submittedForm = structuredClone(form);
    const submittedRevision = this.session.draftRevision('create');
    void this.create(
      submittedForm,
      selection,
      submittedRevision,
      finish,
      structuredClone(input),
      options,
    );
    return true;
  }

  private async create(
    form: CreateForm,
    selection: PlayroomSelection,
    submittedRevision: number | undefined,
    finish: () => void,
    input: Partial<PlayroomCreateInput>,
    options?: () => void,
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
        this.console.associatePlayroom(operationId, {
          name: form.name,
          playhouse: form.playhouse,
          scopeRevision: selection.scopeRevision,
        });
        this.notify.toast(`Creating "${form.name}" ...`, 'busy', operationId);
        return wailsApi.createPlayroom(operationId, input);
      });
      if (form.noWait) {
        if (this.state.isCurrentSelection(selection))
          this.settlements.set(form.name, { task: 'create', selection });
      } else this.desktop.roomFinished('create', form.name, selection);
      this.notify.toast(`Created "${form.name}"`, 'ok', startedOperationId);
      if (this.state.isCurrentSelection(selection)) {
        updateCache({ lastPlayroom: form.name, lastPlayhouse: form.playhouse });
        this.session.forgetSubmittedDraft('create', submittedRevision);
      }
    } catch (error) {
      this.desktop.roomFinished('create', form.name, selection, true);
      this.notify.failure(
        `Could not create "${form.name}"`,
        error,
        startedOperationId,
        this.fixes.action(
          error,
          {
            signIn: () => {
              this.startCreate(
                { ...form, forceInstall: true },
                { ...input, ForceInstall: true },
                options,
              );
            },
            options,
          },
          selection,
        ),
      );
    } finally {
      // A wait can fail after creation, so the CLI list decides what exists.
      await this.reloadAfterMutation(selection);
      finish();
    }
  }

  async stop(room: Playroom, forceInstall = false): Promise<void> {
    const selection = this.state.captureSelection();
    const finish = this.beginOperation(room.name, room.playhouse, 'Stopping');
    if (!finish) return;
    this.patch(room.name, { status: 'stopped', host: '', rawStatus: '' }, room.playhouse);
    let startedOperationId = '';
    try {
      await this.console.run(`Stopping "${room.name}"`, (operationId) => {
        startedOperationId = operationId;
        this.console.associatePlayroom(operationId, {
          name: room.name,
          playhouse: room.playhouse,
          scopeRevision: selection.scopeRevision,
        });
        return wailsApi.stopPlayroom(operationId, {
          Name: room.name,
          Playhouse: room.playhouse,
          ...(forceInstall ? { ForceInstall: true } : {}),
        });
      });
      this.desktop.roomFinished('stop', room.name, selection);
      this.notify.toast(`Stopped "${room.name}" (storage retained)`, 'idle', startedOperationId);
    } catch (error) {
      this.desktop.roomFinished('stop', room.name, selection, true);
      this.notify.failure(
        `Could not stop "${room.name}"`,
        error,
        startedOperationId,
        this.fixes.action(
          error,
          {
            signIn: () => this.stop(room, true),
            ...(!room.ephemeral ? { updatePlayroom: () => this.updateOutdated(room) } : {}),
          },
          selection,
        ),
      );
    } finally {
      await this.reloadAfterMutation(selection);
      finish();
    }
  }

  async start(room: Playroom, forceInstall = false): Promise<void> {
    const selection = this.state.captureSelection();
    const finish = this.beginOperation(room.name, room.playhouse, 'Starting');
    if (!finish) return;
    this.patch(room.name, { status: 'starting', host: '', rawStatus: '' }, room.playhouse);
    let startedOperationId = '';
    try {
      await this.console.run(`Starting "${room.name}"`, (operationId) => {
        startedOperationId = operationId;
        this.console.associatePlayroom(operationId, {
          name: room.name,
          playhouse: room.playhouse,
          scopeRevision: selection.scopeRevision,
        });
        this.notify.toast(`Starting "${room.name}" ...`, 'busy', operationId);
        // --no-wait keeps the call short; the list polls until the room is ready.
        return wailsApi.startPlayroom(operationId, {
          Name: room.name,
          Playhouse: room.playhouse,
          NoWait: true,
          ...(forceInstall ? { ForceInstall: true } : {}),
        });
      });
      if (this.state.isCurrentSelection(selection))
        this.settlements.set(room.name, { task: 'start', selection });
    } catch (error) {
      this.desktop.roomFinished('start', room.name, selection, true);
      this.notify.failure(
        `Could not start "${room.name}"`,
        error,
        startedOperationId,
        this.fixes.action(
          error,
          {
            signIn: () => this.start(room, true),
            ...(!room.ephemeral ? { updatePlayroom: () => this.updateOutdated(room) } : {}),
          },
          selection,
        ),
      );
    } finally {
      await this.reloadAfterMutation(selection);
      finish();
    }
  }

  startUpdate(form: UpdateForm, forceInstall = false): boolean {
    const selection = this.state.captureSelection();
    if (form.playhouse !== selection.playhouse) return false;
    const finish = this.beginOperation(form.name, form.playhouse, 'Updating');
    if (!finish) return false;
    const submittedForm = structuredClone(form);
    const submittedRevision = this.session.draftRevision('update:' + form.name);
    void this.update(submittedForm, selection, submittedRevision, finish, forceInstall);
    return true;
  }

  private async update(
    form: UpdateForm,
    selection: PlayroomSelection,
    submittedRevision: number | undefined,
    finish: () => void,
    forceInstall = false,
  ): Promise<void> {
    this.patch(form.name, { status: 'starting' }, form.playhouse);
    let startedOperationId = '';
    try {
      await this.console.run(`Updating "${form.name}"`, (operationId) => {
        startedOperationId = operationId;
        this.console.associatePlayroom(operationId, {
          name: form.name,
          playhouse: form.playhouse,
          scopeRevision: selection.scopeRevision,
        });
        this.notify.toast(`Updating "${form.name}" ...`, 'busy', operationId);
        return wailsApi.updatePlayroom(operationId, {
          ...updateInputFor(form),
          ...(forceInstall ? { ForceInstall: true } : {}),
        });
      });
      this.notify.toast(`Updated "${form.name}"`, 'ok', startedOperationId);
      if (this.state.isCurrentSelection(selection))
        this.session.forgetSubmittedDraft('update:' + form.name, submittedRevision);
    } catch (error) {
      this.notify.failure(
        `Could not update "${form.name}"`,
        error,
        startedOperationId,
        this.fixes.action(
          error,
          {
            signIn: () => {
              this.startUpdate(form, true);
            },
          },
          selection,
        ),
      );
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
    forceInstall = false,
  ): Promise<boolean> {
    const selection = this.state.captureSelection();
    const finish = this.beginOperation(room.name, room.playhouse, 'Deleting');
    if (!finish) return false;
    this.patch(room.name, { status: 'deleting' }, room.playhouse);
    let startedOperationId = '';
    try {
      await this.console.run(`Deleting "${room.name}"`, (operationId) => {
        startedOperationId = operationId;
        this.console.associatePlayroom(operationId, {
          name: room.name,
          playhouse: room.playhouse,
          scopeRevision: selection.scopeRevision,
        });
        this.notify.toast(`Deleting "${room.name}" ...`, 'busy', operationId);
        return wailsApi.deletePlayroom(operationId, {
          Name: room.name,
          Playhouse: room.playhouse,
          NoWait: noWait,
          Force: force,
          ...(forceInstall ? { ForceInstall: true } : {}),
          WaitTimeout: waitTimeout,
        });
      });
      if (noWait) {
        if (this.state.isCurrentSelection(selection)) {
          this.settlements.set(room.name, { task: 'delete', selection });
          await this.reloadAfterMutation(selection);
        }
      } else {
        if (this.state.isCurrentSelection(selection)) this.remove(room.name, room.playhouse);
        this.desktop.roomFinished('delete', room.name, selection);
      }
      this.notify.toast(`Deleted "${room.name}"`, 'ok', startedOperationId);
      return true;
    } catch (error) {
      this.desktop.roomFinished('delete', room.name, selection, true);
      this.notify.failure(
        `Could not delete "${room.name}"`,
        error,
        startedOperationId,
        this.fixes.action(
          error,
          {
            signIn: () => this.delete(room, noWait, waitTimeout, force, true),
          },
          selection,
        ),
      );
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
