import { ChangeDetectorRef, Component, EventEmitter, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { PlayroomLifecycleService } from '../../../core/services/playroom-lifecycle';
import { PlayroomDeleteInput, wailsApi } from '../../../core/services/wails-api';
import { DEFAULTS } from '../../data';
import { ConnectTab, Playroom } from '../../models';
import { readCache, updateCache } from '../../utils';
import { ConfirmDeleteDialog } from '../confirm-delete-dialog/confirm-delete-dialog';
import { PlayroomConnectDialogComponent } from '../playroom-connect-dialog/playroom-connect-dialog';
import { PlayroomUpdateDrawerComponent } from '../playroom-update-drawer/playroom-update-drawer';

/**
 * The shared connect/update/delete surfaces for one playroom.
 * List and detail pages only choose a room and react after deletion.
 */
@Component({
  selector: 'app-playroom-actions-host',
  imports: [
    FormsModule,
    InputTextModule,
    ToggleSwitchModule,
    PlayroomConnectDialogComponent,
    PlayroomUpdateDrawerComponent,
    ConfirmDeleteDialog,
  ],
  templateUrl: './playroom-actions-host.html',
})
export class PlayroomActionsHostComponent {
  private readonly lifecycle = inject(PlayroomLifecycleService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Output() deleted = new EventEmitter<Playroom>();

  room: Playroom | null = null;
  connectTab: ConnectTab = 'connect';
  showConnect = false;
  showUpdate = false;
  showDelete = false;

  deleteNoWait = false;
  deleteForce = false;
  deleteTimeout: string = DEFAULTS.waitTimeout;

  readonly previewDelete = wailsApi.previewDeletePlayroom;

  openConnect(room: Playroom, tab: ConnectTab): void {
    this.close();
    this.room = room;
    this.connectTab = tab;
    this.showConnect = true;
    this.cdr.markForCheck();
  }

  openUpdate(room: Playroom): void {
    this.close();
    this.room = room;
    this.showUpdate = true;
    this.cdr.markForCheck();
  }

  openDelete(room: Playroom): void {
    this.close();
    this.room = room;
    this.deleteNoWait = false;
    this.deleteForce = false;
    this.deleteTimeout = DEFAULTS.waitTimeout;
    this.showDelete = true;
    this.cdr.markForCheck();
  }

  isOpen(): boolean {
    return this.showConnect || this.showUpdate || this.showDelete;
  }

  close(): void {
    this.showConnect = false;
    this.showUpdate = false;
    this.showDelete = false;
    this.cdr.markForCheck();
  }

  deleteInput(): Partial<PlayroomDeleteInput> {
    return {
      Name: this.room?.name ?? '',
      Playhouse: this.room?.playhouse ?? '',
      NoWait: this.deleteNoWait,
      Force: this.deleteForce,
      WaitTimeout: this.deleteTimeout,
    };
  }

  async confirmDelete(): Promise<void> {
    const room = this.room;
    if (!room) return;
    this.close();
    const deleted = await this.lifecycle.delete(
      room,
      this.deleteNoWait,
      this.deleteTimeout,
      this.deleteForce,
    );
    if (!deleted) return;

    if (readCache().lastPlayroom === room.name) updateCache({ lastPlayroom: '' });
    this.deleted.emit(room);
  }
}
