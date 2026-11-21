import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { CliConsoleService } from '../../../core/services/cli-console';
import { PlayroomStateService } from '../../../core/services/playroom-state';
import { CommandFixService } from '../../../core/services/command-fix';
import { PlayroomLifecycleService } from '../../../core/services/playroom-lifecycle';
import { PlayroomConnectService } from '../../../core/services/playroom-connect';
import {
  PlayroomConnectInput,
  PlayroomOpenInput,
  wailsApi,
} from '../../../core/services/wails-api';
import { PlayroomDefaultsService } from '../../../core/services/playroom-defaults';
import { ToastService } from '../../../core/services/toast';
import { CONNECTION_PATHS, EDITORS, TERMINALS } from '../../data';
import { ConnectionPath, ConnectTab, Playroom } from '../../models';
import { readCache } from '../../utils';
import { CommandPreviewComponent } from '../command-preview/command-preview';
import { OverlayFocusDirective } from '../../directives';

/**
 * The "connect / open" modal for a playroom, seeded from the cache. The connect
 * itself goes to PlayroomConnectService.
 */
@Component({
  selector: 'app-playroom-connect-dialog',
  imports: [
    FormsModule,
    DialogModule,
    ButtonModule,
    SelectModule,
    InputTextModule,
    ToggleSwitchModule,
    CommandPreviewComponent,
    OverlayFocusDirective,
  ],
  templateUrl: './playroom-connect-dialog.html',
  styleUrl: './playroom-connect-dialog.css',
})
export class PlayroomConnectDialogComponent implements OnChanges {
  /** Backend-generated, so the dialog shows the arguments the hand-off will run. */
  private readonly state = inject(PlayroomStateService);
  private readonly console = inject(CliConsoleService);
  private readonly fixes = inject(CommandFixService);
  private readonly lifecycle = inject(PlayroomLifecycleService);
  readonly previewAllowCurrentIP = wailsApi.previewUpdatePlayhouse;
  confirmingAllowCurrentIP = false;
  allowingCurrentIP = false;
  allowCurrentIPComplete = false;
  private allowCurrentIPSelection = this.state.captureSelection();

  canAllowCurrentIP(): boolean {
    return (
      !!this.room &&
      this.room.playhouse === this.state.playhouse() &&
      (this.via === 'nodeport' || (this.via === '' && this.configuredVia === 'nodeport'))
    );
  }

  allowCurrentIPInput() {
    return { Name: this.room?.playhouse ?? '', AllowCurrentIP: true };
  }

  requestAllowCurrentIP(): void {
    if (!this.canAllowCurrentIP()) return;
    this.allowCurrentIPSelection = this.state.captureSelection();
    this.confirmingAllowCurrentIP = true;
  }

  async allowCurrentIP(): Promise<void> {
    if (
      !this.confirmingAllowCurrentIP ||
      this.allowingCurrentIP ||
      !this.canAllowCurrentIP() ||
      !this.state.isCurrentSelection(this.allowCurrentIPSelection)
    )
      return;
    this.allowingCurrentIP = true;
    const input = this.allowCurrentIPInput();
    let operationId = '';
    try {
      await this.console.run('Adding current IP to the allowlist', (startedOperationId) => {
        operationId = startedOperationId;
        return wailsApi.updatePlayhouse(startedOperationId, input);
      });
      this.confirmingAllowCurrentIP = false;
      this.allowCurrentIPComplete = true;
      this.notify.toast(
        'Added your current IP to the allowlist. Connect again when ready.',
        'ok',
        operationId,
      );
    } catch (error) {
      this.notify.failure('Could not add your current IP to the allowlist', error, operationId);
    } finally {
      this.allowingCurrentIP = false;
      // Zoneless: an awaited command does not redraw plain fields on its own.
      this.changeDetector.markForCheck();
    }
  }

  readonly previewConnect = wailsApi.previewConnectPlayroom;
  readonly previewOpen = wailsApi.previewOpenPlayroomInEditor;

  private readonly connectSvc = inject(PlayroomConnectService);
  private readonly defaults = inject(PlayroomDefaultsService);
  private readonly notify = inject(ToastService);
  private readonly changeDetector = inject(ChangeDetectorRef);

  readonly editors = [...EDITORS];
  readonly terminals = [...TERMINALS];
  readonly connectionPaths = [...CONNECTION_PATHS];

