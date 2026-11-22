import { TooltipModule } from 'primeng/tooltip';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  OnDestroy,
  Input,
  Output,
  computed,
  signal,
} from '@angular/core';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { STATUS } from '../../data';
import { Playroom } from '../../models';
import {
  describeOutdated,
  copyToClipboard,
  sshAlias,
  formatAge,
  ownerLabel as formatOwnerLabel,
  statusLabel as formatStatusLabel,
} from '../../utils';

/**
 * A single playroom card for the overview grid. Presentational: it emits an
 * event per action, and the list screen owns the behaviour.
 */
@Component({
  selector: 'app-playroom-card',
  imports: [TooltipModule, CommonModule, ButtonModule, MenuModule],
  templateUrl: './playroom-card.html',
  styleUrl: './playroom-card.css',
  // PlayroomStateService rebuilds room objects rather than mutating them, so the
  // card only needs to re-render when its inputs change.
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayroomCardComponent implements OnDestroy {
  @Output() doubleClickRoom = new EventEmitter<string>();
  private clickTimer?: ReturnType<typeof setTimeout>;
  readonly sshCopied = signal(false);

  ngOnDestroy(): void {
    clearTimeout(this.clickTimer);
  }

  @Input() selectMode = false;
  @Input() selected = false;
  @Input() selectionDisabled = false;
  @Output() selectRoom = new EventEmitter<{ name: string; shiftKey: boolean }>();

  onSelect(event: MouseEvent | KeyboardEvent): void {
    if (!this.selectionDisabled && this.currentUser && this.room.owner === this.currentUser)
      this.selectRoom.emit({ name: this.room.name, shiftKey: event.shiftKey });
  }

  onCardClick(event?: MouseEvent): void {
    clearTimeout(this.clickTimer);
    if (this.selectMode || event?.metaKey || event?.ctrlKey || event?.shiftKey) {
      if (event) this.onSelect(event);
      return;
    }
    this.clickTimer = setTimeout(() => this.openRoom.emit(this.room.name), 500);
  }

  onCardDoubleClick(event: MouseEvent): void {
    if (this.selectMode || event.metaKey || event.ctrlKey || event.shiftKey) return;
    if ((event.target as HTMLElement).closest('button, p-button, .card-actions, p-menu')) return;
    clearTimeout(this.clickTimer);
    if (this.room.status === 'ready' && !this.pendingOperation)
      this.doubleClickRoom.emit(this.room.name);
  }

  async copySshCommand(): Promise<void> {
    await copyToClipboard(`ssh ${sshAlias(this.room.name)}`);
    this.sshCopied.set(true);
  }

  @Input({ required: true })
  set room(value: Playroom) {
    this.roomSignal.set(value);
  }
  get room(): Playroom {
    return this.roomSignal();
  }

  @Input() pinned = false;
  @Output() pinRoom = new EventEmitter<string>();
  @Input() currentUser = '';
  @Input() pendingOperation = '';

  @Output() openRoom = new EventEmitter<string>();
  @Output() connectRoom = new EventEmitter<string>();
  @Output() openInEditor = new EventEmitter<string>();
  @Output() startRoom = new EventEmitter<string>();
  @Output() stopRoom = new EventEmitter<string>();
  @Output() createSimilarRoom = new EventEmitter<string>();
  @Output() editRoom = new EventEmitter<string>();
  @Output() deleteRoom = new EventEmitter<string>();

  readonly statusMap = STATUS;
  readonly outdatedBadge = computed(() => describeOutdated(this.roomSignal()));

  private readonly roomSignal = signal<Playroom>({} as Playroom);

  get initial(): string {
    return (this.room.name?.[0] || 'P').toUpperCase();
  }

  /**
   * The secondary chip in the card header: storage kind, which is something that
   * actually tells one card from another.
   */
  flavorLabel(): string {
    return this.room.ephemeral ? 'EPHEMERAL' : 'PERSISTENT';
  }

  flavorTitle(): string {
    return this.room.ephemeral
      ? 'Ephemeral storage — the disk is discarded when the playroom goes'
      : 'Persistent storage — the disk survives a stop';
  }

  ageLabel(): string {
    return formatAge(this.room.ageMin);
  }

  ownerLabel(): string {
    return formatOwnerLabel(this.room, this.currentUser);
  }

  statusLabel(): string {
    return formatStatusLabel(this.room);
  }

  /** Enter and Space open the card; Space must not also scroll the grid. */
  onCardKeydown(event: KeyboardEvent): void {
    // A child button owns its own Enter/Space activation.
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (this.selectMode || event.metaKey || event.ctrlKey || event.shiftKey) this.onSelect(event);
    else this.openRoom.emit(this.room.name);
  }

  /** The overflow menu: everything that is not the card's one primary action. */
  readonly menuItems = computed<MenuItem[]>(() => {
    const room = this.roomSignal();
    const items: MenuItem[] = [
      {
        label: 'Open details',
        icon: 'pi pi-arrow-right',
        command: () => this.openRoom.emit(room.name),
      },
    ];

    items.push({
      label: this.sshCopied() ? 'Copied' : 'Copy SSH command',
      icon: 'pi pi-copy',
      title: 'Works after the first Connect or Open.',
      command: () => void this.copySshCommand(),
    });

    if (room.status !== 'failed') {
      items.push({
        label: 'Edit',
        icon: 'pi pi-pencil',
        command: () => this.editRoom.emit(room.name),
      });
    }

    items.push({
      label: 'Create similar',
      icon: 'pi pi-plus',
      command: () => this.createSimilarRoom.emit(room.name),
    });
    items.push({ separator: true });
    items.push({
      label: 'Delete',
      icon: 'pi pi-trash',
      styleClass: 'menu-item-danger',
      command: () => this.deleteRoom.emit(room.name),
    });
    return items;
  });
}
