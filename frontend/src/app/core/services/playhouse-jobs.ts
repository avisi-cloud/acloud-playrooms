import { Injectable, computed, inject, signal } from '@angular/core';
import { CliConsoleService } from './cli-console';
import { ToastService } from './toast';
import { PlayhouseCreateInput, PlayhouseDeleteInput, wailsApi } from './wails-api';

/**
 * Playhouse creates and deletes that outlive the screen that started them. A
 * root service, so the screen is a view of the work rather than its owner.
 */
@Injectable({ providedIn: 'root' })
export class PlayhouseJobsService {
  private readonly console = inject(CliConsoleService);
  private readonly notify = inject(ToastService);

  private readonly _provisioning = signal<string[]>([]);
  private readonly _deleting = signal<string[]>([]);

  /** Slugs currently being created. */
  readonly provisioning = this._provisioning.asReadonly();
  /** Slugs currently being deleted. */
  readonly deleting = this._deleting.asReadonly();

  /** Whether anything is in flight, i.e. whether the list is worth polling. */
  readonly busy = computed(() => this._provisioning().length > 0 || this._deleting().length > 0);

  /**
   * A revision that ticks whenever a job finishes, so a screen can refresh
   * without this service needing to know it exists.
   */
  private readonly _completed = signal(0);
  readonly completed = this._completed.asReadonly();

  isDeleting(slug: string): boolean {
    return this._deleting().includes(slug);
  }

  /** Starts a create and returns immediately; progress goes to the log. */
  create(slug: string, input: Partial<PlayhouseCreateInput>): void {
    if (this._provisioning().includes(slug)) return;
    this._provisioning.update((list) => [...list, slug]);
    this.notify.show({
      severity: 'info',
      summary: 'Provisioning playhouse',
      detail: `Creating ${slug}. This can take up to ~20 minutes — you can keep working; it'll appear in the list as it comes up.`,
      life: 8000,
    });
    void this.run(
      `Creating playhouse "${slug}"`,
      (operationId) => wailsApi.createPlayhouse(operationId, input),
      (operationId) =>
        this.notify.show({
          severity: 'success',
          summary: 'Playhouse ready',
          detail: `${slug} is ready.`,
          life: 5000,
          data: { operationId },
        }),
      (operationId, error) =>
        this.notify.failure(`Could not create playhouse "${slug}"`, error, operationId),
      () => this._provisioning.update((list) => list.filter((trackedSlug) => trackedSlug !== slug)),
    );
  }

  /** Starts a delete and returns immediately; progress goes to the log. */
  delete(slug: string, input: Partial<PlayhouseDeleteInput>): void {
    if (this._deleting().includes(slug)) return;
    this._deleting.update((list) => [...list, slug]);
    this.notify.show({
      severity: 'info',
      summary: 'Deleting playhouse',
      detail: `${slug} is being deleted. You can keep working; it'll disappear from the list once it's gone.`,
      life: 6000,
    });
    void this.run(
      `Deleting playhouse "${slug}"`,
      (operationId) => wailsApi.deletePlayhouse(operationId, input),
      (operationId) =>
        this.notify.show({
          severity: 'success',
          summary: 'Playhouse deleted',
          detail: `${slug} was deleted.`,
          life: 5000,
          data: { operationId },
        }),
      (operationId, error) =>
        this.notify.failure(`Could not delete playhouse "${slug}"`, error, operationId),
      () => this._deleting.update((list) => list.filter((trackedSlug) => trackedSlug !== slug)),
    );
  }

  /** The shared shape of both jobs: run, report, untrack, announce completion. */
  private async run(
    title: string,
    action: (operationId: string) => Promise<void>,
    onSuccess: (operationId: string) => void,
    onFailure: (operationId: string, error: unknown) => void,
    untrack: () => void,
  ): Promise<void> {
    let startedOperationId = '';
    try {
      await this.console.run(title, (operationId) => {
        startedOperationId = operationId;
        return action(operationId);
      });
      onSuccess(startedOperationId);
    } catch (error) {
      onFailure(startedOperationId, error);
    } finally {
      untrack();
      this._completed.update((count) => count + 1);
    }
  }
}
