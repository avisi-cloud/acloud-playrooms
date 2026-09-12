import { TestBed } from '@angular/core/testing';
import { StringListEditorComponent } from './string-list-editor';

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
});