  @Input() room: Playroom | null = null;
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Input() tab: ConnectTab = 'connect';

  user = 'playroom';
  forwardAgent = true;
  /** `--via`; blank lets acloud choose, starting from the user's `via` default. */
  via: ConnectionPath = '';
  /**
   * The user's `via` default, named under a blank choice. It is not sent: acloud
   * falls back from a default a room cannot use, but fails on an explicit --via.
   */
  configuredVia = '';
  editor: string;
  terminal: string;

  constructor() {
    const cache = readCache();
    this.editor = cache.lastEditor || 'vscode';
    this.terminal = cache.lastTerminal || 'terminal';
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Reset the per-connection fields each time the dialog opens.
    if (changes['visible'] && this.visible) {
      this.confirmingAllowCurrentIP = false;
      this.allowCurrentIPComplete = false;
      this.user = 'playroom';
      this.forwardAgent = true;
      this.via = '';
      void this.seedFromDefaults();
    }
  }

  /** One description of the connect, used by the preview and the call. */
  connectInput(): Partial<PlayroomConnectInput> {
    return {
      Name: this.room?.name ?? '',
      Playhouse: this.room?.playhouse ?? '',
      User: this.user,
      ForwardAgent: this.forwardAgent,
      Via: this.via,
      Terminal: this.terminal,
    };
  }

  openInput(): Partial<PlayroomOpenInput> {
    return {
      Name: this.room?.name ?? '',
      Playhouse: this.room?.playhouse ?? '',
      Editor: this.editor,
      Via: this.via,
    };
  }

  onVisibleChange(value: boolean): void {
    this.visible = value;
    this.visibleChange.emit(value);
  }

  close(): void {
    this.onVisibleChange(false);
  }

  selectedConnectionPathHint(): string {
    if (this.via === '' && this.configuredVia) {
      const label =
        this.connectionPaths.find((path) => path.id === this.configuredVia)?.label ??
        this.configuredVia;
      return `Your default: ${label}. A playroom it does not fit falls back to how it is exposed.`;
    }
    return this.connectionPaths.find((path) => path.id === this.via)?.hint ?? '';
  }

  onTabKeydown(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    this.tab =
      event.key === 'Home'
        ? 'connect'
        : event.key === 'End'
          ? 'open'
          : this.tab === 'connect'
            ? 'open'
            : 'connect';
    document.getElementById(this.tab + '-tab')?.focus();
  }

  /**
   * Seeds user and forward-agent from `playroom config`, since both are
   * configurable, and reads `via` to name it. The literals below are the
   * fallback for an unknown key.
   */
  private async seedFromDefaults(): Promise<void> {
    try {
      await this.defaults.loadConfiguredDefaultsOnce();
    } catch {
      // Keep the dialog's built-in defaults if the CLI config cannot be read.
    }
    if (!this.visible) return;
    this.user = this.defaults.configuredText('user', 'playroom');
    this.forwardAgent = this.defaults.configuredToggle('forward-agent', true);
    this.configuredVia = this.defaults.configuredText('via', '');
  }

  async execute(forceInstall = false): Promise<void> {
    const room = this.room;
    if (!room) return;
    const selection = this.state.captureSelection();
    const tab = this.tab;
    const user = this.user,
      terminal = this.terminal,
      forwardAgent = this.forwardAgent,
      via = this.via;
    this.close();
    const runConnect = async (forceInstall: boolean) => {
      const operationId = await this.connectSvc.connect(
        room,
        user,
        terminal,
        forwardAgent,
        via,
        forceInstall,
      );
      this.notify.toast(`Opened "${room.name}" in ${terminal}`, 'ok', operationId);
    };
    try {
      if (tab === 'connect') {
        await runConnect(forceInstall);
      } else {
        await this.connectSvc.open(room, this.editor, this.via);
      }
    } catch (error) {
      if (this.state.isCurrentSelection(selection))
        this.notify.failure(
          `Could not open "${room.name}"`,
          error,
          '',
          this.fixes.action(error, {
            ...(tab === 'connect' ? { signIn: () => runConnect(true) } : {}),
            ...(!room.ephemeral
              ? { updatePlayroom: () => this.lifecycle.updateOutdated(room) }
              : {}),
          }),
        );
    }
  }
}
