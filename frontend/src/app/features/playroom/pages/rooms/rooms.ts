import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ShortcutsService } from '../../../../core/services/shortcuts';
import { CommonModule } from '@angular/common';
import {
  Component,
  ChangeDetectorRef,
  ElementRef,
  DestroyRef,
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
import { PopoverModule } from 'primeng/popover';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ToastService } from '../../../../core/services/toast';
import {
  BulkOperation,
  BulkResult,
  canRunBulkOperation,
  PlayroomLifecycleService,
} from '../../../../core/services/playroom-lifecycle';
import { PageLoadingService } from '../../../../core/services/page-loading';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { wailsApi } from '../../../../core/services/wails-api';
import { UiSessionService } from '../../../../core/services/ui-session';
import {
  PlayroomActionsHostComponent,
  PlayroomCardComponent,
  PlayroomRowComponent,
} from '../../../../shared/components';
import { CREATE_PLAYROOM_QUERY_PARAM } from '../../../../shared/data';
import { STATUS } from '../../../../shared/data/status';
import { groupPlayroomsByOwner, sortPlayrooms } from '../../../../shared/utils/playroom-overview';
import {
  totalRequestedResources,
  describeRequestedResourceParts,
  describeRequestedResources,
  describeUnknownRequests,
} from '../../../../shared/utils/requested-resources';
import { buildSearchableRoomText } from '../../../../shared/utils/playroom-search';
import { ConnectTab, Playroom, StatusKey } from '../../../../shared/models';
import { describeError, formatTimeSince } from '../../../../shared/utils';
import { CreatePlayroomDrawerComponent } from '../../components/create-playroom-drawer/create-playroom-drawer';
import { ConfirmDeleteDialog } from '../../../../shared/components/confirm-delete-dialog/confirm-delete-dialog';
import { PlayroomBreadcrumbComponent } from '../../components/playroom-breadcrumb/playroom-breadcrumb';

/**
 * Playroom overview: search, the card grid, and the create/connect/update/
 * delete surfaces. Mutations go to PlayroomLifecycleService.
 */
