import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { App, BREATH_MS } from './app';
import { ScopeService } from './core/services/scope';
import { ToastService } from './core/services/toast';
import { AcloudBinaryStatus, PlayhouseEntry, wailsApi } from './core/services/wails-api';
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

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.sidebar-brand-name')?.textContent).toContain(
      'Avisi Playground',
    );
    // Located by its label: all three scope pickers share one button class.
    const sections = Array.from(compiled.querySelectorAll('.sidebar-section'));
    const playhouse = sections.find(
      (s) => s.querySelector('.sidebar-label')?.textContent?.trim() === 'Playhouse',
    );
    expect(playhouse?.querySelector('.scope-slug')?.textContent).toContain('Select playhouse');
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

  describe('playhouse menu', () => {
    const entry = (slug: string) =>
      ({
        Identity: slug,
        Slug: slug,
        Status: 'active',
        Region: 'eu',
        Version: '1',
      }) as PlayhouseEntry;

    /** Seeds the menu the way the sidebar does: by actually loading it. */
    const loadPlayhouses = async (slugs: string[]) => {
      vi.spyOn(wailsApi, 'listPlayhouses').mockResolvedValue(slugs.map(entry));
      await TestBed.inject(ScopeService).loadPlayhousesForMenu();
    };

    afterEach(() => vi.restoreAllMocks());

    it('lists the selected playhouse first and caps the rest', async () => {
      const fixture = TestBed.createComponent(App);
      const app = fixture.componentInstance;
      await loadPlayhouses(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
      app.state.selectPlayhouse('f');

      const items = app.playhouseMenuItems();
      const separator = items.findIndex((item) => item.separator);
      const listed = items.slice(0, separator).map((item) => item.label);

      expect(listed[0]).toBe('f');
      expect(listed).toHaveLength(5);
      expect(items.slice(separator + 1).map((item) => item.label)).toEqual(['View all / Create']);
    });

    it('always offers the full screen, even with nothing to list', async () => {
      const fixture = TestBed.createComponent(App);
      const app = fixture.componentInstance;
      await loadPlayhouses([]);

      const items = app.playhouseMenuItems();

      expect(items[0].label).toBe('No playhouses in this organisation');
      expect(items[0].disabled).toBe(true);
      expect(items.at(-1)?.label).toBe('View all / Create');
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
