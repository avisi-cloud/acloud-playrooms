import { CommandPaletteComponent } from './shared/components/command-palette/command-palette';
import { DesktopNotificationsService } from './core/services/desktop-notifications';
import { DialogModule } from 'primeng/dialog';
import { ShortcutsService } from './core/services/shortcuts';
import { CommonModule } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MenuItem, MessageService } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import { PopoverModule } from 'primeng/popover';
import { ToastModule } from 'primeng/toast';
import { DrawerModule } from 'primeng/drawer';
import { ButtonModule } from 'primeng/button';
import { OverlayFocusDirective } from './shared/directives';
import { ToastExpiryDirective } from './shared/directives/toast-expiry';
import { ToolStatus } from './shared/models';
import { RELEASE_STAGE, SETUP_STEP_QUERY_PARAM } from './shared/data';
import { CliConsoleComponent } from './shared/components';
import { PlayroomStateService } from './core/services/playroom-state';
import { CliConsoleService } from './core/services/cli-console';
import { ToastService } from './core/services/toast';
import { PageLoadingService } from './core/services/page-loading';
import { AcloudSessionService } from './core/services/acloud-session';
import { ScopeService } from './core/services/scope';
import { SetupService } from './core/services/setup';
import { WindowChromeService } from './core/services/window-chrome';
import { PlayhouseChooserComponent } from './features/playhouse/components/playhouse-chooser/playhouse-chooser';
import { runtimeMode } from './core/development/runtime-mode';
import { TagModule } from 'primeng/tag';
import { wailsApi } from './core/services/wails-api';

/**
 * One full breath of the brand mark: the period of both animations in
 * `app.css`, which must stay in step with this number.
 */
export const BREATH_MS = 5600;

/** What the sidebar's "Working in" block can show; each state has its own action. */
export type CurrentScopeState = 'signed-out' | 'no-playhouse' | 'playhouse-selected';

/**
 * The application shell: the sidebar, the routed panel, and the coordination
 * between them. It holds no domain state of its own.
 */
@Component({
  selector: 'app-root',
  host: {
    '(document:visibilitychange)': 'updateMascotMotionForDocumentVisibility()',
  },
  // The sidebar has its own dark theme boundary, including when the workspace is light.
  imports: [
    CommandPaletteComponent,
    DialogModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    CommonModule,
    ToastModule,
    DrawerModule,
    ButtonModule,
    TagModule,
    OverlayFocusDirective,
    ToastExpiryDirective,
    MenuModule,
    PopoverModule,
    CliConsoleComponent,
    PlayhouseChooserComponent,
  ],
  templateUrl: './app.html',
  // Component styles, split up rather than one 780-line stylesheet.
  styleUrls: ['./app.css', './app-sidebar.css', './app-toast.css', './app-main-panel.css'],
})
export class App implements OnInit {
  private readonly desktopNotifications = inject(DesktopNotificationsService);
  readonly shortcuts = inject(ShortcutsService);
  readonly state = inject(PlayroomStateService);
  readonly console = inject(CliConsoleService);
  readonly pageLoading = inject(PageLoadingService);
  readonly session = inject(AcloudSessionService);
  readonly scope = inject(ScopeService);
  readonly releaseStage = RELEASE_STAGE;
  readonly dummyMode = runtimeMode.dummy;
  showPlayhouseChooser = false;
  showLocalTools = false;
  readonly mascotMotionPaused = signal(document.hidden);
  readonly mascotCelebrating = signal(false);
  private readonly setup = inject(SetupService);
  private readonly windowChrome = inject(WindowChromeService);
  private readonly router = inject(Router);
  readonly notify = inject(ToastService);

  private readonly _shellBusy = signal<boolean>(false);
  private busyStartedAt = 0;
  private busyRelease: ReturnType<typeof setTimeout> | null = null;

  /**
   * What makes the brand mark breathe: a screen waiting for its first data, or
   * any command the user started. Held to the end of the breath — see BREATH_MS.
   */
  readonly shellBusy = this._shellBusy.asReadonly();
  private hasActivatedRoute = false;

  updateMascotMotionForDocumentVisibility(): void {
    this.mascotMotionPaused.set(document.hidden);
  }

  focusRoutedContent(): void {
    if (this.hasActivatedRoute && !this.showPlayhouseChooser)
      setTimeout(() => {
        if (!this.showPlayhouseChooser)
          document.getElementById('main-content')?.focus({ preventScroll: true });
      });
    this.hasActivatedRoute = true;
  }

  readonly currentScopeState = computed<CurrentScopeState>(() => {
    if (!this.state.loggedIn()) return 'signed-out';
    return this.state.playhouse() ? 'playhouse-selected' : 'no-playhouse';
  });

  readonly currentScopeAction = computed(() => {
    const state = this.currentScopeState();
    if (state === 'signed-out') return 'Set up Acloud';
    return state === 'no-playhouse' ? 'Choose a playhouse' : 'Switch playhouse';
  });

  /** Signed out, there is nothing to switch yet, so the block leads to the setup step that fixes it. */
  openCurrentScope(): void {
    if (this.currentScopeState() !== 'signed-out') {
      this.showPlayhouseChooser = true;
      return;
    }
    void this.router.navigate(['/setup'], {
      queryParams: {
        [SETUP_STEP_QUERY_PARAM]: this.session.acloudIsMissing() ? 'acloud' : 'login',
      },
    });
  }

  readonly authMenuItems = computed<MenuItem[]>(() =>
    this.state.loggedIn()
      ? [{ label: 'Log out', icon: 'pi pi-sign-out', command: () => void this.signOut() }]
      : [{ label: 'Log in', icon: 'pi pi-sign-in', command: () => void this.signIn() }],
  );

  constructor() {
    inject(MessageService)
      .messageObserver.pipe(takeUntilDestroyed())
      .subscribe((message) => {
        const messages = Array.isArray(message) ? message : [message];
        if (
          !document.hidden &&
          this.state.ameRobot() &&
          messages.some((entry) => entry.severity === 'success' && entry.data?.operationId)
        )
          this.mascotCelebrating.set(true);
      });
    inject(DestroyRef).onDestroy(() => {
      if (this.busyRelease) clearTimeout(this.busyRelease);
    });
    effect(() => {
      if (!this.state.ameRobot()) this.mascotCelebrating.set(false);
    });
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
    // Only here, at launch: a sign-out later in the session keeps its own behaviour.
    const brokenStep = this.setup.requiredStepThatBrokeSinceSetup();
    if (brokenStep)
      void this.router.navigate(['/setup'], {
        queryParams: { [SETUP_STEP_QUERY_PARAM]: brokenStep },
      });
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

  // ── Release stage ────────────────────────────────────────────────────────

  async openFeedbackPageInDefaultBrowser(): Promise<void> {
    try {
      await wailsApi.openUrlInDefaultBrowser(this.releaseStage.feedbackUrl);
    } catch (error) {
      this.notify.failure('Could not open GitHub', error);
    }
  }

  // ── Activity log ─────────────────────────────────────────────────────────

  /** Opens the activity log, at a specific command when the toast names one. */
  openToastActivity(operationId?: string): void {
    if (operationId) this.console.open(operationId);
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
    try {
      const signedIn = await this.session.signInThroughTerminal(() =>
        this.notify.show({
          severity: 'info',
          summary: 'Complete the login in your terminal',
          detail: 'This window updates once the credentials are stored.',
        }),
      );
      if (signedIn) {
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
