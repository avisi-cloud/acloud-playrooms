import { EveningStopService } from '../../../../core/services/evening-stop';
import { InputTextModule } from 'primeng/inputtext';
import { EnvironmentService } from '../../../../core/services/environment';
import { DesktopNotificationsService } from '../../../../core/services/desktop-notifications';
import { MenuBarService } from '../../../../core/services/menu-bar';
import { DockBadge } from '../../../../shared/models';
import { Component, inject } from '@angular/core';
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
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class SettingsPageComponent {
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
  private readonly router = inject(Router);

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
