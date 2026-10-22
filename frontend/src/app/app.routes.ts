import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { playhouseGuard } from './core/guards/playhouse-guard';
import { SetupService } from './core/services/setup';

export const routes: Routes = [
  // The window opens on '' and nothing navigates there later, so this decides at launch only.
  { path: '', redirectTo: () => inject(SetupService).pathToOpenAtLaunch(), pathMatch: 'full' },
  {
    path: 'setup',
    loadComponent: () =>
      import('./features/setup/pages/setup/setup').then((module) => module.SetupPageComponent),
  },
  {
    path: 'playhouse',
    loadComponent: () =>
      import('./features/playhouse/pages/playhouse-select/playhouse-select').then(
        (module) => module.PlayhouseSelectPageComponent,
      ),
  },
  {
    path: 'rooms',
    loadComponent: () =>
      import('./features/playroom/pages/rooms/rooms').then((module) => module.RoomsPageComponent),
    canActivate: [playhouseGuard],
  },
  {
    path: 'rooms/:name',
    loadComponent: () =>
      import('./features/playroom/pages/room-detail/room-detail').then(
        (module) => module.RoomDetailPageComponent,
      ),
    canActivate: [playhouseGuard],
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/defaults/pages/defaults/defaults').then(
        (module) => module.DefaultsPageComponent,
      ),
  },
  { path: '**', redirectTo: '/rooms' },
];
