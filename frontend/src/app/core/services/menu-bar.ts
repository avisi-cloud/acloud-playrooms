import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { Playroom, StatusKey } from '../../shared/models';
import { readCache, statusLabel, updateCache } from '../../shared/utils';
import { CommandFixService } from './command-fix';
import { PlayroomConnectService } from './playroom-connect';
import { PlayroomDefaultsService } from './playroom-defaults';
import { PlayroomLifecycleService } from './playroom-lifecycle';
import { PlayroomSelection, PlayroomStateService } from './playroom-state';
import { ToastService } from './toast';
import { MenuBarRequest, MenuBarRooms, wailsApi } from './wails-api';

/** The status each menu bar action needs, as the room card offers it. */
const STATUS_FOR_ACTION: Record<MenuBarRequest['action'], StatusKey> = {
  connect: 'ready',
  'open-in-editor': 'ready',
  start: 'stopped',
  stop: 'ready',
};

export function describeMenuBarRooms(
  playhouse: string,
  roomsLoadedFor: string | null,
  rooms: Playroom[],
  pendingOperation: (name: string) => string,
): MenuBarRooms {
  const loaded = !!playhouse && roomsLoadedFor === playhouse;
  return {
    Playhouse: playhouse,
    Loaded: loaded,
    Rooms: loaded
      ? rooms
          .filter((room) => room.playhouse === playhouse)
          .sort((left, right) => left.name.localeCompare(right.name))
          .map((room) => ({
            Name: room.name,
            Status: room.status,
            StatusLabel: statusLabel(room),
            PendingOperation: pendingOperation(room.name),
          }))
      : [],
  };
}

/**
 * Pushes the room list to the native menu bar and runs the room actions chosen
 * there through the same services as the room card.
 */
@Injectable({ providedIn: 'root' })
export class MenuBarService {
  private readonly state = inject(PlayroomStateService);
  private readonly lifecycle = inject(PlayroomLifecycleService);
  private readonly connections = inject(PlayroomConnectService);
  private readonly defaults = inject(PlayroomDefaultsService);
  private readonly fixes = inject(CommandFixService);
  private readonly notify = inject(ToastService);
  readonly keepRunningInMenuBar = signal(readCache().keepRunningInMenuBar);
  private shownRooms = '';

  constructor() {
    this.sendKeepRunningInMenuBar(this.keepRunningInMenuBar());
    effect(() => {
      const rooms = describeMenuBarRooms(
        this.state.playhouse(),
        this.state.roomsLoadedFor(),
        this.state.rooms(),
        (name) => this.lifecycle.pendingOperation(name),
      );
      // Ages tick every minute; only a change the menu shows is worth a native rebuild.
      const shown = JSON.stringify(rooms);
      if (shown === this.shownRooms) return;
      this.shownRooms = shown;
      void wailsApi.setMenuBarRooms(rooms).catch((error: unknown) => {
        console.warn('Could not update the menu bar', error);
      });
    });
    const unsubscribe = wailsApi.onMenuBarAction((request) => void this.runMenuBarRequest(request));
    inject(DestroyRef).onDestroy(unsubscribe);
  }

  setKeepRunningInMenuBar(keepRunningInMenuBar: boolean): void {
    this.keepRunningInMenuBar.set(keepRunningInMenuBar);
    updateCache({ keepRunningInMenuBar });
    this.sendKeepRunningInMenuBar(keepRunningInMenuBar);
  }

  async runMenuBarRequest(request: MenuBarRequest): Promise<void> {
    const room = this.state
      .rooms()
      .find((entry) => entry.name === request.room && entry.playhouse === request.playhouse);
    if (
      !room ||
      request.playhouse !== this.state.playhouse() ||
      room.status !== STATUS_FOR_ACTION[request.action] ||
      this.lifecycle.pendingOperation(room.name)
    ) {
      this.showMainWindow();
      this.notify.toast(
        `Nothing ran: "${request.room}" changed after the menu bar was updated.`,
        'warn',
      );
      return;
    }
    switch (request.action) {
      case 'connect':
        return this.connect(room);
      case 'open-in-editor':
        return this.openInEditor(room);
      case 'start':
        await this.lifecycle.start(room);
        return;
      case 'stop':
        await this.lifecycle.stop(room);
        return;
    }
  }

  /** Connects with the choices the connect dialog would open on. */
  private async connect(room: Playroom, forceInstall = false): Promise<void> {
    const selection = this.state.captureSelection();
    const terminal = readCache().lastTerminal || 'terminal';
    try {
      await this.defaults.loadConfiguredDefaultsOnce();
    } catch (error) {
      console.warn('Connecting with the built-in user and agent forwarding', error);
    }
    try {
      await this.connections.connect(
        room,
        this.defaults.configuredText('user', 'playroom'),
        terminal,
        this.defaults.configuredToggle('forward-agent', true),
        '',
        forceInstall,
      );
    } catch (error) {
      this.reportFailure(room, error, selection, () => this.connect(room, true));
    }
  }

  private async openInEditor(room: Playroom): Promise<void> {
    const selection = this.state.captureSelection();
    try {
      await this.connections.open(room, readCache().lastEditor || 'vscode');
    } catch (error) {
      this.reportFailure(room, error, selection);
    }
  }

  private reportFailure(
    room: Playroom,
    error: unknown,
    selection: PlayroomSelection,
    signIn?: () => Promise<void>,
  ): void {
    if (!this.state.isCurrentSelection(selection)) return;
    this.showMainWindow();
    this.notify.failure(
      `Could not open "${room.name}"`,
      error,
      '',
      this.fixes.action(error, {
        ...(signIn ? { signIn } : {}),
        ...(!room.ephemeral ? { updatePlayroom: () => this.lifecycle.updateOutdated(room) } : {}),
      }),
    );
  }

  private showMainWindow(): void {
    void wailsApi.showMainWindow().catch((error: unknown) => {
      console.warn('Could not show the window', error);
    });
  }

  private sendKeepRunningInMenuBar(keepRunningInMenuBar: boolean): void {
    void wailsApi.setKeepRunningInMenuBar(keepRunningInMenuBar).catch((error: unknown) => {
      console.warn('Could not save keep running in the menu bar', error);
    });
  }
}
