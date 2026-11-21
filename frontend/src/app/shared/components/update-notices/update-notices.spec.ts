import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EveningStopService } from '../../../core/services/evening-stop';
import { UpdatesService } from '../../../core/services/updates';
import { ScheduleEvent, wailsApi } from '../../../core/services/wails-api';
import { updateCache } from '../../utils/cache';
import { UpdateNoticesComponent } from './update-notices';

describe('UpdateNoticesComponent', () => {
  const reminders = signal<ScheduleEvent[]>([]);
  beforeEach(() => {
    localStorage.clear();
    reminders.set([]);
    TestBed.configureTestingModule({
      providers: [{ provide: EveningStopService, useValue: { notices: reminders } }],
    });
    vi.spyOn(wailsApi, 'getAppVersion').mockResolvedValue('1.0.0');
    vi.spyOn(wailsApi, 'checkUpdates').mockResolvedValue({
      AppVersion: '1.1.0',
      AcloudVersion: '0.41.0',
    });
    vi.spyOn(wailsApi, 'openUrlInDefaultBrowser').mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  async function renderNotices(placement: 'sidebar' | 'page' = 'sidebar') {
    const fixture = TestBed.createComponent(UpdateNoticesComponent);
    fixture.componentRef.setInput('placement', placement);
    await TestBed.inject(UpdatesService).start();
    fixture.detectChanges();
    return fixture;
  }

  async function openDetails(fixture: Awaited<ReturnType<typeof renderNotices>>) {
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    await fixture.whenStable();
    return document.querySelector('.update-details') as HTMLElement;
  }

  it('keeps updates behind one sidebar entry, opens details, copies and dismisses each update', async () => {
    const fixture = await renderNotices();
    expect(fixture.nativeElement.textContent).toContain('Update 1.1.0 available');
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
    const details = await openDetails(fixture);
    expect(details.textContent).toContain('Version 1.1.0 is available');
    expect(details.textContent).toContain('according to Homebrew');
    const app = details.querySelector('section')!;
    const buttons = () => Array.from(app.querySelectorAll('button'));
    buttons()
      .find((button) => button.textContent?.includes('Copy upgrade command'))!
      .click();
    await fixture.whenStable();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'brew upgrade --cask acloud-playrooms',
    );
    expect(app.textContent).toContain('Copied');
    const link = app.querySelector('a')!;
    expect(link.href).toBe('https://github.com/avisi-cloud/acloud-playrooms/releases/tag/v1.1.0');
    link.click();
    expect(wailsApi.openUrlInDefaultBrowser).toHaveBeenCalledWith(link.href);
    buttons()
      .find((button) => button.textContent?.includes('Dismiss'))!
      .click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('acloud 0.41.0 available');
    expect(details.querySelectorAll('section')).toHaveLength(1);
    Array.from(details.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Dismiss'))!
      .click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.sidebar-update')).toBeNull();
  });

  it("shows only What's new at page level and defers it while a playroom reminder is visible", async () => {
    updateCache({ lastSeenAppVersion: '0.9.0' });
    const fixture = await renderNotices('page');
    expect(fixture.nativeElement.querySelectorAll('section')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain("What's new in 1.0.0");
    expect(fixture.nativeElement.textContent).not.toContain('brew upgrade');
    reminders.set([{ ID: 'reminder' } as ScheduleEvent]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
    reminders.set([]);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
  });

  it('leaves the command selectable when the clipboard fails', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error('clipboard unavailable'));
    const fixture = await renderNotices();
    const details = await openDetails(fixture);
    await fixture.componentInstance.copyCommand(
      TestBed.inject(UpdatesService).availableUpdates()[0],
    );
    fixture.detectChanges();
    expect(details.querySelector('[role="alert"]')?.textContent).toContain('Select the text above');
    expect(details.querySelector('code')?.textContent).toBe('brew upgrade --cask acloud-playrooms');
  });

  it('shows a recovery message when the browser cannot open', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.mocked(wailsApi.openUrlInDefaultBrowser).mockRejectedValue(new Error('browser unavailable'));
    const fixture = await renderNotices();
    const details = await openDetails(fixture);
    await fixture.componentInstance.openReleaseNotes(
      new Event('click'),
      TestBed.inject(UpdatesService).availableUpdates()[0],
    );
    fixture.detectChanges();
    expect(details.querySelector('[role="alert"]')?.textContent).toContain('Copy the link address');
  });
});
