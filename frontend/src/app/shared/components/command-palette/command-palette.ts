import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { APP_ACTIONS, MenuAction, ShortcutsService } from '../../../core/services/shortcuts';
import { PlayroomStateService } from '../../../core/services/playroom-state';
import { PlayroomLifecycleService } from '../../../core/services/playroom-lifecycle';
import { PlayhouseEntry, wailsApi } from '../../../core/services/wails-api';
import { PlayhouseChooserComponent } from '../../../features/playhouse/components/playhouse-chooser/playhouse-chooser';
import { OverlayFocusDirective } from '../../directives';
import { describeError } from '../../utils/cli-error';
import { PlayroomConnectDialogComponent } from '../playroom-connect-dialog/playroom-connect-dialog';
import { ConnectTab, Playroom } from '../../models';
import { PaletteCommand, rankCommands, rememberCommand } from './rank-commands';

const PALETTE_ACTIONS: MenuAction[] = [
  'playrooms',
  'playhouses',
  'defaults',
  'settings',
  'setup',
  'new-playroom',
  'refresh',
  'theme-light',
  'theme-dark',
  'theme-system',
  'overview',
];

@Component({
  selector: 'app-command-palette',
  imports: [
    FormsModule,
    DialogModule,
    InputTextModule,
    OverlayFocusDirective,
    PlayroomConnectDialogComponent,
    PlayhouseChooserComponent,
  ],
  templateUrl: './command-palette.html',
  styleUrl: './command-palette.css',
})
export class CommandPaletteComponent {
  readonly shortcuts = inject(ShortcutsService);
  private readonly state = inject(PlayroomStateService);
  private readonly lifecycle = inject(PlayroomLifecycleService);
  private readonly router = inject(Router);
  readonly connectRequest = signal<{ room: Playroom; tab: ConnectTab } | null>(null);
  readonly query = signal('');
  readonly selected = signal(0);
  readonly recent = signal<string[]>([]);
  readonly playhouses = signal<PlayhouseEntry[]>([]);
  readonly loading = signal(false);
  readonly loadingRooms = signal(false);
  readonly roomFailure = signal('');
  readonly failure = signal('');
  readonly chooserOpen = signal(false);
  private pendingCommand: PaletteCommand | null = null;
  private readSequence = 0;
  private roomReadSequence = 0;

  readonly commands = computed<PaletteCommand[]>(() => {
    const selection = this.state.captureSelection();
    const commands: PaletteCommand[] = PALETTE_ACTIONS.map((action) => ({
      id: action,
      label: APP_ACTIONS[action],
      category: ['playrooms', 'playhouses', 'defaults', 'settings', 'setup'].includes(action)
        ? 'Screen'
        : 'Action',
      run: () => this.shortcuts.runAction(action),
    }));
    commands.push({
      id: 'switch-playhouse',
      label: 'Switch playhouse',
      category: 'Action',
      run: () => this.chooserOpen.set(true),
    });
    for (const playhouse of this.playhouses()) {
      commands.push({
        id: `playhouse:${selection.scopeRevision}:${playhouse.Slug}`,
        label: `Switch playhouse: ${playhouse.Slug}`,
        category: 'Playhouse',
        run: () => {
          if (!this.state.isCurrentSelection(selection)) return;
          this.state.selectPlayhouse(playhouse.Slug);
          void this.router.navigateByUrl('/rooms');
        },
      });
    }
    for (const room of this.state
      .rooms()
      .filter((room) => room.playhouse === selection.playhouse)) {
      const add = (
        action: 'details' | 'connect' | 'open' | 'start' | 'stop',
        label: string,
        run: () => void,
      ) =>
        commands.push({
          id: `room:${selection.scopeRevision}:${room.playhouse}:${room.name}:${action}`,
          label: `${label} ${room.name}`,
          category: 'Playroom',
          run: () => {
            if (this.state.isCurrentSelection(selection)) run();
          },
        });
      add('details', 'Go to playroom', () => void this.router.navigate(['/rooms', room.name]));
      if (this.lifecycle.pendingOperation(room.name)) continue;
      if (room.status === 'ready') {
        add('connect', 'Connect', () => this.connectRequest.set({ room, tab: 'connect' }));
        add('open', 'Open', () => this.connectRequest.set({ room, tab: 'open' }));
        add('stop', 'Stop', () => void this.lifecycle.stop(room));
      } else if (room.status === 'stopped') {
        add('start', 'Start', () => void this.lifecycle.start(room));
      }
    }
    return commands;
  });
  readonly results = computed(() => rankCommands(this.commands(), this.query(), this.recent()));
  readonly activeIndex = computed(() =>
    Math.min(this.selected(), Math.max(0, this.results().length - 1)),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.readSequence++;
      this.roomReadSequence++;
    });
    effect(() => {
      const open = this.shortcuts.paletteOpen();
      this.state.captureSelection();
      untracked(() => {
        if (open) {
          this.query.set('');
          this.selected.set(0);
          void this.loadPlayhouses();
          void this.loadRooms();
        } else {
          this.readSequence++;
          this.roomReadSequence++;
        }
      });
    });
  }

  async loadRooms(): Promise<void> {
    const sequence = ++this.roomReadSequence;
    const selection = this.state.captureSelection();
    this.roomFailure.set('');
    this.loadingRooms.set(false);
    if (!selection.playhouse || this.state.roomsLoadedFor() === selection.playhouse) return;
    this.loadingRooms.set(true);
    try {
      await this.lifecycle.reload(selection.playhouse, selection);
    } catch (error) {
      if (sequence === this.roomReadSequence && this.state.isCurrentSelection(selection))
        this.roomFailure.set(describeError(error));
    } finally {
      if (sequence === this.roomReadSequence) this.loadingRooms.set(false);
    }
  }

  async loadPlayhouses(): Promise<void> {
    const sequence = ++this.readSequence;
    this.playhouses.set([]);
    this.loading.set(true);
    this.failure.set('');
    try {
      const playhouses = await wailsApi.listPlayhouses();
      if (sequence === this.readSequence) this.playhouses.set(playhouses);
    } catch (error) {
      if (sequence === this.readSequence) this.failure.set(describeError(error));
    } finally {
      if (sequence === this.readSequence) this.loading.set(false);
    }
  }

  changeQuery(query: string): void {
    this.query.set(query);
    this.selected.set(0);
  }

  handleKeydown(event: KeyboardEvent): void {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const length = this.results().length;
      if (!length) return;
      this.selected.set(
        (this.activeIndex() + (event.key === 'ArrowDown' ? 1 : -1) + length) % length,
      );
      document
        .getElementById(`palette-option-${this.activeIndex()}`)
        ?.scrollIntoView?.({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const command = this.results()[this.activeIndex()];
      if (command) this.chooseCommand(command);
    }
  }

  chooseCommand(command: PaletteCommand): void {
    this.pendingCommand = command;
    this.shortcuts.paletteOpen.set(false);
  }

  runPendingCommand(): void {
    const command = this.pendingCommand;
    this.pendingCommand = null;
    if (!command || !this.commands().some((current) => current.id === command.id)) return;
    // Wait for the palette's focus restoration before opening another dialog.
    this.recent.set(rememberCommand(this.recent(), command.id));
    command.run();
  }
}
