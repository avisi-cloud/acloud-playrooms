import { PageHeadingDirective } from '../../../../shared/directives/page-heading';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { AcloudSessionService } from '../../../../core/services/acloud-session';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { ToastService } from '../../../../core/services/toast';
import { HealthCheck, wailsApi } from '../../../../core/services/wails-api';
import { HealthAction, HealthStatus } from '../../../../shared/models';
import { copyToClipboard, describeError, readCache } from '../../../../shared/utils';
import { describeHealthChecks, tailscaleUseInPlayhouse } from './health-check-results';

const STATUS_SEVERITY: Record<HealthStatus, 'success' | 'warn' | 'danger' | 'secondary'> = {
  passed: 'success',
  warning: 'warn',
  failed: 'danger',
  unknown: 'secondary',
  skipped: 'secondary',
};

const STATUS_ICON: Record<HealthStatus, string> = {
  passed: 'pi-check-circle',
  warning: 'pi-exclamation-triangle',
  failed: 'pi-times-circle',
  unknown: 'pi-question-circle',
  skipped: 'pi-minus-circle',
};

const ACTION_LABEL: Record<Exclude<HealthAction, ''>, string> = {
  'open-settings': 'Open Settings',
  'sign-in': 'Sign in',
};

/** Checks everything a working connection needs, with a fix for each problem. */
@Component({
  selector: 'app-health-check-page',
  imports: [PageHeadingDirective, ButtonModule, TagModule],
  templateUrl: './health-check.html',
  styleUrl: './health-check.css',
})
export class HealthCheckPageComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly session = inject(AcloudSessionService);
  private readonly state = inject(PlayroomStateService);
  private readonly notify = inject(ToastService);

  readonly checks = signal<HealthCheck[]>([]);
  readonly running = signal(false);
  readonly problem = signal('');
  readonly signingIn = this.session.signingInOrOut;
  private readonly appVersion = signal('');

  readonly checksNeedingAttention = computed(
    () =>
      this.checks().filter((check) => check.Status === 'failed' || check.Status === 'warning')
        .length,
  );

  ngOnInit(): void {
    void this.runChecks();
    wailsApi.getAppVersion().then(
      (version) => this.appVersion.set(version),
      (error: unknown) => console.error('Could not read the app version', error),
    );
  }

  async runChecks(): Promise<void> {
    if (this.running()) return;
    this.running.set(true);
    this.problem.set('');
    try {
      const cache = readCache();
      const tailscaleUse = tailscaleUseInPlayhouse(
        this.state.playhouse(),
        this.state.roomsLoadedFor(),
        this.state.rooms(),
      );
      this.checks.set(
        await wailsApi.checkHealth({
          // The same choices the connect dialog opens with.
          Terminal: cache.lastTerminal || 'terminal',
          Editor: cache.lastEditor || 'vscode',
          CheckTailscale: tailscaleUse !== 'not-used',
        }),
      );
    } catch (error) {
      this.problem.set(describeError(error));
    } finally {
      this.running.set(false);
    }
  }

  statusSeverity(check: HealthCheck): 'success' | 'warn' | 'danger' | 'secondary' {
    return STATUS_SEVERITY[check.Status as HealthStatus] ?? 'secondary';
  }

  statusIcon(check: HealthCheck): string {
    return STATUS_ICON[check.Status as HealthStatus] ?? STATUS_ICON.unknown;
  }

  actionLabel(check: HealthCheck): string {
    const action = check.Action as HealthAction;
    return action ? ACTION_LABEL[action] : '';
  }

  async runAction(check: HealthCheck): Promise<void> {
    switch (check.Action as HealthAction) {
      case 'open-settings':
        void this.router.navigate(['/settings']);
        return;
      case 'sign-in':
        await this.signIn();
        return;
    }
  }

  async copyCommand(command: string): Promise<void> {
    await copyToClipboard(command);
    this.notify.toast('Copied the command', 'ok');
  }

  async copyResults(): Promise<void> {
    await copyToClipboard(describeHealthChecks(this.checks(), this.appVersion()));
    this.notify.toast('Copied the health check results', 'ok');
  }

  goBack(): void {
    void this.router.navigate(['/settings']);
  }

  private async signIn(): Promise<void> {
    try {
      const signedIn = await this.session.signInThroughTerminal(() =>
        this.notify.toast('Finish signing in in your terminal', 'busy'),
      );
      if (!signedIn) this.notify.toast('Not signed in yet. Try again.', 'warn');
    } catch (error) {
      this.notify.failure('Could not start the sign-in', error);
    }
    await this.runChecks();
  }
}
