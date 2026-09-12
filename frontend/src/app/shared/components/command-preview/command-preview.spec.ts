import { TestBed } from '@angular/core/testing';
import { CommandPreviewComponent } from './command-preview';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('CommandPreviewComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommandPreviewComponent],
    }).compileComponents();
  });

  it('builds a command from its backend function and input', async () => {
    const fixture = TestBed.createComponent(CommandPreviewComponent);
    const preview = vi.fn().mockResolvedValue(['acloud', 'playroom', 'create', 'demo']);
    fixture.componentRef.setInput('previewFn', preview);
    fixture.componentRef.setInput('input', { Name: 'demo' });
    fixture.detectChanges();
    await flush();

    expect(fixture.componentInstance.resolvedCommand()).toBe('acloud playroom create demo');
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it('deduplicates structurally equal inputs', async () => {
    const fixture = TestBed.createComponent(CommandPreviewComponent);
    const preview = vi.fn().mockResolvedValue(['acloud']);
    fixture.componentRef.setInput('previewFn', preview);
    fixture.componentRef.setInput('input', { Name: 'demo' });
    fixture.detectChanges();
    fixture.componentRef.setInput('input', { Name: 'demo' });
    fixture.detectChanges();
    await flush();

    expect(preview).toHaveBeenCalledTimes(1);
  });

  it('clears and stops fetching while disabled', async () => {
    const fixture = TestBed.createComponent(CommandPreviewComponent);
    const preview = vi.fn().mockResolvedValue(['acloud']);
    fixture.componentRef.setInput('previewFn', preview);
    fixture.componentRef.setInput('input', { Name: 'demo' });
    fixture.detectChanges();
    await flush();
    fixture.componentRef.setInput('enabled', false);
    fixture.detectChanges();

    expect(fixture.componentInstance.resolvedCommand()).toBe('');
  });
});
