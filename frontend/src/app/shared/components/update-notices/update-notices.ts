import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { PopoverModule } from 'primeng/popover';
import { EveningStopService } from '../../../core/services/evening-stop';
import { UpdatesService, UpdateNotice } from '../../../core/services/updates';
import { wailsApi } from '../../../core/services/wails-api';

@Component({
  selector: 'app-update-notices',
  imports: [ButtonModule, PopoverModule],
  host: { '[class.page-notice]': "placement() === 'page'" },
  styles: `
    :host {
      display: block;
    }
    :host.page-notice {
      position: absolute;
      z-index: 20;
      top: 20px;
      right: 20px;
      width: min(420px, calc(100% - 40px));
      max-height: calc(100% - 40px);
      pointer-events: none;
      overflow-y: auto;
    }
    .sidebar-update {
      --wails-draggable: no-drag;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--side-tx);
      font: inherit;
      font-size: 10.5px;
      line-height: 1.5;
      text-align: left;
      text-decoration: underline;
      text-underline-offset: 3px;
      cursor: pointer;
    }
    .sidebar-update:hover {
      color: var(--cyan);
    }
    .sidebar-update:focus-visible {
      outline: 2px solid var(--cyan);
      outline-offset: 3px;
    }
    .update-details {
      width: min(340px, calc(100vw - 72px));
      color: var(--tx);
    }
    .update-details section {
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
    }
    .update-details section:first-child {
      padding-top: 0;
    }
    .update-details section:last-child {
      padding-bottom: 0;
      border-bottom: 0;
    }
    .whats-new {
      pointer-events: auto;
      margin-bottom: 10px;
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
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    code {
      display: block;
      margin-bottom: 10px;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
  `,
  template: `
    @if (placement() === 'sidebar') {
      @if (updates.availableUpdates().length) {
        <button
          type="button"
          class="sidebar-update"
          aria-haspopup="dialog"
          [attr.aria-expanded]="details.overlayVisible"
          (click)="details.toggle($event)"
        >
          {{ updates.sidebarLabel() }}
        </button>
      }
      <p-popover #details appendTo="body" ariaLabel="Available updates">
        <div class="update-details">
          @for (notice of updates.availableUpdates(); track notice.kind) {
            <section [attr.aria-label]="notice.title" role="region">
              <p>{{ notice.title }}</p>
              <code>{{ notice.command }}</code>
              <div class="actions">
                @if (notice.releaseUrl) {
                  <a
                    pButton
                    size="small"
                    severity="secondary"
                    [href]="notice.releaseUrl"
                    (click)="openReleaseNotes($event, notice)"
                    >Release notes</a
                  >
                }
                <p-button
                  [label]="copied() === notice.kind ? 'Copied' : 'Copy upgrade command'"
                  size="small"
                  severity="secondary"
                  (click)="copyCommand(notice)"
                />
                <p-button
                  label="Dismiss"
                  size="small"
                  severity="secondary"
                  (click)="
                    updates.dismiss(notice.kind);
                    !updates.availableUpdates().length && details.hide()
                  "
                />
              </div>
              @if (error() === notice.kind) {
                <p role="alert">{{ errorMessage() }}</p>
              }
            </section>
          }
        </div>
      </p-popover>
    } @else if (whatsNew(); as notice) {
      <section class="whats-new" role="status" [attr.aria-label]="notice.title">
        <p>{{ notice.title }}</p>
        <div class="actions">
          <a
            pButton
            size="small"
            severity="secondary"
            [href]="notice.releaseUrl"
            (click)="openReleaseNotes($event, notice)"
            >Release notes</a
          >
          <p-button
            label="Dismiss"
            size="small"
            severity="secondary"
            (click)="updates.dismiss(notice.kind)"
          />
        </div>
        @if (error() === notice.kind) {
          <p role="alert">{{ errorMessage() }}</p>
        }
      </section>
    }
  `,
})
export class UpdateNoticesComponent implements OnInit {
  readonly placement = input<'sidebar' | 'page'>('sidebar');
  readonly updates = inject(UpdatesService);
  private readonly schedule = inject(EveningStopService);
  readonly whatsNew = computed(() =>
    this.schedule.notices().length ? undefined : this.updates.whatsNew(),
  );
  readonly copied = signal('');
  readonly error = signal('');
  readonly errorMessage = signal('');
  ngOnInit(): void {
    void this.updates.start();
  }
  async openReleaseNotes(event: Event, notice: UpdateNotice): Promise<void> {
    event.preventDefault();
    try {
      await wailsApi.openUrlInDefaultBrowser(notice.releaseUrl);
      this.error.set('');
    } catch (error) {
      console.warn('Could not open release notes', error);
      this.error.set(notice.kind);
      this.errorMessage.set(
        'Could not open release notes. Copy the link address and open it in your browser.',
      );
    }
  }
  async copyCommand(notice: UpdateNotice): Promise<void> {
    try {
      await navigator.clipboard.writeText(notice.command);
      this.copied.set(notice.kind);
      this.error.set('');
    } catch {
      this.error.set(notice.kind);
      this.errorMessage.set('Could not copy the command. Select the text above to copy it.');
    }
  }
}
