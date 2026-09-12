import { Routes } from '@angular/router';
import { playhouseGuard } from './core/guards/playhouse-guard';

export const routes: Routes = [
  { path: '', redirectTo: '/rooms', pathMatch: 'full' },
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
