import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { ToastService } from '../../../../core/services/toast';
import { T3CodePathStatus, wailsApi } from '../../../../core/services/wails-api';
import { explainFailure } from '../../../../shared/utils';

@Component({
  selector: 'app-t3-code-path',
  imports: [FormsModule, ButtonModule, InputTextModule, TagModule],
  templateUrl: './t3-code-path.html',
  styleUrl: '../../../../shared/styles/_binary-card.css',
})
export class T3CodePathCardComponent implements OnInit {
  private readonly notify = inject(ToastService);
  readonly status = signal<T3CodePathStatus | null>(null);
  readonly checking = signal(false);
  readonly saving = signal(false);
  readonly draft = signal('');
  readonly problem = signal('');
  readonly expanded = signal(false);
  readonly found = computed(() => this.status()?.Found === true);
  readonly hasSavedPath = computed(() => this.status()?.Source === 'configured');
  readonly canSave = computed(
    () =>
      !this.saving() &&
      !this.checking() &&
      !!this.draft().trim() &&
      (!this.found() || this.draft().trim() !== this.status()?.ConfiguredPath),
  );

  async ngOnInit(): Promise<void> {
    await this.refresh();
    this.expanded.set(!!this.problem() || (this.hasSavedPath() && !this.found()));
  }

  stateLabel(): string {
    if (this.checking()) return 'checking';
    const status = this.status();
    if (!status) return 'unknown';
    if (this.found()) return status.Version ? `v${status.Version}` : 'found';
    return this.hasSavedPath() ? 'path unavailable' : 'optional';
  }

  stateSeverity(): 'success' | 'danger' | 'secondary' {
    if (this.found()) return 'success';
    return this.hasSavedPath() ? 'danger' : 'secondary';
  }

  async refresh(): Promise<boolean> {
    this.checking.set(true);
    this.problem.set('');
    try {
      const status = await wailsApi.getT3CodePathStatus();
      this.status.set(status);
      this.draft.set(status.ConfiguredPath || status.Path || '');
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
      const chosen = await wailsApi.browseForT3CodePath();
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
      await wailsApi.setT3CodePath(this.draft().trim());
      if (!(await this.refresh())) return;
      this.notify.toast('T3 Code path saved', 'ok');
      this.expanded.set(false);
    } catch (error) {
      this.problem.set(explainFailure(error).problem);
    } finally {
      this.saving.set(false);
    }
  }

  async useAutomatic(): Promise<void> {
    if (this.saving() || this.checking()) return;
    this.saving.set(true);
    this.problem.set('');
    try {
      await wailsApi.clearT3CodePath();
      if (!(await this.refresh())) return;
      this.notify.toast(
        this.found() ? 'Found T3 Code automatically' : 'Cleared the saved T3 Code path',
        'ok',
      );
    } catch (error) {
      this.problem.set(explainFailure(error).problem);
    } finally {
      this.saving.set(false);
    }
  }
}
