import { By } from '@angular/platform-browser';
import { Tooltip } from 'primeng/tooltip';
import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { App, BREATH_MS } from './app';
import { ToastService } from './core/services/toast';
import { AcloudBinaryStatus, wailsApi } from './core/services/wails-api';
import { RELEASE_STAGE } from './shared/data';
import { updateCache } from './shared/utils';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [MessageService, provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('updates the background grain class in both themes', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const shell = (fixture.nativeElement as HTMLElement).querySelector('.app-shell')!;

    try {
      expect(shell.classList.contains('background-grain-disabled')).toBe(false);

      fixture.componentInstance.state.setBackgroundGrain(false);
      fixture.detectChanges();
      expect(shell.classList.contains('background-grain-disabled')).toBe(true);

      fixture.componentInstance.state.setThemePreference('light');
      fixture.detectChanges();
      expect(shell.classList.contains('light')).toBe(true);
      expect(shell.classList.contains('background-grain-disabled')).toBe(true);

      fixture.componentInstance.state.setBackgroundGrain(true);
      fixture.detectChanges();
      expect(shell.classList.contains('background-grain-disabled')).toBe(false);
    } finally {
      localStorage.clear();
    }
  });

  it('has separate sidebar links for Defaults and Settings', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const links = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>(
      '.sidebar-nav a',
    );
    expect(
      [...links].find((link) => link.textContent?.includes('Defaults'))?.getAttribute('href'),
    ).toBe('/defaults');
    expect(
      [...links].find((link) => link.textContent?.includes('Settings'))?.getAttribute('href'),
    ).toBe('/settings');
  });

  it('keeps Activity and Notifications together without a sidebar theme button', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.theme-btn')).toBeNull();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.sidebar-utilities button')];
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain('Activity');
    expect(buttons[1].textContent).toContain('Notifications');
    const openActivity = vi.spyOn(fixture.componentInstance.console, 'toggle');
    buttons[0].click();
    expect(openActivity).toHaveBeenCalledOnce();
    buttons[1].click();
    expect(fixture.componentInstance.notify.historyVisible()).toBe(true);
    vi.restoreAllMocks();
  });

  it('removes and restores the AME Robot immediately', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    try {
      expect(root.querySelector('.sidebar-mascot')).not.toBeNull();
      fixture.componentInstance.state.setAmeRobot(false);
      fixture.detectChanges();
      expect(root.querySelector('.sidebar-mascot')).toBeNull();
      TestBed.inject(ToastService).toast('Created', 'ok', 'operation');
      expect(fixture.componentInstance.mascotCelebrating()).toBe(false);
      fixture.componentInstance.state.setAmeRobot(true);
      fixture.detectChanges();
      expect(root.querySelector('.sidebar-mascot')).not.toBeNull();
    } finally {
      localStorage.clear();
    }
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.sidebar-brand-name')?.textContent).toContain(
      'Avisi Playground',
    );
  });

  it('marks page loading separately from the decorative breath finishing', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    await fixture.whenStable();
    const main = fixture.nativeElement.querySelector('main') as HTMLElement;
    let finish = () => {};
    const loading = app.pageLoading.runAndShowIndicatorIf(
      true,
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    fixture.detectChanges();
    expect(main.getAttribute('aria-busy')).toBe('true');
    expect(main.classList.contains('is-loading')).toBe(true);
    finish();
    await loading;
    fixture.detectChanges();
    expect(main.getAttribute('aria-busy')).toBe('false');
    expect(main.classList.contains('is-loading')).toBe(true);
  });

  it('breathes for a running command, not only for a screen load', async () => {
    vi.useFakeTimers();
    try {
      const fixture = TestBed.createComponent(App);
      const app = fixture.componentInstance;
      TestBed.tick();
      expect(app.shellBusy()).toBe(false);

      let finish = () => {};
      const command = app.console.run(
        'doing something',
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      TestBed.tick();
      expect(app.shellBusy()).toBe(true);
      vi.advanceTimersByTime(1500);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.loading-label')).toBeNull();

      finish();
      await command;
      TestBed.tick();
      // Still on: cutting a slow swell partway through looks like a glitch, so
      // the mark finishes the breath it started.
      expect(app.shellBusy()).toBe(true);

      vi.advanceTimersByTime(BREATH_MS + 50);
      TestBed.tick();
      expect(app.shellBusy()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('notification banners', () => {
    afterEach(() => vi.restoreAllMocks());

    it('expires even a hovered failure after five seconds and keeps its history', async () => {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      vi.useFakeTimers();
      try {
        const notify = TestBed.inject(ToastService);
        notify.failure('Could not open editor', 'Editor missing', 'operation');
        fixture.detectChanges();
        const banner = document.querySelector<HTMLElement>('.p-toast-message')!;
        expect(banner).not.toBeNull();
        banner.dispatchEvent(new MouseEvent('mouseenter'));
        vi.advanceTimersByTime(4999);
        fixture.detectChanges();
        expect(document.querySelector('.toast-body')).not.toBeNull();
        vi.advanceTimersByTime(1);
        fixture.detectChanges();
        expect(document.querySelector('.toast-body')).toBeNull();
        expect(notify.history()[0].summary).toBe('Could not open editor');
      } finally {
        fixture.destroy();
        vi.useRealTimers();
      }
    });

    it('opens notification history from the sidebar and links failures back to Activity', async () => {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const root = fixture.nativeElement as HTMLElement;
      root.querySelector<HTMLButtonElement>('.notifications-btn')!.click();
      await fixture.whenStable();
      expect(document.querySelector('.notification-history-empty')?.textContent).toContain(
        'No notifications yet',
      );
      const notify = TestBed.inject(ToastService);
      notify.failure('Could not open editor', 'Editor missing; install VS Code', 'operation');
      TestBed.inject(MessageService).clear();
      await fixture.whenStable();
      expect(document.querySelector('.notification-history-entry')?.textContent).toContain(
        'Install VS Code',
      );
      const openActivity = vi.spyOn(fixture.componentInstance.console, 'open');
      document.querySelector<HTMLButtonElement>('.notification-history-activity')!.click();
      await fixture.whenStable();
      expect(openActivity).toHaveBeenCalledWith('operation');
      expect(notify.historyVisible()).toBe(false);
    });

    it('gives each notification its own five seconds without removing newer messages', async () => {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      vi.useFakeTimers();
      try {
        const notify = TestBed.inject(ToastService);
        notify.toast('First warning', 'warn');
        fixture.detectChanges();
        vi.advanceTimersByTime(3000);
        notify.toast('Second warning', 'warn');
        fixture.detectChanges();
        vi.advanceTimersByTime(2000);
        fixture.detectChanges();
        const banners = [...document.querySelectorAll('.toast-detail')];
        expect(banners.map((banner) => banner.textContent)).toEqual(['Second warning']);
        vi.advanceTimersByTime(3000);
        fixture.detectChanges();
        expect(document.querySelector('.toast-body')).toBeNull();
        expect(notify.history()).toHaveLength(2);
      } finally {
        fixture.destroy();
        vi.useRealTimers();
      }
    });

    it('opens Activity from the banner with Enter or Space and keeps dismissal separate', async () => {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const openActivity = vi.spyOn(fixture.componentInstance.console, 'open');
      TestBed.inject(ToastService).failure(
        'Could not update demo',
        'Try again; check the image',
        'operation',
      );
      fixture.detectChanges();
      const banner = document.querySelector<HTMLElement>('.toast-body--linked')!;
      expect(banner.textContent).not.toContain('View command');
      expect(banner.textContent).toContain('Check the image');
      expect(banner.getAttribute('role')).toBe('button');
      expect(banner.hasAttribute('aria-label')).toBe(false);
      expect(banner.getAttribute('aria-description')).toBe('Open Activity for this command');
      expect(banner.tabIndex).toBe(0);
      banner.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      banner.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(openActivity).toHaveBeenCalledTimes(2);
      expect(openActivity).toHaveBeenLastCalledWith('operation');
      const dismiss = document.querySelector<HTMLButtonElement>('.p-toast-close-button')!;
      expect(dismiss).not.toBeNull();
      dismiss.click();
      fixture.detectChanges();
      expect(openActivity).toHaveBeenCalledTimes(2);
      expect(document.querySelector('.toast-body--linked')).toBeNull();
    });

    it('does not make an ordinary notification an Activity link', async () => {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const openActivity = vi.spyOn(fixture.componentInstance.console, 'open');
      TestBed.inject(ToastService).toast('Copied');
      fixture.detectChanges();
      const banner = document.querySelector<HTMLElement>('.toast-body')!;
      expect(banner.hasAttribute('tabindex')).toBe(false);
      banner.click();
      expect(openActivity).not.toHaveBeenCalled();
    });
  });

  describe('robot success reaction', () => {
    afterEach(() => vi.restoreAllMocks());

    it('celebrates successful commands, then resets so the next one can celebrate', async () => {
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const mascot = (fixture.nativeElement as HTMLElement).querySelector('.sidebar-mascot')!;
      const notify = TestBed.inject(ToastService);

      notify.toast('Starting', 'busy', 'operation');
      notify.toast('Failed', 'bad', 'operation');
      notify.toast('Copied', 'ok');
      fixture.detectChanges();
      expect(mascot.classList.contains('is-celebrating')).toBe(false);

      notify.toast('Created', 'ok', 'operation');
      fixture.detectChanges();
      expect(mascot.classList.contains('is-celebrating')).toBe(true);

      mascot.dispatchEvent(new Event('animationend'));
      fixture.detectChanges();
      expect(mascot.classList.contains('is-celebrating')).toBe(false);

      notify.toast('Started', 'ok', 'next-operation');
      fixture.detectChanges();
      expect(mascot.classList.contains('is-celebrating')).toBe(true);
    });

    it('does not queue a celebration while the document is hidden', async () => {
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();

      TestBed.inject(ToastService).toast('Created', 'ok', 'operation');

      expect(fixture.componentInstance.mascotCelebrating()).toBe(false);
    });
  });

  // A fresh install is sent to setup by the launch route; this is the other case.
  it('reopens setup at the step that broke once the installation has been read', async () => {
    updateCache({ setupCompleted: true });
    try {
      vi.spyOn(wailsApi, 'getAcloudBinaryStatus').mockResolvedValue({
        Found: false,
      } as AcloudBinaryStatus);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      await TestBed.createComponent(App).componentInstance.ngOnInit();

      expect(navigate).toHaveBeenCalledWith(['/setup'], { queryParams: { step: 'acloud' } });
    } finally {
      localStorage.clear();
      vi.restoreAllMocks();
    }
  });

  describe('Working in block', () => {
    /** Renders the shell as the given acloud reports it, then returns the block. */
    const renderWorkingIn = async (facts: {
      loggedIn: boolean;
      playhouse?: string;
      context?: string;
      organisation?: string;
      acloudFound?: boolean;
    }) => {
      vi.spyOn(wailsApi, 'isLoggedIn').mockResolvedValue(facts.loggedIn);
      vi.spyOn(wailsApi, 'getCurrentUserEmail').mockResolvedValue('');
      vi.spyOn(wailsApi, 'getCurrentContext').mockResolvedValue(facts.context ?? '');
      vi.spyOn(wailsApi, 'getCurrentOrganisation').mockResolvedValue(facts.organisation ?? '');
      vi.spyOn(wailsApi, 'getAcloudBinaryStatus').mockResolvedValue({
        Found: facts.acloudFound ?? true,
      } as AcloudBinaryStatus);
      const fixture = TestBed.createComponent(App);
      const app = fixture.componentInstance;
      app.state.selectPlayhouse(facts.playhouse ?? '');
      await app.ngOnInit();
      fixture.detectChanges();
      const block = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '.current-playhouse',
      )!;
      const values = [...block.querySelectorAll<HTMLElement>('.scope-value')];
      return { fixture, app, block, values };
    };

    afterEach(() => {
      localStorage.clear();
      vi.restoreAllMocks();
    });

    it('says when nobody is signed in and leads to the login step of setup', async () => {
      const { app, block } = await renderWorkingIn({ loggedIn: false, playhouse: 'kept' });
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      expect(app.currentScopeState()).toBe('signed-out');
      expect(block.textContent).toContain('Not signed in');
      expect(block.textContent).toContain('Set up Acloud');
      expect(block.textContent).not.toContain('kept');
      expect(block.getAttribute('aria-haspopup')).toBeNull();

      block.click();

      expect(navigate).toHaveBeenCalledWith(['/setup'], { queryParams: { step: 'login' } });
      expect(app.showPlayhouseChooser).toBe(false);
    });

    it('leads to the acloud step of setup when acloud is missing', async () => {
      const { block } = await renderWorkingIn({ loggedIn: false, acloudFound: false });
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      block.click();

      expect(navigate).toHaveBeenCalledWith(['/setup'], { queryParams: { step: 'acloud' } });
    });

    it('shows the hierarchy with no playhouse yet and opens the chooser to pick one', async () => {
      const { app, block, values } = await renderWorkingIn({
        loggedIn: true,
        context: 'development',
        organisation: 'platform',
      });

      expect(app.currentScopeState()).toBe('no-playhouse');
      expect(values.map((value) => value.textContent?.trim())).toEqual([
        'development',
        'platform',
        'None chosen yet',
      ]);
      expect(block.textContent).toContain('Choose a playhouse');
      expect(block.getAttribute('aria-haspopup')).toBe('dialog');

      block.click();

      expect(app.showPlayhouseChooser).toBe(true);
    });

    it('shows the selected playhouse with full names on hover and opens the chooser', async () => {
      const longName = 'playhouse-platform-infrastructure-experiments-with-a-long-name';
      const { fixture, app, block, values } = await renderWorkingIn({
        loggedIn: true,
        context: 'development',
        organisation: 'platform',
        playhouse: longName,
      });

      expect(app.currentScopeState()).toBe('playhouse-selected');
      expect(values[2].textContent?.trim()).toBe(longName);
      expect(
        fixture.debugElement
          .queryAll(By.css('.scope-value'))
          .map((value) => value.injector.get(Tooltip).content),
      ).toEqual(['development', 'platform', longName]);
      expect(block.textContent).toContain('Switch playhouse');

      block.click();

      expect(app.showPlayhouseChooser).toBe(true);
      expect(block.getAttribute('aria-haspopup')).toBe('dialog');
    });

    it('shows Not reported for a context or organisation acloud did not report', async () => {
      const { values } = await renderWorkingIn({ loggedIn: true, playhouse: 'playhouse-a' });

      expect(values.map((value) => value.textContent?.trim())).toEqual([
        'Not reported',
        'Not reported',
        'playhouse-a',
      ]);
    });
  });

  describe('release stage', () => {
    /** The panel is appended to body, so its action is found on the document. */
    const openReleaseStagePanelAndActivateFeedback = async () => {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const sidebar = fixture.nativeElement as HTMLElement;
      sidebar.querySelector<HTMLButtonElement>('.release-stage-badge')?.click();
      await fixture.whenStable();
      const feedback = document.querySelector<HTMLButtonElement>('.release-stage-feedback');
      expect(feedback).not.toBeNull();
      feedback?.click();
    };

    afterEach(() => vi.restoreAllMocks());

    it('shows the release stage in the sidebar brand', async () => {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const badge = (fixture.nativeElement as HTMLElement).querySelector(
        '.sidebar-brand .release-stage-badge',
      );

      expect(badge?.textContent?.trim()).toBe(RELEASE_STAGE.label);
    });

    it('opens the feedback page in the default browser', async () => {
      const openUrl = vi.spyOn(wailsApi, 'openUrlInDefaultBrowser').mockResolvedValue();

      await openReleaseStagePanelAndActivateFeedback();

      expect(openUrl).toHaveBeenCalledWith(RELEASE_STAGE.feedbackUrl);
    });

    it('says so when the browser cannot be opened', async () => {
      const failure = new Error('no browser');
      vi.spyOn(wailsApi, 'openUrlInDefaultBrowser').mockRejectedValue(failure);
      const reportFailure = vi.spyOn(TestBed.inject(ToastService), 'failure');

      await openReleaseStagePanelAndActivateFeedback();

      await vi.waitFor(() =>
        expect(reportFailure).toHaveBeenCalledWith('Could not open GitHub', failure),
      );
    });
  });
});
