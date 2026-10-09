import { Injectable, computed, inject, signal } from '@angular/core';
import { ToolStatus } from '../../shared/models';
import { CliConsoleService } from './cli-console';
import { preferredTerminal } from './playroom-lifecycle';
import { AcloudBinaryStatus, AcloudCompatibility, wailsApi } from './wails-api';
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
  private readonly _binary = signal<AcloudBinaryStatus | null>(null);

  readonly version = this._version.asReadonly();
  readonly toolStatuses = this._toolStatuses.asReadonly();
  readonly signingInOrOut = this._signingInOrOut.asReadonly();

  /**
   * Which acloud the app runs, or why there is none. Null only before the first
   * read lands.
   */
  readonly binary = this._binary.asReadonly();

  /**
   * Whether acloud is missing, which makes every screen empty. Screens use this
   * to explain the cause instead of showing "nothing here", and the sidebar to
   * offer the way out.
   */
  readonly acloudIsMissing = computed<boolean>(() => this._binary()?.Found === false);

  /**
   * Set only when the running acloud is newer than the version this GUI was
   * verified against. Null the rest of the time, unreadable versions included.
   */
  readonly compatibility = this._compatibility.asReadonly();

  /**
   * Everything the sidebar reports about the local installation. The binary is
   * read first and on its own: the version and compatibility reads both run
   * `acloud version`, so without it they fail and have nothing to say.
   */
  async loadInstallationFacts(): Promise<void> {
    await this.loadBinaryStatus();
    await Promise.all([
      this.loadAcloudVersion(),
      this.loadCompatibilityWarning(),
      this.loadToolStatuses(),
    ]);
  }

  /**
   * Re-reads which acloud is in use. Called at startup, and again after the
   * path is changed in the settings.
   */
  async loadBinaryStatus(): Promise<void> {
    try {
      this._binary.set(await wailsApi.getAcloudBinaryStatus());
    } catch {
      // The binding itself failing is not the same as acloud being missing, and
      // claiming it is missing would send the user to fix the wrong thing.
      this._binary.set(null);
    }
  }

  /** Records a status the settings screen already has, to save a round trip. */
  setBinaryStatus(status: AcloudBinaryStatus): void {
    this._binary.set(status);
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
