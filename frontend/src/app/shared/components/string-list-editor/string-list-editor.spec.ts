import { TestBed } from '@angular/core/testing';
import { StringListEditorComponent, valuesWithPastedLinesAt } from './string-list-editor';

describe('StringListEditorComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StringListEditorComponent],
    }).compileComponents();
  });

  it('edits and appends values', () => {
    const fixture = TestBed.createComponent(StringListEditorComponent);
    fixture.componentRef.setInput('values', ['first']);
    const editor = fixture.componentInstance;

    editor.replaceValueAt(0, 'changed');
    editor.addBlankRow();

    expect(editor.values()).toEqual(['changed', '']);
  });

  it('retains one blank row after removing the last value', () => {
    const fixture = TestBed.createComponent(StringListEditorComponent);
    fixture.componentRef.setInput('values', ['only']);
    const editor = fixture.componentInstance;

    editor.removeValueAt(0);

    expect(editor.values()).toEqual(['']);
    expect(editor.filledValueCount()).toBe(0);
  });

  it('counts only non-blank entries', () => {
    const fixture = TestBed.createComponent(StringListEditorComponent);
    fixture.componentRef.setInput('values', ['', '  ', '3000']);
    expect(fixture.componentInstance.filledValueCount()).toBe(1);
  });

  it('shows the hint under the list only when one is given', () => {
    const fixture = TestBed.createComponent(StringListEditorComponent);
    fixture.componentRef.setInput('values', ['']);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.field-hint')).toBeNull();

    fixture.componentRef.setInput('hint', 'Copied from your Mac.');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.field-hint')?.textContent).toBe(
      'Copied from your Mac.',
    );
  });

  it('fills one row per pasted line', () => {
    const fixture = TestBed.createComponent(StringListEditorComponent);
    fixture.componentRef.setInput('values', ['first', '']);
    fixture.detectChanges();
    const paste = new Event('paste', { cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
      value: { getData: () => 'second\r\n\n  third  \n' },
    });
    fixture.nativeElement.querySelectorAll('input')[1].dispatchEvent(paste);

    expect(paste.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.values()).toEqual(['first', 'second', 'third']);
  });

  it('shows an item error instead of its hint', () => {
    const fixture = TestBed.createComponent(StringListEditorComponent);
    fixture.componentRef.setInput('values', ['bad']);
    fixture.componentRef.setInput('itemHints', ['A hint']);
    fixture.componentRef.setInput('itemErrors', ['Wrong']);
    fixture.detectChanges();
    const hint = fixture.nativeElement.querySelector('.field-hint');
    expect(hint.textContent.trim()).toBe('Wrong');
    expect(hint.classList).toContain('error');
  });
});

describe('valuesWithPastedLinesAt', () => {
  it('leaves a single-line paste to the browser', () => {
    expect(valuesWithPastedLinesAt([''], 0, 'one')).toBeNull();
    expect(valuesWithPastedLinesAt([''], 0, 'one\n')).toBeNull();
  });

  it('replaces a blank row and inserts after a filled one', () => {
    expect(valuesWithPastedLinesAt(['a', '', 'c'], 1, 'x\ny')).toEqual(['a', 'x', 'y', 'c']);
    expect(valuesWithPastedLinesAt(['a', 'c'], 0, 'x\ny')).toEqual(['a', 'x', 'y', 'c']);
  });
});
