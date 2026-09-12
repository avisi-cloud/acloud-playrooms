import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PlayroomStateService } from '../services/playroom-state';
import { wailsApi } from '../services/wails-api';

export const playhouseGuard: CanActivateFn = async () => {
  const state = inject(PlayroomStateService);
  const router = inject(Router);

  if (state.playhouse()) return true;

  try {
    const cached = await wailsApi.getCachedPlayhouse();
    if (cached) {
      state.selectPlayhouse(cached);
      return true;
    }
  } catch {
    // fall through to redirect
  }

  return router.createUrlTree(['/playhouse']);
};
