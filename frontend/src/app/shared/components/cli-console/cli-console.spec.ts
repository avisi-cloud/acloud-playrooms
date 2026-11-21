import { TestBed } from '@angular/core/testing';
import { CliConsoleComponent } from './cli-console';
import { ActivityEntry } from '../../../core/services/cli-console';
import { wailsApi } from '../../../core/services/wails-api';

const writeText = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  writeText.mockClear();
});

function entry(lines = 1): ActivityEntry {
  return {
    operationId: 'test',
    command: 'acloud demo',
    status: 'OK',
    durationMilliseconds: 1250,
    output: Array.from({ length: lines }, (_, index) => ({
      operationId: 'test',
      kind: 'stdout',
      text: `line ${index}`,
    })),
  };
}

describe('CliConsoleComponent', () => {
  it('folds long output and lets the user expand it', () => {
    const component = TestBed.createComponent(CliConsoleComponent).componentInstance;
    const long = entry(21);
    expect(component.outputExpanded(entry())).toBe(true);
    expect(component.outputExpanded(long)).toBe(false);
    component.toggleOutput(long);
    expect(component.outputExpanded(long)).toBe(true);
    const wide = entry();
    wide.operationId = 'wide';
    wide.output[0].text = 'a'.repeat(2001);
    expect(component.outputExpanded(wide)).toBe(false);
    expect(component.duration(long)).toBe('1.25 s');
    expect(component.duration({ ...long, durationMilliseconds: undefined })).toBe('Not reported');
  });

  it('copies only the selected entry command or output', async () => {
    const component = TestBed.createComponent(CliConsoleComponent).componentInstance;
    await component.copyEntry(entry(2), 'command');
    expect(writeText).toHaveBeenLastCalledWith('acloud demo');
    await component.copyEntry(entry(2), 'output');
    expect(writeText).toHaveBeenLastCalledWith('line 0\nline 1');
    expect(component.copied()).toBe('test-output');
  });

  it('exports the same text as whole-log copy and shows save failures', async () => {
    const component = TestBed.createComponent(CliConsoleComponent).componentInstance;
    component.console.recordHandoff('acloud demo', 'Terminal');
    const save = vi.spyOn(wailsApi, 'exportActivityLog').mockResolvedValue();
    await component.exportLog();
    await component.copyWholeLogToClipboard();
    expect(save).toHaveBeenCalledWith(component.console.logText());
    expect(writeText).toHaveBeenLastCalledWith(component.console.logText());
    save.mockRejectedValue(new Error('unwritable'));
    await component.exportLog();
    expect(component.exportError()).toContain('writable folder');
    save.mockResolvedValue();
    await component.exportLog();
    expect(component.exportError()).toBe('');
  });

  it('renders entry controls and an empty filter result', () => {
    const fixture = TestBed.createComponent(CliConsoleComponent);
    fixture.componentInstance.console.recordHandoff('acloud demo', 'Terminal');
    fixture.componentInstance.console.open();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Copy output');
    expect(fixture.nativeElement.textContent).toContain('Handed off');
    fixture.componentInstance.console.filter.set('failures');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No commands match these filters.');
  });
});
