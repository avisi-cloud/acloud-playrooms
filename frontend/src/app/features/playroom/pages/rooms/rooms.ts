import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ToastService } from '../../../../core/services/toast';
import { PlayroomLifecycleService } from '../../../../core/services/playroom-lifecycle';
import { PageLoadingService } from '../../../../core/services/page-loading';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { wailsApi } from '../../../../core/services/wails-api';
import { UiSessionService } from '../../../../core/services/ui-session';
import { PlayroomActionsHostComponent, PlayroomCardComponent } from '../../../../shared/components';
import { CREATE_PLAYROOM_QUERY_PARAM } from '../../../../shared/data';
import { ConnectTab, Playroom } from '../../../../shared/models';
import { describeError } from '../../../../shared/utils';
import { CreatePlayroomDrawerComponent } from '../../components/create-playroom-drawer/create-playroom-drawer';

/**
 * Playroom overview: search, the card grid, and the create/connect/update/
 * delete surfaces. Mutations go to PlayroomLifecycleService.
 */
@Component({
  selector: 'app-rooms-page',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    ToggleSwitchModule,
    PlayroomCardComponent,
    PlayroomActionsHostComponent,
    CreatePlayroomDrawerComponent,
  ],
  templateUrl: './rooms.html',
  styleUrl: './rooms.css',
})
export class RoomsPageComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly actions = inject(PlayroomLifecycleService);
  private readonly notify = inject(ToastService);
  private readonly pageLoading = inject(PageLoadingService);
  readonly state = inject(PlayroomStateService);
  @ViewChild('roomActions') private roomActions?: PlayroomActionsHostComponent;

  readonly session = inject(UiSessionService);
  readonly query = this.session.query;
  readonly mineOnly = this.session.mineOnly;
  readonly statusFilter = this.session.status;
  readonly sort = this.session.sort;
  readonly compact = this.session.compact;
  readonly failure = signal('');
  @ViewChild('listBody') private listBody?: ElementRef<HTMLElement>;
  private restoredScroll = false;

  restoreScroll(): void {
    if (!this.loaded() || this.restoredScroll || !this.listBody) return;
    this.listBody.nativeElement.scrollTop = this.session.scrollTop;
    this.restoredScroll = true;
  }

  rememberScroll(event: Event): void {
    this.session.scrollTop = (event.target as HTMLElement).scrollTop;
  }
  readonly refreshing = signal(false);
  /**
   * Whether there is anything to render yet. From shared state, not a field:
   * this component is destroyed on every navigation.
   */
  readonly loaded = computed(() => this.state.roomsLoadedFor() === this.state.playhouse());

  showCreate = false;
  private ageTimer: ReturnType<typeof setInterval> | null = null;
  /** Set when a read arrived mid-flight, to repeat once that one lands. */
  private rereadWhenTheCurrentReadLands = false;

  constructor() {
    // Reads the rooms on arrival and on every playhouse change. An effect
    // rather than ngOnInit, which does not fire again on a reused component.
    effect(() => {
      this.state.playhouse();
      this.state.scopeRevision();
      untracked(() => void this.refreshRooms());
    });
  }

  async ngOnInit(): Promise<void> {
    this.openCreateWhenTheUrlAsksForIt();
    this.ageTimer = setInterval(() => this.incrementAges(), 60000);
    try {
      this.state.setUser(await wailsApi.getCurrentUserEmail());
    } catch {
      /* leave empty */
    }
  }

  ngOnDestroy(): void {
    if (this.ageTimer) clearInterval(this.ageTimer);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    // Escape still reaches the overlays; anything else would open a second one.
    // PrimeNG owns Escape for nested selects and overlays. Do not close their
    // parent drawer when the user only meant to dismiss a dropdown.
    if (event.key === 'Escape') return;
    if (this.anyOverlayOpen()) return;

    // PrimeNG renders its select as <div role="combobox">, not <select>.
    const target = event.target as HTMLElement | null;
    if (
      target?.closest?.(
        'input, textarea, select, [contenteditable], [role="combobox"], [role="textbox"]',
      )
    )
      return;
    // A shortcut is a bare keypress; Cmd-C must stay a copy.
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'c' || event.key === 'C') this.openCreate();
    if (event.key === '/') {
      event.preventDefault();
      document.querySelector<HTMLInputElement>('#room-search')?.focus();
    }
  }

  private anyOverlayOpen(): boolean {
    return this.showCreate || (this.roomActions?.isOpen() ?? false);
  }

  /** Whether the empty state is "nothing here" or "nothing matches". */
  hasFilters(): boolean {
    return this.mineOnly() || this.query().trim().length > 0 || !!this.statusFilter();
  }

  clearFilters(): void {
    this.mineOnly.set(false);
    this.query.set('');
    this.statusFilter.set('');
  }

  /**
   * The visible rooms. A computed rather than a method, which the template
   * would re-run on every change-detection pass.
   */
  readonly filteredRooms = computed<Playroom[]>(() => {
    const query = this.query().trim().toLowerCase();
    const playhouse = this.state.playhouse();
    const mineOnly = this.mineOnly();
    const user = this.state.user();
    const status = this.statusFilter();
    const sort = this.sort();
    return this.state
      .rooms()
      .filter((room) => {
        const searchable = `${room.name} ${room.owner}`.toLowerCase();
        return (
          room.playhouse === playhouse &&
          (!mineOnly || room.owner === user) &&
          (!status || room.status === status) &&
          (!query || searchable.includes(query))
        );
      })
      .sort((left, right) =>
        sort === 'age'
          ? left.ageMin - right.ageMin || left.name.localeCompare(right.name)
          : sort === 'status'
            ? left.status.localeCompare(right.status) || left.name.localeCompare(right.name)
            : left.name.localeCompare(right.name),
      );
  });

  readonly mineCount = computed<number>(
    () =>
      this.state
        .rooms()
        .filter(
          (room) => room.playhouse === this.state.playhouse() && room.owner === this.state.user(),
        ).length,
  );

  private findRoomByName(name: string): Playroom | undefined {
    return this.state
      .rooms()
      .find((room) => room.name === name && room.playhouse === this.state.playhouse());
  }

  openRoom(name: string): void {
    void this.router.navigate(['/rooms', name]);
  }

  /**
   * Reloads the room list, one read at a time. A `background` poll that arrives
   * mid-read is dropped; a user's read is repeated, as it may be for elsewhere.
   */
  async refreshRooms(background = false): Promise<void> {
    if (this.refreshing()) {
      if (!background) this.rereadWhenTheCurrentReadLands = true;
      return;
    }
    this.refreshing.set(true);
    const playhouse = this.state.playhouse();
    const revision = this.state.scopeRevision();
    this.failure.set('');
    try {
      const rooms = await this.pageLoading.runAndShowIndicatorIf(!background, () =>
        this.actions.reload(playhouse),
      );
      if (playhouse === this.state.playhouse() && revision === this.state.scopeRevision()) {
        this.state.setRoomsCount(rooms.filter((room) => room.playhouse === playhouse).length);
        setTimeout(() => this.restoreScroll());
      }
    } catch (error) {
      if (playhouse === this.state.playhouse() && revision === this.state.scopeRevision()) {
        this.failure.set(describeError(error));
        if (!background) this.notify.failure('Could not load the playrooms', error);
      }
    } finally {
      this.refreshing.set(false);
    }

    if (this.rereadWhenTheCurrentReadLands) {
      this.rereadWhenTheCurrentReadLands = false;
      await this.refreshRooms();
    }
  }

  // ── Create / connect / update ──────────────────────────────────────────────

  openCreate(): void {
    this.showCreate = true;
  }

  /** Cleared once read, so Back or a reload does not open the drawer a second time. */
  private openCreateWhenTheUrlAsksForIt(): void {
    if (!this.route.snapshot.queryParamMap.has(CREATE_PLAYROOM_QUERY_PARAM)) return;
    this.openCreate();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [CREATE_PLAYROOM_QUERY_PARAM]: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  openConnect(name: string, tab: ConnectTab): void {
    const room = this.findRoomByName(name);
    if (room) this.roomActions?.openConnect(room, tab);
  }

  openUpdate(name: string): void {
    if (this.actions.pendingOperation(name)) return;
    const room = this.findRoomByName(name);
    if (room) this.roomActions?.openUpdate(room);
  }

  // ── Lifecycle actions ──────────────────────────────────────────────────────

  startRoom(name: string): void {
    const room = this.findRoomByName(name);
    if (room) void this.actions.start(room);
  }

  stopRoom(name: string): void {
    const room = this.findRoomByName(name);
    if (room) void this.actions.stop(room);
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  askDelete(name: string): void {
    if (this.actions.pendingOperation(name)) return;
    const room = this.findRoomByName(name);
    if (room) this.roomActions?.openDelete(room);
  }

  closeOverlays(): void {
    this.showCreate = false;
    this.roomActions?.close();
  }

  private incrementAges(): void {
    this.state.setRooms(this.state.rooms().map((room) => ({ ...room, ageMin: room.ageMin + 1 })));
  }
}
