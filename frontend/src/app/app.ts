import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import { ToastModule } from 'primeng/toast';
import { ToolStatus } from './shared/models';
import { CliConsoleComponent } from './shared/components';
import { PlayroomStateService } from './core/services/playroom-state';
import { CliConsoleService } from './core/services/cli-console';
import { ToastService } from './core/services/toast';
import { PageLoadingService } from './core/services/page-loading';
import { AcloudSessionService } from './core/services/acloud-session';
import { ScopeService } from './core/services/scope';
import { WindowChromeService } from './core/services/window-chrome';

/**
 * One full breath of the brand mark: the period of both animations in
 * `app.css`, which must stay in step with this number.
 */
export const BREATH_MS = 5600;

/** How many playhouses the sidebar menu lists before deferring to the screen. */
const PLAYHOUSE_MENU_MAX = 5;

/**
 * The application shell: the sidebar, the routed panel, and the coordination
 * between them. It holds no domain state of its own.
 */
@Component({
  selector: 'app-root',
  // No PrimeNG controls live in the sidebar: on a permanently dark column they
  // take PrimeNG's light-mode hover surface.
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    CommonModule,
    ToastModule,
    MenuModule,
    CliConsoleComponent,
  ],
  templateUrl: './app.html',
  // Component styles, split up rather than one 780-line stylesheet.
  styleUrls: ['./app.css', './app-sidebar.css', './app-toast.css', './app-main-panel.css'],
})
export class App implements OnInit {
  readonly state = inject(PlayroomStateService);
  readonly console = inject(CliConsoleService);
  readonly pageLoading = inject(PageLoadingService);
  readonly session = inject(AcloudSessionService);
  readonly scope = inject(ScopeService);
  private readonly windowChrome = inject(WindowChromeService);
  private readonly router = inject(Router);
  private readonly notify = inject(ToastService);

  private readonly _shellBusy = signal<boolean>(false);
  private busyStartedAt = 0;
  private busyRelease: ReturnType<typeof setTimeout> | null = null;

  /**
   * What makes the brand mark breathe: a screen waiting for its first data, or
   * any command the user started. Held to the end of the breath — see BREATH_MS.
   */
  readonly shellBusy = this._shellBusy.asReadonly();

  readonly authMenuItems = computed<MenuItem[]>(() =>
    this.state.loggedIn()
      ? [{ label: 'Log out', icon: 'pi pi-sign-out', command: () => void this.signOut() }]
      : [{ label: 'Log in', icon: 'pi pi-sign-in', command: () => void this.signIn() }],
  );

  constructor() {
    effect(() => {
      const busy = this.pageLoading.active() || this.console.isRunning();
      untracked(() => this.keepMarkBreathingUntilCycleEnds(busy));
    });
  }

  async ngOnInit(): Promise<void> {
    this.windowChrome.matchWindowChromeToPlatformAndTheme();
    await Promise.all([
      this.session.loadInstallationFacts(),
      this.session.refreshSignedInUser(),
      this.scope.loadContextAndOrganisation(),
    ]);
  }

  /**
   * Lets the mark finish the breath it is in before it stops, so it never cuts
   * off mid-swell however briefly the work ran.
   */
  private keepMarkBreathingUntilCycleEnds(busy: boolean): void {
    if (this.busyRelease) {
      clearTimeout(this.busyRelease);
      this.busyRelease = null;
    }
    if (busy) {
      if (!this._shellBusy()) this.busyStartedAt = Date.now();
      this._shellBusy.set(true);
      return;
    }
    const elapsed = Date.now() - this.busyStartedAt;
    // At least one whole cycle: rounding up from zero is zero.
    const cycles = Math.max(1, Math.ceil(elapsed / BREATH_MS));
    const untilBoundary = cycles * BREATH_MS - elapsed;
    if (untilBoundary <= 0) {
      this._shellBusy.set(false);
      return;
    }
    this.busyRelease = setTimeout(() => this._shellBusy.set(false), untilBoundary);
  }

  get currentRoute(): string {
    return this.router.url;
  }

  // ── Sidebar menus ────────────────────────────────────────────────────────

  /**
   * The context menu. A context carries its own API endpoint, user and
   * organisation, so switching one moves everything below it.
   */
  readonly contextMenuItems = computed<MenuItem[]>(() =>
    this.scope.contexts().map((entry) => ({
      label: entry.Organisation ? `${entry.Name} — ${entry.Organisation}` : entry.Name,
      icon: entry.Name === this.scope.currentContext() ? 'pi pi-check' : 'pi pi-globe',
      disabled: entry.Name === this.scope.currentContext(),
      command: () => void this.switchToContext(entry.Name),
    })),
  );

  /**
   * The organisation menu. The CLI would offer this list through fzf; the GUI
   * renders it and passes the chosen slug to the same command.
   */
  readonly organisationMenuItems = computed<MenuItem[]>(() =>
    this.scope.organisations().map((organisation) => ({
      label: organisation.Name ? `${organisation.Name} (${organisation.Slug})` : organisation.Slug,
      icon:
        organisation.Slug === this.scope.currentOrganisation() ? 'pi pi-check' : 'pi pi-building',
      disabled: organisation.Slug === this.scope.currentOrganisation(),
      command: () => void this.switchToOrganisation(organisation.Slug),
    })),
  );

