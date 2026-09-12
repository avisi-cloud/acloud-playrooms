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
import { EDITORS, TERMINALS } from '../../data';
import { ConnectTab, Playroom } from '../../models';
import { readCache } from '../../utils';
import { CommandPreviewComponent } from '../command-preview/command-preview';

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

  @Input() room: Playroom | null = null;
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Input() tab: ConnectTab = 'connect';

  user = 'playroom';
  forwardAgent = true;
  /** `--tunnel`: reach the room over Tailscale rather than its public address. */
  tunnel = false;
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
      this.tunnel = false;
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
      Tunnel: this.tunnel,
      Terminal: this.terminal,
    };
  }

  openInput(): Partial<PlayroomOpenInput> {
    return {
      Name: this.room?.name ?? '',
      Playhouse: this.room?.playhouse ?? '',
      Editor: this.editor,
      Tunnel: this.tunnel,
    };
  }

  onVisibleChange(value: boolean): void {
    this.visible = value;
    this.visibleChange.emit(value);
  }

  close(): void {
    this.onVisibleChange(false);
  }

  /**
   * Seeds user and forward-agent from `playroom config`, since both are
   * configurable. The literals below are the fallback for an unknown key.
   */
  private async seedFromDefaults(): Promise<void> {
    await this.defaults.loadConfiguredDefaultsOnce();
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
          this.tunnel,
        );
        this.notify.toast(`Opened "${room.name}" in ${this.terminal}`, 'ok', operationId);
      } else {
        await this.connectSvc.open(room, this.editor, this.tunnel);
      }
    } catch (error) {
      this.notify.failure(`Could not open "${room.name}"`, error);
    }
  }
}
