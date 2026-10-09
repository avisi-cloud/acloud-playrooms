import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { AcloudSessionService } from '../../../../core/services/acloud-session';
import { ToastService } from '../../../../core/services/toast';
import { AcloudBinaryStatus, wailsApi } from '../../../../core/services/wails-api';
import { explainFailure } from '../../../../shared/utils';

/**
 * Where the acloud command lives, and how to correct it.
 *
 * This must keep working when nothing else does: every other screen is empty
 * without acloud, and the defaults on this very page cannot load either, so an
 * app that only reported the problem would leave no way to fix it. The card
 * therefore renders from its own read and never waits on the defaults.
 */
@Component({
  selector: 'app-acloud-binary',
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, TagModule],
  templateUrl: './acloud-binary.html',
  styleUrl: './acloud-binary.css',
})
export class AcloudBinaryCardComponent implements OnInit {
  private readonly session = inject(AcloudSessionService);
  private readonly notify = inject(ToastService);

  readonly status = signal<AcloudBinaryStatus | null>(null);
  readonly checking = signal(false);
  readonly saving = signal(false);
  /** What is in the text field; starts as whatever is in use. */
  readonly draft = signal('');
  /** Set when a save was refused, shown next to the field rather than only as a toast. */
  readonly problem = signal('');

  /** Expanded by default only when there is something to fix. */
  readonly expanded = signal(false);

  readonly found = computed(() => this.status()?.Found === true);
  readonly pinnedByEnvironment = computed(() => this.status()?.EnvironmentOverride === true);
  readonly hasSavedPath = computed(() => (this.status()?.ConfiguredPath ?? '') !== '');
  readonly canSave = computed(
    () =>
      !this.saving() &&
      !this.pinnedByEnvironment() &&
      this.draft().trim().length > 0 &&
      this.draft().trim() !== this.status()?.ConfiguredPath,
  );

  async ngOnInit(): Promise<void> {
    await this.refresh();
    // Nothing to do when it works: the card stays a collapsed one-liner.
    this.expanded.set(!this.found());
  }

  toggle(): void {
    this.expanded.update((open) => !open);
  }

  /** The badge beside the heading: the state in one word. */
  stateLabel(): string {
    const status = this.status();
    if (!status) return 'checking';
    if (!status.Found) return 'not found';
    return status.Version ? `v${status.Version}` : 'found';
  }

  stateSeverity(): 'success' | 'danger' | 'secondary' {
    if (!this.status()) return 'secondary';
    return this.found() ? 'success' : 'danger';
  }

  /** Where the current binary came from, in words a user can act on. */
  sourceLabel(): string {
    switch (this.status()?.Source) {
      case 'environment':
        return 'ACLOUD_BINARY';
      case 'configured':
        return 'set in this app';
      case 'known-location':
        return 'found by searching';
      case 'path':
        return 'found on PATH';
      default:
        return '';
    }
  }

  async refresh(): Promise<void> {
    this.checking.set(true);
    this.problem.set('');
    try {
      const status = await wailsApi.getAcloudBinaryStatus();
      this.apply(status);
    } catch (error) {
      this.problem.set(explainFailure(error).problem);
    } finally {
      this.checking.set(false);
    }
  }

  /** Opens the native picker, then saves what was chosen. */
  async browse(): Promise<void> {
    let chosen = '';
    try {
      chosen = await wailsApi.browseForAcloudBinary();
    } catch (error) {
      this.notify.failure('Could not open the file picker', error);
      return;
    }
    // An empty path is a cancelled dialog, not a failure.
    if (!chosen) return;
    this.draft.set(chosen);
    await this.save();
  }

  async save(): Promise<void> {
    const path = this.draft().trim();
    if (!path) return;
    this.saving.set(true);
    this.problem.set('');
    try {
      this.apply(await wailsApi.setAcloudBinary(path));
      this.notify.toast(`Using ${path} for acloud commands`, 'ok');
      this.expanded.set(false);
    } catch (error) {
      // Shown in the card, beside the field being corrected, because a toast
      // disappears from the one screen where the user is mid-correction.
      this.problem.set(explainFailure(error).problem);
    } finally {
      this.saving.set(false);
    }
  }

  /** Forgets the saved path and goes back to searching. */
  async useAutomatic(): Promise<void> {
    this.saving.set(true);
    this.problem.set('');
    try {
      const status = await wailsApi.clearAcloudBinary();
      this.apply(status);
      this.notify.toast(
        status.Found ? `Found acloud at ${status.Path}` : 'Cleared the saved acloud path',
        status.Found ? 'ok' : 'warn',
      );
    } catch (error) {
      this.problem.set(explainFailure(error).problem);
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Takes a status as the new truth: it fills the field, and the rest of the app
   * is told, so the sidebar and the empty screens stop saying acloud is missing
   * without waiting for a reload.
   */
  private apply(status: AcloudBinaryStatus): void {
    this.status.set(status);
    this.draft.set(status.ConfiguredPath || status.Path || '');
    this.session.setBinaryStatus(status);
  }
}
