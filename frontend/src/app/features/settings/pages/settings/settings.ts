import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
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

  runSetupAgain(): void {
    void this.router.navigate(['/setup']);
  }
}
