import { ShortcutsService } from '../../../../core/services/shortcuts';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { TagModule } from 'primeng/tag';
import { AcloudSessionService } from '../../../../core/services/acloud-session';
import { ToastService } from '../../../../core/services/toast';
import { PlayroomLifecycleService } from '../../../../core/services/playroom-lifecycle';
import { PageLoadingService } from '../../../../core/services/page-loading';
import { CliConsoleService } from '../../../../core/services/cli-console';
import { wailsApi } from '../../../../core/services/wails-api';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { PlayroomActionsHostComponent } from '../../../../shared/components';
import { STATUS } from '../../../../shared/data';
import { ConnectTab, Playroom } from '../../../../shared/models';
import {
  Severity,
  sshAlias,
  forwardedPortUrl,
  hasTailnetHost,
  describeRoomAsText,
  describeOutdated,
  renderCapabilities,
  formatAge,
  copyToClipboard,
  isTransitional,
  statusDescription,
  statusLabel as formatStatusLabel,
  statusSeverity,
  ownerLabel as formatOwnerLabel,
  describeError,
} from '../../../../shared/utils';

/** Reported room details stay separate from editable form drafts. */
@Component({
  selector: 'app-room-detail-page',
  imports: [CommonModule, ButtonModule, MenuModule, TagModule, PlayroomActionsHostComponent],
  templateUrl: './room-detail.html',
  styleUrl: './room-detail.css',
})
export class RoomDetailPageComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly actions = inject(PlayroomLifecycleService);
  private readonly notify = inject(ToastService);
  private readonly pageLoading = inject(PageLoadingService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly console = inject(CliConsoleService);
  readonly state = inject(PlayroomStateService);
  @ViewChild('roomActions') private roomActions?: PlayroomActionsHostComponent;

  private readonly session = inject(AcloudSessionService);
  readonly sshAlias = sshAlias;
  readonly forwardedPortUrl = forwardedPortUrl;
  readonly hasTailnetHost = hasTailnetHost;
  readonly sshCopied = signal(false);
  readonly detailsCopied = signal(false);
  readonly copiedPort = signal<number | null>(null);

  async copySshCommand(): Promise<void> {
    const room = this.room();
    if (!room) return;
    await copyToClipboard(`ssh ${sshAlias(room.name)}`);
    this.sshCopied.set(true);
  }

  async copyDetails(): Promise<void> {
    const room = this.room();
    if (!room) return;
    try {
      const app = await wailsApi.getAppVersion();
      await copyToClipboard(describeRoomAsText(room, { app, acloud: this.session.version() }));
      this.detailsCopied.set(true);
    } catch (error) {
      this.notify.failure('Could not copy room details', error);
    }
  }

  async copyPort(port: number): Promise<void> {
    const room = this.room();
    if (!room) return;
    await copyToClipboard(forwardedPortUrl(room, port) || String(port));
    this.copiedPort.set(port);
  }

  async openPort(event: MouseEvent, port: number): Promise<void> {
    event.preventDefault();
    const room = this.room();
    if (!room) return;
    const url = forwardedPortUrl(room, port);
    if (!url) return;
    try {
      await wailsApi.openUrlInDefaultBrowser(url);
    } catch (error) {
      this.notify.failure('Could not open forwarded port', error);
    }
  }

  readonly roomName = signal('');
  readonly describeOutdated = describeOutdated;
  readonly renderCapabilities = renderCapabilities;
  readonly room = computed<Playroom | null>(
    () =>
      this.state
        .rooms()
        .find(
          (room) => room.name === this.roomName() && room.playhouse === this.state.playhouse(),
        ) ?? null,
  );
  readonly latestActivityId = computed(() => {
    const room = this.room();
    return room
      ? this.console.latestPlayroomOperation({
          name: room.name,
          playhouse: room.playhouse,
          scopeRevision: this.state.scopeRevision(),
        })
      : '';
  });
  private readonly connectionTarget = computed(
    () => ({
      name: this.room()?.name ?? '',
      playhouse: this.room()?.playhouse ?? '',
      scopeRevision: this.state.scopeRevision(),
    }),
    {
      equal: (previous, current) =>
        previous.name === current.name &&
        previous.playhouse === current.playhouse &&
        previous.scopeRevision === current.scopeRevision,
    },
  );
  readonly connectionCommand = signal('');
  readonly connectionCommandFailure = signal('');
  readonly commandCopied = signal(false);
  private readonly commandRetry = signal(0);
  loading = false;
  refreshing = false;
  failure = '';
  private readonly pollTimer: ReturnType<typeof setInterval>;

  constructor() {
    effect(() => {
      if (!this.actions.loadError()) {
        this.failure = '';
        this.changeDetector.markForCheck();
      }
    });
    inject(ShortcutsService).registerPageActions(
      { refresh: () => void this.refreshRooms() },
      inject(DestroyRef),
    );
    this.route.paramMap
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((params) => this.roomName.set(params.get('name') ?? ''));
    effect(() => {
      this.state.playhouse();
      this.state.scopeRevision();
      this.roomName();
      untracked(() => void this.refreshRooms());
    });
    effect((onCleanup) => {
      const target = this.connectionTarget();
      this.commandRetry();
      this.connectionCommand.set('');
      this.connectionCommandFailure.set('');
      this.commandCopied.set(false);
      this.sshCopied.set(false);
      this.detailsCopied.set(false);
      this.copiedPort.set(null);
      if (!target.name || !target.playhouse) return;
      let active = true;
      onCleanup(() => {
        active = false;
      });
      void wailsApi
        .previewConnectPlayroom({
          Name: target.name,
          Playhouse: target.playhouse,
          ForwardAgent: false,
        })
        .then((commandArguments) => {
          if (!active) return;
          if (!commandArguments.length) throw new Error('The CLI returned no connection command.');
          this.connectionCommand.set(commandArguments.join(' '));
        })
        .catch((error) => {
          if (active) this.connectionCommandFailure.set(describeError(error));
        });
    });
    this.pollTimer = setInterval(() => void this.refreshRooms(true), 10000);
  }

  ngOnDestroy(): void {
    clearInterval(this.pollTimer);
  }

  goBack(): void {
    void this.router.navigate(['/rooms']);
  }

  ageLabel(): string {
    const room = this.room();
    return room?.createdAt ? formatAge(room.ageMin) : 'Not reported';
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
      disabled: !!this.actions.pendingOperation(this.roomName()),
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
    if (this.actions.pendingOperation(this.roomName())) return;
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
    if (this.actions.pendingOperation(this.roomName())) return;
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

  retryConnectionCommand(): void {
    this.commandRetry.update((attempt) => attempt + 1);
  }

  async copyConnectionCommand(): Promise<void> {
    const command = this.connectionCommand();
    if (!command) return;
    await copyToClipboard(command);
    if (this.connectionCommand() === command) this.commandCopied.set(true);
  }

  openRoomActivity(): void {
    const operationId = this.latestActivityId();
    if (operationId) this.console.open(operationId);
  }

  readonly refreshAfterFix = () => this.refreshRooms();

  async refreshRooms(background = false): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    this.loading = !this.room();
    const playhouse = this.state.playhouse();
    const revision = this.state.scopeRevision();
    try {
      await this.pageLoading.runAndShowIndicatorIf(!background, () =>
        this.actions.reload(playhouse),
      );
      this.failure = '';
    } catch (error) {
      if (revision === this.state.scopeRevision() && playhouse === this.state.playhouse()) {
        this.failure = describeError(error);
        if (!background)
          this.notify.failure('Could not load the playroom', error, '', this.actions.loadFix());
      }
    } finally {
      this.loading = false;
      this.refreshing = false;
      this.changeDetector.markForCheck();
      if (revision !== this.state.scopeRevision() || playhouse !== this.state.playhouse())
        void this.refreshRooms();
    }
  }
}
