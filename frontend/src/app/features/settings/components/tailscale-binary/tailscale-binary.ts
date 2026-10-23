import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { AcloudSessionService } from '../../../../core/services/acloud-session';
import { ToastService } from '../../../../core/services/toast';
import { TailscaleBinaryStatus, wailsApi } from '../../../../core/services/wails-api';
import { explainFailure } from '../../../../shared/utils';

/** Settings owns the remembered Tailscale executable. */
@Component({
  selector: 'app-tailscale-binary',
  imports: [FormsModule, ButtonModule, InputTextModule, TagModule],
  templateUrl: './tailscale-binary.html',
  styleUrl: '../../../../shared/styles/_binary-card.css',
})
export class TailscaleBinaryCardComponent implements OnInit {
  private readonly session = inject(AcloudSessionService);
  private readonly notify = inject(ToastService);
  readonly status = signal<TailscaleBinaryStatus | null>(null);
  readonly checking = signal(false);
  readonly saving = signal(false);
  readonly draft = signal('');
  readonly problem = signal('');
  readonly expanded = signal(false);
  readonly found = computed(() => this.status()?.Found === true);
  readonly hasSavedPath = computed(() => !!this.status()?.ConfiguredPath);
  readonly canSave = computed(
    () =>
      !this.saving() &&
      !this.checking() &&
      !!this.draft().trim() &&
      (!this.found() || this.draft().trim() !== this.status()?.ConfiguredPath),
  );

  async ngOnInit(): Promise<void> {
    await this.refresh();
    this.expanded.set(!this.found());
  }

  stateLabel(): string {
    const status = this.status();
    if (!status) return this.checking() ? 'checking' : 'unknown';
    if (!status.Found) return 'not found';
    return status.Version ? `v${status.Version}` : 'found';
  }

  stateSeverity(): 'success' | 'danger' | 'secondary' {
    if (!this.status()) return 'secondary';
    return this.found() ? 'success' : 'danger';
  }

  sourceLabel(): string {
    switch (this.status()?.Source) {
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

  async refresh(): Promise<boolean> {
    this.checking.set(true);
    this.problem.set('');
    try {
      const status = await wailsApi.getTailscaleBinaryStatus();
      this.status.set(status);
      this.draft.set(status.ConfiguredPath || status.Path || '');
      await this.session.refreshToolStatuses();
      return true;
    } catch (error) {
      this.problem.set(explainFailure(error).problem);
      return false;
    } finally {
      this.checking.set(false);
    }
  }

  async browse(): Promise<void> {
    if (this.saving() || this.checking()) return;
    try {
      const chosen = await wailsApi.browseForTailscaleBinary();
      if (!chosen) return;
      this.draft.set(chosen);
      await this.save();
    } catch (error) {
      this.notify.failure('Could not open the file picker', error);
    }
  }

  async save(): Promise<void> {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.problem.set('');
    try {
      await wailsApi.setTailscaleBinary(this.draft().trim());
      if (!(await this.refresh())) return;
      this.notify.toast('Tailscale path saved', 'ok');
      this.expanded.set(false);
    } catch (error) {
      this.problem.set(explainFailure(error).problem);
    } finally {
      this.saving.set(false);
    }
  }

  async useAutomatic(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.problem.set('');
    try {
      await wailsApi.clearTailscaleBinary();
      if (!(await this.refresh())) return;
      this.notify.toast(
        this.found() ? 'Found Tailscale automatically' : 'Cleared the saved Tailscale path',
        this.found() ? 'ok' : 'warn',
      );
    } catch (error) {
      this.problem.set(explainFailure(error).problem);
    } finally {
      this.saving.set(false);
    }
  }
}
