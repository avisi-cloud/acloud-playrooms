import { Component, Input, inject } from '@angular/core';
import { TooltipModule } from 'primeng/tooltip';
import { ScopeService } from '../../../../core/services/scope';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { PlayhouseChooserComponent } from '../../../playhouse/components/playhouse-chooser/playhouse-chooser';

@Component({
  selector: 'app-playroom-breadcrumb',
  imports: [TooltipModule, PlayhouseChooserComponent],
  templateUrl: './playroom-breadcrumb.html',
  styleUrl: './playroom-breadcrumb.css',
})
export class PlayroomBreadcrumbComponent {
  readonly scope = inject(ScopeService);
  readonly state = inject(PlayroomStateService);
  @Input() roomName = '';
  showPlayhouseChooser = false;
}
