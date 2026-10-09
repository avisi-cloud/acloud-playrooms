import { Injectable, inject } from '@angular/core';
import { Playroom, UpdateForm } from '../../shared/models';
import { listingToRoom, readCache } from '../../shared/utils';
import { CliConsoleService } from './cli-console';
import { ToastService } from './toast';
import { PlayroomStateService } from './playroom-state';
import { PlayroomUpdateInput, wailsApi } from './wails-api';

/**
 * Playroom start, stop, update and delete, with the optimistic patching and
 * toasts around them. All of it against the shared PlayroomStateService list.
 */
@Injectable({ providedIn: 'root' })
export class PlayroomLifecycleService {
  private readonly state = inject(PlayroomStateService);
  private readonly notify = inject(ToastService);
  private readonly console = inject(CliConsoleService);

  /** Optimistically patch a single room in the shared list. */
  patch(name: string, fields: Partial<Playroom>): void {
    this.state.setRooms(
      this.state.rooms().map((room) => (room.name === name ? { ...room, ...fields } : room)),
    );
  }

  /** Remove a room from the shared list. */
  remove(name: string): void {
    this.state.setRooms(this.state.rooms().filter((room) => room.name !== name));
  }

  /**
   * Fetches the playroom list for a playhouse into shared state. Not logged: it
   * is polled, and would bury the commands worth reading.
   */
  async reload(playhouse: string): Promise<Playroom[]> {
    const listings = await wailsApi.listPlayrooms({ Playhouse: playhouse });
    const rooms = listings.map((listing) => listingToRoom(listing, playhouse));
    this.state.setRooms(rooms);
    return rooms;
  }

  async stop(room: Playroom): Promise<void> {
    this.patch(room.name, { status: 'stopped', host: '', rawStatus: '' });
    let startedOperationId = '';
    try {
      await this.console.run(`Stopping "${room.name}"`, (operationId) => {
        startedOperationId = operationId;
        return wailsApi.stopPlayroom(operationId, { Name: room.name, Playhouse: room.playhouse });
      });
      this.notify.toast(`Stopped "${room.name}" (storage retained)`, 'idle', startedOperationId);
    } catch (error) {
      this.notify.failure(`Could not stop "${room.name}"`, error, startedOperationId);
      await this.reload(room.playhouse);
    }
  }

  async start(room: Playroom): Promise<void> {
    this.patch(room.name, { status: 'starting', host: '', rawStatus: '' });
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
    }
    await this.reload(room.playhouse);
  }

  async update(form: UpdateForm): Promise<void> {
    this.patch(form.name, { status: 'starting' });
    let startedOperationId = '';
    try {
      await this.console.run(`Updating "${form.name}"`, (operationId) => {
        startedOperationId = operationId;
        this.notify.toast(`Updating "${form.name}" ...`, 'busy', operationId);
        return wailsApi.updatePlayroom(operationId, updateInputFor(form));
      });
      this.notify.toast(`Updated "${form.name}"`, 'ok', startedOperationId);
    } catch (error) {
      this.notify.failure(`Could not update "${form.name}"`, error, startedOperationId);
    }
    await this.reload(form.playhouse);
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
    this.patch(room.name, { status: 'deleting' });
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
      this.remove(room.name);
      this.notify.toast(`Deleted "${room.name}"`, 'ok', startedOperationId);
      return true;
    } catch (error) {
      this.notify.failure(`Could not delete "${room.name}"`, error, startedOperationId);
      await this.reload(room.playhouse);
      return false;
    }
  }
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
    MemRequest: form.memReq,
    MemLimit: form.memLim,
    ChangeReadOnly: form.changeReadOnly,
    ReadOnly: form.readOnly,
    ChangePorts: form.changePorts,
    Ports: form.clearPorts ? [] : form.ports.filter(Boolean),
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
