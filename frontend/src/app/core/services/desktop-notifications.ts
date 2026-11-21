import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DockBadge, Playroom } from '../../shared/models';
import { readCache, updateCache } from '../../shared/utils';
import { PlayroomSelection, PlayroomStateService } from './playroom-state';
import { wailsApi } from './wails-api';

export type RoomTask = 'create' | 'start' | 'stop' | 'delete';
interface NotificationTarget extends PlayroomSelection {
  name: string;
  session: string;
  id: string;
}

export function countDockBadge(rooms: Playroom[], choice: DockBadge): number {
  if (choice === 'off') return 0;
  return rooms.filter((room) =>
    choice === 'failed' ? room.status === 'failed' : ['ready', 'no-host'].includes(room.status),
  ).length;
}

@Injectable({ providedIn: 'root' })
export class DesktopNotificationsService {
  private readonly state = inject(PlayroomStateService);
  private readonly router = inject(Router);
  private readonly session = crypto.randomUUID();
  readonly notifications = signal(readCache().notifications);
  readonly dockBadge = signal<DockBadge>(readCache().dockBadge);
  readonly badgeCount = computed(() => {
    const playhouse = this.state.playhouse();
    this.state.scopeRevision();
    if (!playhouse || this.state.roomsLoadedFor() !== playhouse) return 0;
    return countDockBadge(
      this.state.rooms().filter((room) => room.playhouse === playhouse),
      this.dockBadge(),
    );
  });
  private badgeSelection = '';
  private badgeWrites: Promise<void> = Promise.resolve();

  constructor() {
    effect((cleanup) => {
      const selection = this.state.captureSelection();
      const count = this.badgeCount();
      const selectionKey = JSON.stringify(selection);
      if (selectionKey !== this.badgeSelection || count === 0) this.writeBadge(0);
      this.badgeSelection = selectionKey;
      const timer = setTimeout(() => {
        if (this.state.isCurrentSelection(selection)) this.writeBadge(count);
      }, 150);
      cleanup(() => clearTimeout(timer));
    });
    const unsubscribe = wailsApi.onDesktopNotificationClick((target) => this.openTarget(target));
    inject(DestroyRef).onDestroy(unsubscribe);
  }

  setNotifications(notifications: boolean): void {
    this.notifications.set(notifications);
    updateCache({ notifications });
  }

  setDockBadge(dockBadge: DockBadge): void {
    this.dockBadge.set(dockBadge);
    updateCache({ dockBadge });
  }

  private writeBadge(count: number): void {
    this.badgeWrites = this.badgeWrites
      .then(() => wailsApi.setDockBadge(count))
      .catch((error: unknown) => {
        console.warn('Could not update the Dock badge', error);
      });
  }

  roomFinished(task: RoomTask, name: string, selection: PlayroomSelection, failed = false): void {
    const result = {
      create: 'is ready',
      start: 'is ready',
      stop: 'stopped',
      delete: 'was deleted',
    };
    this.send(`${name} ${failed ? `failed to ${task}` : result[task]}`, name, selection);
  }

  playhouseFinished(
    task: 'create' | 'update',
    slug: string,
    selection: PlayroomSelection,
    failed = false,
  ): void {
    this.send(
      `${slug} ${failed ? `failed to ${task}` : task === 'create' ? 'is ready' : 'was updated'}`,
      '',
      selection,
    );
  }

  private send(title: string, name: string, selection: PlayroomSelection): void {
    if (!this.notifications() || document.hasFocus()) return;
    const target: NotificationTarget = {
      ...selection,
      name,
      session: this.session,
      id: crypto.randomUUID(),
    };
    void wailsApi.sendDesktopNotification(title, JSON.stringify(target)).catch((error: unknown) => {
      console.warn('Could not send a desktop notification', error);
    });
  }

  private openTarget(encoded: string): void {
    try {
      const target = JSON.parse(encoded) as NotificationTarget;
      if (
        target &&
        target.session === this.session &&
        typeof target.name === 'string' &&
        target.name &&
        this.state.isCurrentSelection(target)
      ) {
        void this.router.navigate(['/rooms', target.name]);
        return;
      }
    } catch (error) {
      console.warn('Could not read the desktop notification target', error);
    }
    void this.router.navigate(['/rooms']);
  }
}
