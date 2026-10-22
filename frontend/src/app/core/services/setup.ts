import { Injectable, computed, inject, signal } from '@angular/core';
import { ToolStatus } from '../../shared/models';
import { installWasSetUpBeforeSetupExisted, readCache, updateCache } from '../../shared/utils';
import { AcloudSessionService } from './acloud-session';
import { PlayroomStateService } from './playroom-state';

/** The setup steps, in the order the screen shows them. */
export type SetupStepKey =
  | 'welcome'
  | 'acloud'
  | 'login'
  | 'playhouse'
  | 'tools'
  | 'defaults'
  | 'done';

export type SetupStepStatus = 'done' | 'needs-action' | 'optional';

/** The status of every step that has something to check. */
export interface SetupStepStatuses {
  acloud: SetupStepStatus;
  login: SetupStepStatus;
  playhouse: SetupStepStatus;
  tools: SetupStepStatus;
  defaults: SetupStepStatus;
}

/**
 * What a new install needs before its first playroom, read from the services
 * that already hold each part, and whether setup was finished once.
 */
@Injectable({ providedIn: 'root' })
export class SetupService {
  private readonly session = inject(AcloudSessionService);
  private readonly state = inject(PlayroomStateService);

  private readonly _setupCompleted = signal<boolean>(false);
  readonly setupCompleted = this._setupCompleted.asReadonly();

  readonly stepStatuses = computed<SetupStepStatuses>(() => ({
    acloud: this.session.binary()?.Found === true ? 'done' : 'needs-action',
    login: this.state.loggedIn() ? 'done' : 'needs-action',
    playhouse: this.state.playhouse() ? 'done' : 'needs-action',
    tools: everyToolIsInstalled(this.session.toolStatuses()) ? 'done' : 'optional',
    defaults: 'optional',
  }));

  constructor() {
    // Setup is for new installs: an upgrade must not walk a working install through it.
    if (installWasSetUpBeforeSetupExisted()) updateCache({ setupCompleted: true });
    this._setupCompleted.set(readCache().setupCompleted);
  }

  markSetupCompleted(): void {
    this._setupCompleted.set(true);
    updateCache({ setupCompleted: true });
  }

  /** Read from the cache alone, so a fresh install opens on setup without another screen first. */
  pathToOpenAtLaunch(): '/setup' | '/rooms' {
    return this._setupCompleted() ? '/rooms' : '/setup';
  }

  /** A missing playhouse is left out: playhouseGuard already sends that to the playhouse screen. */
  requiredStepThatBrokeSinceSetup(): 'acloud' | 'login' | null {
    if (!this._setupCompleted()) return null;
    if (this.session.acloudIsMissing()) return 'acloud';
    if (!this.state.loggedIn()) return 'login';
    return null;
  }
}

/** An empty list has not been read yet, which is not the same as nothing missing. */
function everyToolIsInstalled(tools: ToolStatus[]): boolean {
  return tools.length > 0 && tools.every((tool) => tool.State === 'installed');
}