@Component({
  selector: 'app-rooms-page',
  imports: [
    ConfirmDeleteDialog,
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    ToggleSwitchModule,
    PopoverModule,
    PlayroomCardComponent,
    PlayroomRowComponent,
    PlayroomActionsHostComponent,
    CreatePlayroomDrawerComponent,
    PlayroomBreadcrumbComponent,
  ],
  templateUrl: './rooms.html',
  styleUrl: './rooms.css',
})
export class RoomsPageComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly changeDetector = inject(ChangeDetectorRef);
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
  readonly playroomView = this.session.playroomView;
  readonly groupByOwner = this.session.groupByOwner;
  readonly collapsedOwners = signal<string[]>([]);
  readonly requestedResources = computed(() => {
    const all = totalRequestedResources(this.state.rooms());
    const user = this.state.user();
    const yours = totalRequestedResources(
      this.state.rooms().filter((room) => !!user && room.owner === user),
    );
    const summaryParts = describeRequestedResourceParts(all, 'compact');
    return {
      summary: summaryParts.join(' · '),
      // At the 900px window minimum only CPU and memory fit under the title.
      narrowSummary: summaryParts.slice(0, 2).join(' · '),
      all: describeRequestedResources(all),
      yours: user ? describeRequestedResources(yours) : 'Not reported',
      unknown: describeUnknownRequests(all),
      yourUnknown: user ? describeUnknownRequests(yours) : [],
    };
  });
  readonly roomGroups = computed(() =>
    this.groupByOwner()
      ? groupPlayroomsByOwner(this.filteredRooms(), this.state.user())
      : [{ owner: '', label: 'Playrooms', rooms: this.filteredRooms() }],
  );
  readonly visibleRooms = computed(() =>
    this.roomGroups().flatMap((group) =>
      this.groupByOwner() && this.collapsedOwners().includes(group.owner) ? [] : group.rooms,
    ),
  );

  toggleOwner(owner: string): void {
    this.collapsedOwners.update((owners) =>
      owners.includes(owner)
        ? owners.filter((candidate) => candidate !== owner)
        : [...owners, owner],
    );
  }

  readonly failure = signal('');
  @ViewChild('listBody') private listBody?: ElementRef<HTMLElement>;
  private restoredScroll = false;
  readonly selectMode = signal(false);
  readonly selectedNames = signal<string[]>([]);
  readonly bulkRunning = signal(false);
  readonly bulkResults = signal<BulkResult[]>([]);
  readonly bulkDeleteNames = signal<string[]>([]);
  readonly selectedRooms = computed(() =>
    this.state
      .rooms()
      .filter((room) => this.selectedNames().includes(room.name) && this.canSelect(room)),
  );
  readonly bulkSummary = computed(() => {
    const results = this.bulkResults();
    return `${results.filter((result) => result.status === 'succeeded').length} succeeded, ${results.filter((result) => result.status === 'failed').length} failed, ${results.filter((result) => result.status === 'skipped').length} skipped`;
  });
  private selectionAnchor = '';

  canSelect(room: Playroom): boolean {
    return (
      !!this.state.user() &&
      room.owner === this.state.user() &&
      room.playhouse === this.state.playhouse()
    );
  }

  toggleSelectMode(): void {
    if (this.bulkRunning()) return;
    this.selectMode.update((selected) => !selected);
    this.selectedNames.set([]);
    this.selectionAnchor = '';
  }

  selectRoom(event: { name: string; shiftKey: boolean }): void {
    if (this.bulkRunning()) return;
    const room = this.findRoomByName(event.name);
    if (!room || !this.canSelect(room)) return;
    this.selectMode.set(true);
    const visible = this.visibleRooms();
    const anchor = visible.findIndex((candidate) => candidate.name === this.selectionAnchor);
    const target = visible.findIndex((candidate) => candidate.name === event.name);
    if (event.shiftKey && anchor >= 0 && target >= 0) {
      const range = visible
        .slice(Math.min(anchor, target), Math.max(anchor, target) + 1)
        .filter((candidate) => this.canSelect(candidate))
        .map((candidate) => candidate.name);
      this.selectedNames.update((names) => [...new Set([...names, ...range])]);
    } else {
      this.selectedNames.update((names) =>
        names.includes(event.name)
          ? names.filter((name) => name !== event.name)
          : [...names, event.name],
      );
      this.selectionAnchor = event.name;
    }
  }

  selectAllMine(): void {
    if (this.bulkRunning()) return;
    this.selectedNames.set(
      this.filteredRooms()
        .filter((room) => this.canSelect(room))
        .map((room) => room.name),
    );
  }

  bulkNames(operation: BulkOperation): string[] {
    return this.selectedRooms()
      .filter(
        (room) => !this.actions.pendingOperation(room.name) && canRunBulkOperation(room, operation),
      )
      .map((room) => room.name);
  }

  askBulkDelete(): void {
    if (!this.bulkRunning()) this.bulkDeleteNames.set(this.bulkNames('delete'));
  }

  async runBulk(operation: BulkOperation): Promise<void> {
    if (this.bulkRunning()) return;
    const names = operation === 'delete' ? this.bulkDeleteNames() : this.bulkNames(operation);
    if (!names.length) return;
    this.bulkDeleteNames.set([]);
    this.bulkRunning.set(true);
    try {
      await this.actions.runForEach(names, operation, (results) => this.bulkResults.set(results));
    } finally {
      this.bulkRunning.set(false);
    }
  }

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

  private readonly now = signal(Date.now());
  /** "just now", "8s ago": how old the list on screen is, empty until it has loaded. */
  readonly updatedAgo = computed(() => {
    const refreshedAt = this.state.lastRefreshedAt();
    if (!refreshedAt || !this.loaded()) return '';
    return formatTimeSince(Math.max(0, this.now() - refreshedAt.getTime()) / 1000);
  });

  showCreate = false;
  /** Only the empty playhouse's "Create your first playroom" opens Easy regardless of the remembered mode. */
  createInEasyMode = false;
  private ageTimer: ReturnType<typeof setInterval> | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  /** Set when a read arrived mid-flight, to repeat once that one lands. */
  private rereadWhenTheCurrentReadLands = false;

  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect(() => {
      if (!this.actions.loadError()) {
        this.failure.set('');
      }
    });
    inject(ShortcutsService).registerPageActions(
      {
        refresh: () => void this.refreshRooms(),
        create: () => this.openCreate(),
        overlayOpen: () => this.anyOverlayOpen(),
      },
      inject(DestroyRef),
    );
    // Reads the rooms on arrival and on every playhouse change. An effect
    // rather than ngOnInit, which does not fire again on a reused component.
    effect(() => {
      this.state.playhouse();
      this.state.scopeRevision();
      untracked(() => {
        this.selectedNames.set([]);
        this.selectionAnchor = '';
        this.collapsedOwners.set([]);
        this.bulkDeleteNames.set([]);
        void this.refreshRooms();
      });
    });
  }

  async ngOnInit(): Promise<void> {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.openCreateWhenTheUrlAsksForIt());
    this.ageTimer = setInterval(() => this.incrementAges(), 60000);
    this.clockTimer = setInterval(() => this.now.set(Date.now()), 1000);
    try {
      this.state.setUser(await wailsApi.getCurrentUserEmail());
    } catch {
      /* leave empty */
    }
  }

  ngOnDestroy(): void {
    if (this.ageTimer) clearInterval(this.ageTimer);
    if (this.clockTimer) clearInterval(this.clockTimer);
  }

  private anyOverlayOpen(): boolean {
    return (
      this.bulkDeleteNames().length > 0 || this.showCreate || (this.roomActions?.isOpen() ?? false)
    );
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

  readonly searchedRooms = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.state
      .rooms()
      .filter(
        (room) =>
          room.playhouse === this.state.playhouse() &&
          (!this.mineOnly() || room.owner === this.state.user()) &&
          (!query || buildSearchableRoomText(room).includes(query)),
      );
  });

  readonly statusChips = computed(() => {
    const rooms = this.searchedRooms();
    const statuses = Object.keys(STATUS) as StatusKey[];
    return [
      { status: '' as const, label: 'All', count: rooms.length },
      ...statuses
        .map((status) => ({
          status,
          label: STATUS[status].label,
          count: rooms.filter((room) => room.status === status).length,
        }))
        .filter((chip) => chip.count > 0 || chip.status === this.statusFilter()),
    ];
  });

  readonly filteredRooms = computed<Playroom[]>(() => {
    const status = this.statusFilter();
    return sortPlayrooms(
      this.searchedRooms().filter((room) => !status || room.status === status),
      this.sort(),
      (room) => this.state.isPinned(room.playhouse, room.name),
    );
  });

  private findRoomByName(name: string): Playroom | undefined {
    return this.state
      .rooms()
      .find((room) => room.name === name && room.playhouse === this.state.playhouse());
  }

  runPreferredAction(name: string): void {
    const room = this.findRoomByName(name);
    if (!room || room.status !== 'ready' || this.actions.pendingOperation(name)) return;
    const preferredAction = this.state.preferredAction();
    if (preferredAction !== 'nothing') this.openConnect(name, preferredAction);
  }

  openRoom(name: string): void {
    void this.router.navigate(['/rooms', name]);
  }

  /**
   * Reloads the room list, one read at a time. A `background` poll that arrives
   * mid-read is dropped; a user's read is repeated, as it may be for elsewhere.
   */
  readonly refreshAfterFix = () => this.refreshRooms();

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
        if (!background)
          this.notify.failure('Could not load the playrooms', error, '', this.actions.loadFix());
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
    this.createInEasyMode = false;
    this.showCreate = true;
    this.changeDetector.markForCheck();
  }

  openCreateInEasyMode(): void {
    this.openCreate();
    this.createInEasyMode = true;
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

  openCreateSimilar(name: string): void {
    const room = this.findRoomByName(name);
    if (room) this.roomActions?.openCreateSimilar(room);
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
