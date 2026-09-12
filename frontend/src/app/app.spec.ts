import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { App, BREATH_MS } from './app';
import { ScopeService } from './core/services/scope';
import { PlayhouseEntry, wailsApi } from './core/services/wails-api';

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
});
