import { Component, inject } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { EveningStopService } from '../../../core/services/evening-stop';

@Component({
  selector: 'app-schedule-notices',
  imports: [ButtonModule],
  styles: `
    :host {
      position: absolute;
      z-index: 20;
      top: 20px;
      right: 20px;
      width: min(420px, calc(100% - 40px));
      max-height: calc(100% - 40px);
      pointer-events: none;
      overflow-y: auto;
    }
    section {
      pointer-events: auto;
      margin: 0 0 10px;
      padding: 12px 16px;
      border: 1px solid var(--border);
      border-radius: var(--r);
      background: var(--surf-2);
      color: var(--tx);
    }
    p {
      margin: 0 0 10px;
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .reminder-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
  `,
  template: `
    @for (notice of schedule.notices(); track notice.ID) {
      <section class="schedule-notice" role="status" aria-label="Playroom reminder">
        <p>{{ notice.Title }}</p>
        <div class="reminder-actions">
          @if (notice.Kind === 'warning') {
            <p-button
              label="Snooze 1 hour"
              size="small"
              [disabled]="schedule.busy()"
              (click)="schedule.act(notice.ID, 'snooze')"
            />
            <p-button
              label="Keep running tonight"
              size="small"
              severity="secondary"
              [disabled]="schedule.busy()"
              (click)="schedule.act(notice.ID, 'keep-tonight')"
            />
          } @else {
            <p-button
              label="Stop"
              size="small"
              [disabled]="schedule.busy()"
              (click)="schedule.act(notice.ID, 'stop')"
            />
          }
          <p-button
            label="Dismiss"
            size="small"
            severity="secondary"
            (click)="schedule.dismiss(notice.ID)"
          />
        </div>
      </section>
    }
  `,
})
export class ScheduleNoticesComponent {
  readonly schedule = inject(EveningStopService);
}
