import { TooltipModule } from 'primeng/tooltip';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { PlayroomCardComponent } from '../playroom-card/playroom-card';

// Inherit the card's inputs, outputs and interactions so both views keep identical actions.
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- Keep native table row semantics.
  selector: 'tr[app-playroom-row]',
  imports: [TooltipModule, CommonModule, ButtonModule, MenuModule],
  templateUrl: './playroom-row.html',
  styleUrl: './playroom-row.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.selected]': 'selected',
    '[class.stopped]': 'room.status === "stopped"',
    '[attr.aria-busy]': '!!pendingOperation',
  },
})
export class PlayroomRowComponent extends PlayroomCardComponent {}
