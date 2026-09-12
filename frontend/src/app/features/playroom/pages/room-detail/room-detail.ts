import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { TagModule } from 'primeng/tag';
import { ToastService } from '../../../../core/services/toast';
import { PlayroomLifecycleService } from '../../../../core/services/playroom-lifecycle';
import { PageLoadingService } from '../../../../core/services/page-loading';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { PlayroomActionsHostComponent } from '../../../../shared/components';
import { STATUS } from '../../../../shared/data';
import { ConnectTab, Playroom } from '../../../../shared/models';
import {
  Severity,
  formatAge,
  copyToClipboard,
  isTransitional,
  statusDescription,
  statusLabel as formatStatusLabel,
  statusSeverity,
  ownerLabel as formatOwnerLabel,
} from '../../../../shared/utils';

/**
 * Single-playroom detail: the connection, resource and metadata view, plus the
 * connect, update and delete surfaces.
 */
@Component({
  selector: 'app-room-detail-page',
  imports: [CommonModule, ButtonModule, MenuModule, TagModule, PlayroomActionsHostComponent],
  templateUrl: './room-detail.html',
  styleUrl: './room-detail.css',
})
export class RoomDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly actions = inject(PlayroomLifecycleService);
  private readonly notify = inject(ToastService);
  private readonly pageLoading = inject(PageLoadingService);
  readonly state = inject(PlayroomStateService);
  @ViewChild('roomActions') private roomActions?: PlayroomActionsHostComponent;

  readonly roomName = signal('');
  readonly room = computed<Playroom | null>(
    () => this.state.rooms().find((room) => room.name === this.roomName()) ?? null,
  );
  loading = false;

  async ngOnInit(): Promise<void> {
    this.roomName.set(this.route.snapshot.paramMap.get('name') ?? '');
    if (this.state.rooms().length === 0) await this.refreshRooms();
  }

  goBack(): void {
    void this.router.navigate(['/rooms']);
  }

  ageLabel(): string {
    const r = this.room();
    return r ? formatAge(r.ageMin) : '';
  }

  statusSeverity(): Severity {
    return statusSeverity(this.room()?.status ?? 'creating');
  }

  /** The status's tone, so the transitional banner can be coloured by it. */
  statusTone(): string {
    return STATUS[this.room()?.status ?? 'creating']?.tone ?? 'busy';
  }

  /** Everything that is not one of the row's primary actions. */
  readonly moreMenuItems = computed<MenuItem[]>(() => [
    {
      label: 'Delete playroom',
      icon: 'pi pi-trash',
      styleClass: 'menu-item-danger',
      command: () => this.askDelete(),
    },
  ]);

  statusLabel(): string {
    const r = this.room();
    return r ? formatStatusLabel(r) : '';
  }

  statusDescription(): string {
    const r = this.room();
    return r ? statusDescription(r) : '';
  }

  ownerLabel(): string {
    const r = this.room();
    return r ? formatOwnerLabel(r, this.state.user()) : '';
  }

  isTransitional(): boolean {
    const r = this.room();
    return r ? isTransitional(r.status) : false;
  }

  // ── Connect / update ───────────────────────────────────────────────────────

  openConnect(tab: ConnectTab): void {
    const room = this.room();
    if (room) this.roomActions?.openConnect(room, tab);
  }

  openUpdate(): void {
    const room = this.room();
    if (room) this.roomActions?.openUpdate(room);
  }

  // ── Lifecycle actions ──────────────────────────────────────────────────────

  startRoom(): void {
    const room = this.room();
    if (room) void this.actions.start(room);
  }

  stopRoom(): void {
    const room = this.room();
    if (room) void this.actions.stop(room);
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  askDelete(): void {
    const room = this.room();
    if (room) this.roomActions?.openDelete(room);
  }

  onDeleted(): void {
    void this.router.navigate(['/rooms']);
  }

  async copyHost(): Promise<void> {
    const room = this.room();
    if (room?.host) await copyToClipboard(room.host);
  }

  private async refreshRooms(): Promise<void> {
    this.loading = true;
    try {
      await this.pageLoading.runAndShowIndicatorIf(true, () =>
        this.actions.reload(this.state.playhouse()),
      );
    } catch (error) {
      this.notify.failure('Could not load the playrooms', error);
    } finally {
      this.loading = false;
    }
  }
}
