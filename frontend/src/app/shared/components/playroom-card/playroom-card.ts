import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
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
  imports: [CommonModule, ButtonModule, MenuModule],
  templateUrl: './playroom-card.html',
  styleUrl: './playroom-card.css',
  // PlayroomStateService rebuilds room objects rather than mutating them, so the
  // card only needs to re-render when its inputs change.
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayroomCardComponent {
  @Input({ required: true })
  set room(value: Playroom) {
    this.roomSignal.set(value);
  }
  get room(): Playroom {
    return this.roomSignal();
  }

  @Input() currentUser = '';

  @Output() openRoom = new EventEmitter<string>();
  @Output() connectRoom = new EventEmitter<string>();
  @Output() openInEditor = new EventEmitter<string>();
  @Output() startRoom = new EventEmitter<string>();
  @Output() stopRoom = new EventEmitter<string>();
  @Output() editRoom = new EventEmitter<string>();
  @Output() deleteRoom = new EventEmitter<string>();

  readonly statusMap = STATUS;

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
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.openRoom.emit(this.room.name);
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

    if (room.status !== 'failed') {
      items.push({
        label: 'Edit',
        icon: 'pi pi-pencil',
        command: () => this.editRoom.emit(room.name),
      });
    }

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
