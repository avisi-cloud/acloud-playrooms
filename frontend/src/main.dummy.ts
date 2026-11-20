import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { updateCache } from './app/shared/utils/cache';

// The data adapter resets on reload, so reset navigation to the same sample scope.
// Appearance and other preview preferences remain in the isolated dummy cache.
updateCache({ lastPlayhouse: 'playhouse-platform-dev', lastPlayroom: '', setupCompleted: true });
bootstrapApplication(App, appConfig).catch((err) => console.error(err));
