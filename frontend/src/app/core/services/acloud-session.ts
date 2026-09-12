import { Injectable, inject, signal } from '@angular/core';
import { ToolStatus } from '../../shared/models';
import { CliConsoleService } from './cli-console';
import { preferredTerminal } from './playroom-lifecycle';
import { AcloudCompatibility, wailsApi } from './wails-api';
import { PlayroomStateService } from './playroom-state';

/** How long to wait for an interactive login to land, and how often to look. */
const LOGIN_TIMEOUT_MS = 120_000;
const LOGIN_POLL_MS = 2_000;

/**
 * What the GUI knows about the acloud it is running inside, and who is signed
 * in to it. All of it read from the local installation, not from a command.
 */
@Injectable({ providedIn: 'root' })
export class AcloudSessionService {
  private readonly state = inject(PlayroomStateService);
  private readonly console = inject(CliConsoleService);

  private readonly _version = signal<string>('');
  private readonly _compatibility = signal<AcloudCompatibility | null>(null);
  private readonly _toolStatuses = signal<ToolStatus[]>([]);
  private readonly _signingInOrOut = signal<boolean>(false);

  readonly version = this._version.asReadonly();
  readonly toolStatuses = this._toolStatuses.asReadonly();
  readonly signingInOrOut = this._signingInOrOut.asReadonly();

  /**
   * Set only when the running acloud is newer than the version this GUI was
   * verified against. Null the rest of the time, unreadable versions included.
   */
  readonly compatibility = this._compatibility.asReadonly();

  /** Everything the sidebar reports about the local installation. */
  async loadInstallationFacts(): Promise<void> {
    await Promise.all([
      this.loadAcloudVersion(),
      this.loadCompatibilityWarning(),
      this.loadToolStatuses(),
    ]);
  }

  private async loadAcloudVersion(): Promise<void> {
    try {
      this._version.set(await wailsApi.getAcloudVersion());
    } catch {
      this._version.set('');
    }
  }

  private async loadCompatibilityWarning(): Promise<void> {
    try {
      const compatibility = await wailsApi.getAcloudCompatibility();
      this._compatibility.set(
        compatibility.RunningVersionIsNewerThanVerified ? compatibility : null,
      );
    } catch {
      this._compatibility.set(null);
    }
  }

  private async loadToolStatuses(): Promise<void> {
    try {
      this._toolStatuses.set(await wailsApi.getToolStatuses());
    } catch {
      this._toolStatuses.set([
        {
          Name: 'Tailscale',
          Command: 'tailscale',
          State: 'unknown',
          Path: '',
          Message: 'Could not check tailscale',
        },
        { Name: 'SSH', Command: 'ssh', State: 'unknown', Path: '', Message: 'Could not check ssh' },
      ]);
    }
  }

  /**
   * Re-reads the stored credentials and the email they belong to, after
   * anything that can change who is signed in.
   */
  async refreshSignedInUser(): Promise<void> {
    let signedIn = false;
    try {
      signedIn = await wailsApi.isLoggedIn();
    } catch {
      signedIn = false;
    }
    this.state.setLoggedIn(signedIn);

    if (!signedIn) {
      this.state.setUser('');
      return;
    }
    try {
      this.state.setUser(await wailsApi.getCurrentUserEmail());
    } catch {
      this.state.setUser('');
    }
  }

  /**
   * Opens the interactive login in the user's terminal and returns immediately,
   * so this is not success — `waitForCredentialsToAppear` is the other half.
   */
  async openLoginInTerminal(): Promise<void> {
    await wailsApi.loginWithTerminal(preferredTerminal());
  }

  /**
   * Polls the stored credentials until a login lands, and reports whether one
   * did. LOGIN_TIMEOUT_MS is generous for an OIDC round-trip.
   */
  async waitForCredentialsToAppear(): Promise<boolean> {
    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, LOGIN_POLL_MS));
      await this.refreshSignedInUser();
      if (this.state.loggedIn()) return true;
    }
    await this.refreshSignedInUser();
    return this.state.loggedIn();
  }

  /** Runs `acloud auth logout`, clearing the stored credentials. */
  async signOut(): Promise<void> {
    await this.console.run('Signing out', (operationId) => wailsApi.logout(operationId));
    await this.refreshSignedInUser();
  }

  /** Marks a sign-in or sign-out as in progress, so the account button waits. */
  markSigningInOrOut(busy: boolean): void {
    this._signingInOrOut.set(busy);
  }
}
