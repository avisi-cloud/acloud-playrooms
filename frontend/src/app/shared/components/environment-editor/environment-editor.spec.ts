import { TestBed } from '@angular/core/testing';
import { EnvironmentEditorComponent } from './environment-editor';
import { wailsApi } from '../../../core/services/wails-api';
import { EnvironmentService } from '../../../core/services/environment';

describe('EnvironmentEditorComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows presence only and warns about inline values', async () => {
    const check = vi.spyOn(wailsApi, 'getEnvironmentPresence').mockResolvedValue([
      { Key: 'PRESENT_KEY', Set: true },
      { Key: 'MISSING_KEY', Set: false },
    ]);
    const fixture = TestBed.createComponent(EnvironmentEditorComponent);
    fixture.componentRef.setInput('values', ['PRESENT_KEY', 'MISSING_KEY', 'DEMO=value']);
    fixture.detectChanges();
    await vi.waitFor(() => expect(fixture.componentInstance.hints()[0]).toBe('Set'));
    fixture.detectChanges();
    expect(fixture.componentInstance.hints()[1]).toBe('Not set');
    expect(fixture.nativeElement.textContent).toContain(
      'The value ends up in the command line. Use the bare KEY form',
    );
    TestBed.inject(EnvironmentService).setReadVariablesFromLoginShell(true);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(check).toHaveBeenLastCalledWith(['PRESENT_KEY', 'MISSING_KEY', 'DEMO=value'], true),
    );
    fixture.destroy();
  });

  it('reports check failures without claiming a key is missing', async () => {
    vi.spyOn(wailsApi, 'getEnvironmentPresence').mockRejectedValue(new Error('shell failed'));
    const fixture = TestBed.createComponent(EnvironmentEditorComponent);
    fixture.componentRef.setInput('values', ['DEMO_KEY']);
    fixture.detectChanges();
    await vi.waitFor(() =>
      expect(fixture.componentInstance.hints()[0]).toContain('Could not check'),
    );
    fixture.destroy();
  });
});
