import type { PlayroomTemplate } from '../../../../shared/models/playroom-template';
import { PlayroomTemplatesService } from '../../../../core/services/playroom-templates';
import { UpdatesService } from '../../../../core/services/updates';
import { EveningStopService } from '../../../../core/services/evening-stop';
import { InputTextModule } from 'primeng/inputtext';
import { EnvironmentService } from '../../../../core/services/environment';
import { DesktopNotificationsService } from '../../../../core/services/desktop-notifications';
import { MenuBarService } from '../../../../core/services/menu-bar';
import { DockBadge } from '../../../../shared/models';
import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { SettingsFileService } from '../../../../core/services/settings-file';
import { OverlayFocusDirective } from '../../../../shared/directives';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { PreferredAction } from '../../../../shared/models';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ThemePreference } from '../../../../shared/models';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { AcloudBinaryCardComponent } from '../../components/acloud-binary/acloud-binary';
import { TailscaleBinaryCardComponent } from '../../components/tailscale-binary/tailscale-binary';
import { T3CodePathCardComponent } from '../../components/t3-code-path/t3-code-path';

@Component({
  selector: 'app-settings-page',
  imports: [
    FormsModule,
    InputTextModule,
    SelectModule,
    ButtonModule,
    ToggleSwitchModule,
    AcloudBinaryCardComponent,
    TailscaleBinaryCardComponent,
    T3CodePathCardComponent,
    DialogModule,
    OverlayFocusDirective,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class SettingsPageComponent {
  readonly updates = inject(UpdatesService);

  readonly templates = inject(PlayroomTemplatesService);

  readonly renamingTemplate = signal('');
  readonly templateName = signal('');

  beginTemplateRename(template: PlayroomTemplate): void {
    this.renamingTemplate.set(template.name);
    this.templateName.set(template.name);
    setTimeout(() => {
      const input = document.getElementById('rename-template') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  cancelTemplateRename(): void {
    this.renamingTemplate.set('');
    this.templateName.set('');
  }

  async saveTemplateName(template: PlayroomTemplate): Promise<void> {
    if (await this.templates.renameTemplate(template, this.templateName()))
      this.cancelTemplateRename();
  }

  constructor() {
    void this.templates.loadTemplates();
  }

  readonly schedule = inject(EveningStopService);
  readonly scheduleDays = [
    { label: 'Weekdays', value: 'weekdays' },
    { label: 'Every day', value: 'every-day' },
  ];
  readonly environment = inject(EnvironmentService);
  readonly preferredActionOptions: { label: string; value: PreferredAction }[] = [
    { label: 'Connect', value: 'connect' },
    { label: 'Open in editor', value: 'open' },
    { label: 'Nothing', value: 'nothing' },
  ];
  readonly desktop = inject(DesktopNotificationsService);
  readonly menuBar = inject(MenuBarService);
  readonly dockBadgeOptions: { label: string; value: DockBadge }[] = [
    { label: 'Failed rooms', value: 'failed' },
    { label: 'Running rooms', value: 'running' },
    { label: 'Off', value: 'off' },
  ];
  readonly state = inject(PlayroomStateService);
  readonly themeOptions: { label: string; value: ThemePreference; icon: string }[] = [
    { label: 'Light', value: 'light', icon: 'pi-sun' },
    { label: 'Dark', value: 'dark', icon: 'pi-moon' },
    { label: 'System', value: 'system', icon: 'pi-desktop' },
  ];
  readonly settingsFile = inject(SettingsFileService);
  readonly applyLabel = computed(() => {
    const count = this.settingsFile.pendingImport()?.changes.length ?? 0;
    return count === 1 ? 'Apply 1 change' : `Apply ${count} changes`;
  });
  private readonly acloudBinary = viewChild(AcloudBinaryCardComponent);
  private readonly tailscaleBinary = viewChild(TailscaleBinaryCardComponent);
  private readonly t3CodePath = viewChild(T3CodePathCardComponent);
  private readonly router = inject(Router);

  /** The tool path cards keep their own status, so they read it again after an import. */
  async applyImport(): Promise<void> {
    await this.settingsFile.applyPendingImport();
    await Promise.all([
      this.acloudBinary()?.refresh(),
      this.tailscaleBinary()?.refresh(),
      this.t3CodePath()?.refresh(),
    ]);
  }
  goBack(): void {
    void this.router.navigate(['/rooms']);
  }

  openHealthCheck(): void {
    void this.router.navigate(['/settings/health']);
  }

  runSetupAgain(): void {
    void this.router.navigate(['/setup']);
  }
}
