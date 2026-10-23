import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { PlayhouseJobsService } from '../../../../core/services/playhouse-jobs';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { PlayhouseEntry, wailsApi } from '../../../../core/services/wails-api';
import { PlayhouseSelectPageComponent } from './playhouse-select';

describe('Playhouse versions', () => {
  beforeEach(async () => {
    vi.spyOn(wailsApi, 'listPlayhouses').mockResolvedValue([]);
    await TestBed.configureTestingModule({
      imports: [PlayhouseSelectPageComponent],
      providers: [MessageService, provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  async function renderVersions(
    LayoutStatus: string,
    LayoutVersion: number | null = 3,
    Version = '1.33.4',
  ) {
    TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-demo');
    const fixture = TestBed.createComponent(PlayhouseSelectPageComponent);
    await fixture.whenStable();
    const playhouse: PlayhouseEntry = {
      Slug: 'playhouse-demo',
      Identity: 'demo',
      Region: 'eu',
      Status: 'ready',
      LayoutStatus,
      LayoutVersion,
      Version,
    };
    fixture.componentInstance.playhouses.set([playhouse]);
    fixture.detectChanges();
    return fixture;
  }

  it.each([
    ['current', 'Up to date', false],
    ['outdated', 'Update available', true],
    ['newer', 'Needs newer acloud', false],
    ['unknown', 'Unknown', false],
  ] as const)(
    'shows %s consistently in the table, folded row and selected panel',
    async (status, label, actionable) => {
      const fixture = await renderVersions(status);
      const summaries = (fixture.nativeElement as HTMLElement).querySelectorAll('.version-summary');
      expect(summaries.length).toBe(3);
      for (const summary of summaries) {
        expect(summary.textContent).toContain('Layout v3');
        expect(summary.textContent).toContain('Kubernetes 1.33.4');
        expect(summary.textContent).toContain(label);
        expect(!!summary.querySelector('button')).toBe(actionable);
      }
      if (actionable) {
        const openUpdate = vi
          .spyOn(fixture.componentInstance, 'askUpdate')
          .mockImplementation(() => {});
        summaries[0].querySelector('button')!.click();
        expect(openUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ Slug: 'playhouse-demo' }),
          expect.any(MouseEvent),
        );
      }
    },
  );

  it('labels missing versions as unknown without inventing a version', async () => {
    const fixture = await renderVersions('unknown', null, '');
    const summary = fixture.nativeElement.querySelector('.version-summary') as HTMLElement;
    expect(summary.textContent).toContain('Layout unknown');
    expect(summary.textContent).toContain('Kubernetes unknown');
    expect(summary.textContent).not.toContain('v0');
  });

  it('keeps setup resume available instead of offering an ordinary layout update', async () => {
    const jobs = TestBed.inject(PlayhouseJobsService);
    vi.spyOn(jobs, 'canResume').mockReturnValue(true);
    const resume = vi.spyOn(jobs, 'resume').mockImplementation(() => {});
    const fixture = await renderVersions('outdated');
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.version-summary button')).toBeNull();
    root
      .querySelector<HTMLButtonElement>('[aria-label="Resume the setup of playhouse-demo"]')!
      .click();
    expect(resume).toHaveBeenCalledWith('playhouse-demo');
  });
});
