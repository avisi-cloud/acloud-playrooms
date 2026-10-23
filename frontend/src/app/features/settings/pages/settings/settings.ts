import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AcloudBinaryCardComponent } from '../../components/acloud-binary/acloud-binary';
import { TailscaleBinaryCardComponent } from '../../components/tailscale-binary/tailscale-binary';
import { T3CodePathCardComponent } from '../../components/t3-code-path/t3-code-path';

@Component({
  selector: 'app-settings-page',
  imports: [
    ButtonModule,
    AcloudBinaryCardComponent,
    TailscaleBinaryCardComponent,
    T3CodePathCardComponent,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class SettingsPageComponent {
  private readonly router = inject(Router);

  goBack(): void {
    void this.router.navigate(['/rooms']);
  }

  runSetupAgain(): void {
    void this.router.navigate(['/setup']);
  }
}