  /**
   * The playhouse menu: PLAYHOUSE_MENU_MAX of them with the selected one first,
   * then the screen that has all of them.
   */
  readonly playhouseMenuItems = computed<MenuItem[]>(() => {
    const selected = this.state.playhouse();
    const all = this.scope.playhouses();
    const ordered = [
      ...all.filter((playhouse) => playhouse.Slug === selected),
      ...all.filter((playhouse) => playhouse.Slug !== selected),
    ];

    const items: MenuItem[] = ordered.slice(0, PLAYHOUSE_MENU_MAX).map((playhouse) => ({
      label: playhouse.Slug,
      icon: playhouse.Slug === selected ? 'pi pi-check' : 'pi pi-server',
      disabled: playhouse.Slug === selected,
      command: () => this.choosePlayhouse(playhouse.Slug),
    }));

    // Nothing yet and nothing at all reach the same empty menu.
    if (items.length === 0) {
      items.push({
        label: this.scope.loadingPlayhouses()
          ? 'Loading playhouses…'
          : 'No playhouses in this organisation',
        disabled: true,
      });
    }

    return [
      ...items,
      { separator: true },
      // Names both things the screen is for: "View all" alone does not say a
      // playhouse can be created there.
      {
        label: 'View all / Create',
        icon: 'pi pi-th-large',
        command: () => void this.router.navigate(['/playhouse']),
      },
    ];
  });

  /**
   * Opens the menu on what is already known and re-reads underneath it, so the
   * click never waits on `playhouse list`.
   */
  openPlayhouseMenu(event: Event, menu: { toggle: (event: Event) => void }): void {
    void this.scope.loadPlayhousesForMenu();
    menu.toggle(event);
  }

  private choosePlayhouse(slug: string): void {
    this.state.selectPlayhouse(slug);
    void this.router.navigate(['/rooms']);
  }

  // ── Scope switching ──────────────────────────────────────────────────────

  async switchToOrganisation(slug: string): Promise<void> {
    this.reportScopeSwitch(
      'Organisation switched',
      slug,
      await this.scope.switchToOrganisation(slug),
    );
  }

  async switchToContext(name: string): Promise<void> {
    this.reportScopeSwitch('Context switched', name, await this.scope.switchToContext(name));
  }

  /**
   * Says what happened and returns to playhouse selection. A null result means
   * the picker chose what was already selected, which is not an event.
   */
  private reportScopeSwitch(
    summary: string,
    target: string,
    result: { succeeded: boolean; operationId: string; errorMessage: string } | null,
  ): void {
    if (!result) return;
    if (!result.succeeded) {
      this.notify.failure(
        `Could not switch to "${target}"`,
        result.errorMessage,
        result.operationId,
      );
      return;
    }
    void this.session.refreshSignedInUser();
    this.notify.show({
      severity: 'success',
      summary,
      detail: target,
      data: { operationId: result.operationId },
    });
    void this.router.navigate(['/playhouse']);
  }

  // ── Activity log ─────────────────────────────────────────────────────────

  /** Opens the activity log, at a specific command when the toast names one. */
  openActivity(operationId?: string): void {
    this.console.open(operationId ?? '');
  }

  activityState(): string {
    const running = this.console.running().length;
    if (running > 0) return running === 1 ? 'running' : `${running} running`;
    if (this.console.isEmpty()) return 'nothing yet';
    return this.console.lastFailed() ? 'last failed' : 'idle';
  }

  activityTitle(): string {
    const current = this.console.cancellable();
    return current ? current.title : 'Commands this session';
  }

  toolStatusTitle(tool: ToolStatus): string {
    return tool.Message || `${tool.Command} ${tool.State}`;
  }

  // ── Signing in and out ───────────────────────────────────────────────────

  /**
   * Starts the interactive login and polls for the credentials, since opening
   * the terminal returns long before the browser round-trip is done.
   */
  async signIn(): Promise<void> {
    this.session.markSigningInOrOut(true);
    try {
      await this.session.openLoginInTerminal();
      this.notify.show({
        severity: 'info',
        summary: 'Complete the login in your terminal',
        detail: 'This window updates once the credentials are stored.',
      });

      if (await this.session.waitForCredentialsToAppear()) {
        this.notify.show({
          severity: 'success',
          summary: 'Signed in',
          detail: this.state.user() || 'Login complete',
        });
        return;
      }
      this.notify.show({
        severity: 'warn',
        summary: 'Still not signed in',
        detail: 'No credentials were stored. Finish the login in your terminal, then try again.',
      });
    } catch (error) {
      this.notify.failure('Login failed', error);
    } finally {
      this.session.markSigningInOrOut(false);
    }
  }

  /**
   * Signs out and returns to playhouse selection, clearing the screen the same
   * way a scope switch does.
   */
  async signOut(): Promise<void> {
    this.session.markSigningInOrOut(true);
    try {
      await this.session.signOut();
      this.scope.forgetEverythingBelongingToPreviousScope();
      this.notify.show({
        severity: 'success',
        summary: 'Signed out',
        detail: 'Credentials cleared',
      });
      void this.router.navigate(['/playhouse']);
    } catch {
      this.notify.show({
        severity: 'error',
        summary: 'Logout failed',
        detail: 'Could not clear credentials',
      });
    } finally {
      this.session.markSigningInOrOut(false);
    }
  }
}
