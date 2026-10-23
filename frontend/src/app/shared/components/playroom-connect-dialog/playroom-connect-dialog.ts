import {
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
  readonly previewConnect = wailsApi.previewConnectPlayroom;
  readonly previewOpen = wailsApi.previewOpenPlayroomInEditor;

  private readonly connectSvc = inject(PlayroomConnectService);
  private readonly defaults = inject(PlayroomDefaultsService);
  private readonly notify = inject(ToastService);

  readonly editors = [...EDITORS];
  readonly terminals = [...TERMINALS];
  readonly connectionPaths = [...CONNECTION_PATHS];

  @Input() room: Playroom | null = null;
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Input() tab: ConnectTab = 'connect';

  user = 'playroom';
  forwardAgent = true;
  /** `--via`; blank lets acloud use the room's own exposure. */
  via: ConnectionPath = '';
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
   * configurable. The literals below are the fallback for an unknown key.
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
  }

  async execute(): Promise<void> {
    const room = this.room;
    if (!room) return;
    this.close();
    try {
      if (this.tab === 'connect') {
        const operationId = await this.connectSvc.connect(
          room,
          this.user,
          this.terminal,
          this.forwardAgent,
          this.via,
        );
        this.notify.toast(`Opened "${room.name}" in ${this.terminal}`, 'ok', operationId);
      } else {
        await this.connectSvc.open(room, this.editor, this.via);
      }
    } catch (error) {
      this.notify.failure(`Could not open "${room.name}"`, error);
    }
  }
}
