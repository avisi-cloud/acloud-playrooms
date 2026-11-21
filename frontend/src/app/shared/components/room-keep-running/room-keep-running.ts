import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { Playroom } from '../../models';
import { PlayroomStateService } from '../../../core/services/playroom-state';
import { wailsApi } from '../../../core/services/wails-api';
import { ToastService } from '../../../core/services/toast';

@Component({
  selector: 'app-room-keep-running',
  imports: [FormsModule, ToggleSwitchModule],
  template: `
    @if (room().owner === state.user() && state.user()) {
      <div class="field-group">
        <label class="field-label" for="room-keep-running">Keep running</label>
        <p-toggleswitch
          inputId="room-keep-running"
          [ngModel]="keepRunning()"
          (ngModelChange)="save($event)"
          [disabled]="busy() || !loaded()"
          aria-describedby="keep-running-hint"
        />
        <p class="field-hint" id="keep-running-hint">
          Skip evening stops for this playroom on this Mac. Idle reminders still apply.
        </p>
        @if (error()) {
          <p role="alert">{{ error() }}</p>
        }
      </div>
    }
  `,
})
export class RoomKeepRunningComponent {
  readonly room = input.required<Playroom>();
  readonly state = inject(PlayroomStateService);
  private readonly notify = inject(ToastService);
  readonly keepRunning = signal(false);
  readonly loaded = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');

  constructor() {
    effect((cleanup) => {
      const room = this.room();
      const selection = this.state.captureSelection();
      let cancelled = false;
      cleanup(() => {
        cancelled = true;
      });
      this.loaded.set(false);
      if (!this.state.user() || room.owner !== this.state.user()) return;
      void wailsApi
        .getRoomKeepRunning(room.playhouse, room.name)
        .then((keep) => {
          if (cancelled || !this.state.isCurrentSelection(selection)) return;
          this.keepRunning.set(keep);
          this.loaded.set(true);
          this.error.set('');
        })
        .catch(() => {
          if (!cancelled) this.error.set('Could not load Keep running. Refresh to try again.');
        });
    });
  }

  async save(keep: boolean): Promise<void> {
    const room = this.room();
    this.busy.set(true);
    try {
      await wailsApi.setRoomKeepRunning(room.playhouse, room.name, keep);
      if (this.room().name === room.name && this.room().playhouse === room.playhouse)
        this.keepRunning.set(keep);
    } catch (error) {
      this.notify.failure('Could not save Keep running', error);
    } finally {
      this.busy.set(false);
    }
  }
}
