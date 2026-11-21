import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { playhouseGuard } from './core/guards/playhouse-guard';
import { SetupService } from './core/services/setup';

export const routes: Routes = [
  // The window opens on '' and nothing navigates there later, so this decides at launch only.
  { path: '', redirectTo: () => inject(SetupService).pathToOpenAtLaunch(), pathMatch: 'full' },
  {
    path: 'setup',
    title: 'Setup',
    loadComponent: () =>
      import('./features/setup/pages/setup/setup').then((module) => module.SetupPageComponent),
  },
  {
    path: 'playhouse',
    title: 'Playhouses',
    loadComponent: () =>
      import('./features/playhouse/pages/playhouse-select/playhouse-select').then(
        (module) => module.PlayhouseSelectPageComponent,
      ),
  },
  {
    path: 'rooms',
    title: 'Playrooms',
    loadComponent: () =>
      import('./features/playroom/pages/rooms/rooms').then((module) => module.RoomsPageComponent),
    canActivate: [playhouseGuard],
  },
  {
    path: 'rooms/:name',
    title: 'Playrooms',
    loadComponent: () =>
      import('./features/playroom/pages/room-detail/room-detail').then(
        (module) => module.RoomDetailPageComponent,
      ),
    canActivate: [playhouseGuard],
  },
  {
    path: 'defaults',
    title: 'Defaults',
    loadComponent: () =>
      import('./features/defaults/pages/defaults/defaults').then(
        (module) => module.DefaultsPageComponent,
      ),
  },
  {
    path: 'settings',
    title: 'Settings',
    loadComponent: () =>
      import('./features/settings/pages/settings/settings').then(
        (module) => module.SettingsPageComponent,
      ),
  },
  {
    path: 'settings/health',
    title: 'Health check',
    loadComponent: () =>
      import('./features/settings/pages/health-check/health-check').then(
        (module) => module.HealthCheckPageComponent,
      ),
  },
  { path: '**', redirectTo: '/rooms' },
];
