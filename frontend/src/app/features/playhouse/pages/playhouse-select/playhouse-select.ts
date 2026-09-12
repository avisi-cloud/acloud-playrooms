import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { PageLoadingService } from '../../../../core/services/page-loading';
import { PlayhouseJobsService } from '../../../../core/services/playhouse-jobs';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import {
  PlayhouseCreateInput,
  PlayhouseDeleteInput,
  wailsApi,
} from '../../../../core/services/wails-api';
import { ConfirmDeleteDialog } from '../../../../shared/components';
import { DEFAULTS } from '../../../../shared/data';
import { PlayhouseEntry } from '../../../../shared/models';
import { explainFailure, FailureExplanation } from '../../../../shared/utils';
import { CreatePlayhouseDrawerComponent } from '../../components/create-playhouse-drawer/create-playhouse-drawer';

/** How often to re-read the list while a create or delete is in flight. */
const BACKGROUND_POLL_MS = 15000;

/**
 * Playhouse manager: lists playhouses, selects the active one, and renders the
 * create and delete jobs that PlayhouseJobsService keeps running.
 */
@Component({
  selector: 'app-playhouse-select-page',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    TagModule,
    ToggleSwitchModule,
    ConfirmDeleteDialog,
    CreatePlayhouseDrawerComponent,
  ],
  templateUrl: './playhouse-select.html',
  styleUrl: './playhouse-select.css',
})
export class PlayhouseSelectPageComponent implements OnDestroy {
  private readonly router = inject(Router);
  readonly state = inject(PlayroomStateService);
  readonly jobs = inject(PlayhouseJobsService);
  private readonly pageLoading = inject(PageLoadingService);

  /** Backend-generated, so the dialog shows the arguments that will actually run. */
  readonly previewDelete = wailsApi.previewDeletePlayhouse;

  playhouses = signal<PlayhouseEntry[]>([]);
  /** Why the list could not be read, in the two parts a toast shows it in. */
  failure = signal<FailureExplanation | null>(null);

  /**
   * `loading` is the first read, which owns the whole screen; `refreshing` is
   * every read after it, which must not.
   */
  loading = signal(true);
  refreshing = signal(false);

  /** Tracked creations not in the list yet, so the UI can show a placeholder. */
  readonly provisioningSlugs = computed<string[]>(() => {
    const known = new Set(this.playhouses().map((playhouse) => playhouse.Slug));
    return this.jobs.provisioning().filter((slug) => !known.has(slug));
  });

  showCreate = false;

  showDelete = false;
  deleteTarget: PlayhouseEntry | null = null;
  deleteForce = false;
  deleteNoWait = false;
  deleteTimeout = DEFAULTS.waitTimeout;

  private backgroundPoll: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Loads on open and on every scope switch. An effect rather than ngOnInit,
    // which a switch made on this screen would never fire again.
    effect(() => {
      this.state.scopeRevision();
      untracked(() => void this.refreshPlayhouses());
    });

    // A finished create or delete means the platform's view has changed.
    effect(() => {
      this.jobs.completed();
      untracked(() => void this.refreshPlayhouses(true));
    });

    // Poll only while something is in flight, wherever it was started from.
    effect(() => {
      if (this.jobs.busy()) untracked(() => this.startBackgroundPoll());
      else untracked(() => this.stopBackgroundPoll());
    });
  }

  ngOnDestroy(): void {
    this.stopBackgroundPoll();
  }

  /**
   * Reloads the list, dropping re-entrant calls. `background` marks the reads
   * nobody asked for, which stay out of the shell indicator.
   */
  async refreshPlayhouses(background = false): Promise<void> {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    this.failure.set(null);
    try {
      this.playhouses.set(
        await this.pageLoading.runAndShowIndicatorIf(!background, () => wailsApi.listPlayhouses()),
      );
    } catch (e) {
      // Normalised: this used to be the raw value, and a failed backend call
      // printed an entire HTML error document into the centred error state.
      this.failure.set(explainFailure(e));
    } finally {
      this.refreshing.set(false);
      this.loading.set(false);
    }
  }

  selectPlayhouse(slug: string): void {
    this.state.selectPlayhouse(slug);
    void this.router.navigate(['/rooms']);
  }

  selectedPlayhouse(): PlayhouseEntry | null {
    const selected = this.state.playhouse();
    if (!selected) return null;
    return this.playhouses().find((playhouse) => playhouse.Slug === selected) ?? null;
  }

  isDeleting(slug: string): boolean {
    return this.jobs.isDeleting(slug);
  }

  statusSeverity(status: string): 'success' | 'warn' | 'danger' | 'secondary' {
    const s = status.toLowerCase();
    if (s === 'active' || s === 'ready' || s === 'running') return 'success';
    if (s === 'pending' || s === 'provisioning' || s === 'creating' || s === 'deleting')
      return 'warn';
    if (s === 'failed' || s === 'error' || s === 'deleted') return 'danger';
    return 'secondary';
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  openCreate(): void {
    this.showCreate = true;
  }

  onCreate(event: { input: Partial<PlayhouseCreateInput>; slug: string }): void {
    this.jobs.create(event.slug, event.input);
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  askDelete(playhouse: PlayhouseEntry, event: MouseEvent): void {
    event.stopPropagation();
    this.deleteTarget = playhouse;
    this.deleteForce = false;
    this.deleteNoWait = false;
    this.deleteTimeout = DEFAULTS.waitTimeout;
    this.showDelete = true;
  }

  /** One description of the delete, used by both the preview and the call. */
  deleteInput(): Partial<PlayhouseDeleteInput> {
    return {
      Name: this.deleteTarget?.Slug ?? '',
      Force: this.deleteForce,
      NoWait: this.deleteNoWait,
      WaitTimeout: this.deleteTimeout,
    };
  }

  confirmDelete(): void {
    const target = this.deleteTarget;
    if (!target) return;
    const slug = target.Slug;
    const input = this.deleteInput();

    // Done from the user's side once initiated: close the dialog, mark the row
    // "deleting", and let it finish in the background.
    this.showDelete = false;
    if (this.state.playhouse() === slug) this.state.selectPlayhouse('');
    this.jobs.delete(slug, input);
  }

  // ── Background polling ──────────────────────────────────────────────────────

  private startBackgroundPoll(): void {
    if (this.backgroundPoll) return;
    this.backgroundPoll = setInterval(() => {
      void this.refreshPlayhouses(true);
    }, BACKGROUND_POLL_MS);
  }

  private stopBackgroundPoll(): void {
    if (!this.backgroundPoll) return;
    clearInterval(this.backgroundPoll);
    this.backgroundPoll = null;
  }
}
