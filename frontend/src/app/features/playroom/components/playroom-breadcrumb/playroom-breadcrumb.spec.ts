import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MessageService } from 'primeng/api';
import { Tooltip } from 'primeng/tooltip';
import { ScopeService } from '../../../../core/services/scope';
import { PlayroomStateService } from '../../../../core/services/playroom-state';
import { wailsApi } from '../../../../core/services/wails-api';
import { PlayhouseChooserComponent } from '../../../playhouse/components/playhouse-chooser/playhouse-chooser';
import { PlayroomBreadcrumbComponent } from './playroom-breadcrumb';

describe('Playroom breadcrumb', () => {
  const organisation = signal('example');

  beforeEach(async () => {
    localStorage.clear();
    organisation.set('example');
    await TestBed.configureTestingModule({
      imports: [PlayroomBreadcrumbComponent],
      providers: [
        MessageService,
        provideRouter([]),
        {
          provide: ScopeService,
          useValue: {
            currentOrganisation: organisation,
            currentContext: signal('example-context'),
            switching: signal(false),
          },
        },
      ],
      deferBlockBehavior: DeferBlockBehavior.Manual,
    }).compileComponents();
    TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-a');
  });

  afterEach(() => vi.restoreAllMocks());

  function render(roomName = '') {
    const fixture = TestBed.createComponent(PlayroomBreadcrumbComponent);
    fixture.componentRef.setInput('roomName', roomName);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the current organisation and playhouse on the overview', () => {
    const fixture = render();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('nav')?.getAttribute('aria-label')).toBe('Breadcrumb');
    expect([...root.querySelectorAll('li')].map((item) => item.textContent?.trim())).toEqual([
      'example',
      'playhouse-a',
    ]);
    expect(root.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe('playhouse-a');
  });

  it('adds the current room as the last breadcrumb on details', () => {
    const fixture = render('demo');
    const root: HTMLElement = fixture.nativeElement;
    expect([...root.querySelectorAll('li')].map((item) => item.textContent?.trim())).toEqual([
      'example',
      'playhouse-a',
      'demo',
    ]);
    expect(root.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(root.querySelector('[aria-current="page"]')?.textContent).toBe('demo');
    fixture.componentRef.setInput('roomName', 'another-room');
    fixture.detectChanges();
    expect(root.querySelector('[aria-current="page"]')?.textContent).toBe('another-room');
  });

  it('updates from the existing scope signals without retaining old names', () => {
    const fixture = render();
    organisation.set('another-organisation');
    TestBed.inject(PlayroomStateService).selectPlayhouse('playhouse-b');
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).toContain('another-organisation');
    expect(root.textContent).toContain('playhouse-b');
    expect(root.textContent).not.toContain('playhouse-a');
  });

  it('labels unreported scope values explicitly', () => {
    organisation.set('');
    TestBed.inject(PlayroomStateService).selectPlayhouse('');
    const fixture = render();
    expect(
      [...fixture.nativeElement.querySelectorAll('li')].map((item: HTMLElement) =>
        item.textContent?.trim(),
      ),
    ).toEqual(['Not reported', 'Not reported']);
  });

  it('makes full long names available in hover and focus tooltips', () => {
    const longName = 'workspace-with-a-long-name-for-layout-experiments';
    organisation.set(longName);
    TestBed.inject(PlayroomStateService).selectPlayhouse(longName);
    const fixture = render(longName);
    const names = fixture.debugElement.queryAll(By.directive(Tooltip));
    expect(names).toHaveLength(3);
    for (const name of names) {
      const tooltip = name.injector.get(Tooltip);
      expect(tooltip.content).toBe(longName);
      expect(tooltip.tooltipEvent).toBe('both');
      const element = name.nativeElement as HTMLElement;
      expect(element.tabIndex).toBe(0);
      element.focus();
      expect(document.activeElement).toBe(element);
      expect(element.classList.contains('breadcrumb-name')).toBe(true);
    }
    fixture.destroy();
  });

  it('opens the existing chooser and reflects its dismissal', async () => {
    vi.spyOn(wailsApi, 'listContexts').mockResolvedValue([]);
    vi.spyOn(wailsApi, 'listOrganisations').mockResolvedValue([]);
    vi.spyOn(wailsApi, 'listPlayhouses').mockResolvedValue([
      {
        Slug: 'playhouse-a',
        Identity: 'demo-playhouse-a',
        Status: 'active',
        Region: 'eu-west-1',
        Version: 'v1.34.1',
        LayoutVersion: 12,
        LayoutStatus: 'current',
      },
    ]);
    const fixture = render();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.click();
    fixture.detectChanges();
    const [block] = await fixture.getDeferBlocks();
    await block.render(DeferBlockState.Complete);
    await fixture.whenStable();
    fixture.detectChanges();
    const chooser = fixture.debugElement.query(By.directive(PlayhouseChooserComponent))
      .componentInstance as PlayhouseChooserComponent;
    expect(chooser.visible).toBe(true);
    expect(chooser.selectedSlug()).toBe('playhouse-a');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    chooser.close();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fixture.destroy();
  });
});
