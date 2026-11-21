import { Component, Input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

let nextSuggestionListNumber = 1;

/** Pasting several lines fills one row per line; null leaves a single-line paste to the browser. */
export function valuesWithPastedLinesAt(
  values: string[],
  index: number,
  pastedText: string,
): string[] | null {
  const lines = pastedText
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;
  const replacesBlankRow = !values[index]?.trim();
  return [
    ...values.slice(0, replacesBlankRow ? index : index + 1),
    ...lines,
    ...values.slice(index + 1),
  ];
}

/** Repeating string input used by env, git, copy and port flag lists. */
@Component({
  selector: 'app-string-list-editor',
  imports: [FormsModule, ButtonModule, InputTextModule],
  templateUrl: './string-list-editor.html',
})
export class StringListEditorComponent {
  readonly values = model.required<string[]>();

  @Input() label = '';
  /** One line under the list saying what it does for you; nothing when empty. */
  @Input() hint = '';
  @Input() itemHints: string[] = [];
  /** Shown instead of the row's hint, in the error colour. */
  @Input() itemErrors: string[] = [];
  /** Offered while typing in any row. */
  @Input() suggestions: string[] = [];
  @Input() placeholder = '';
  @Input() addLabel = 'add value';
  @Input() itemLabel = 'value';
  @Input() showHeader = true;
  @Input() grouped = true;
  readonly suggestionListId = `string-list-suggestions-${nextSuggestionListNumber++}`;

  filledValueCount(): number {
    return this.values().filter((value) => value.trim().length > 0).length;
  }

  replaceValueAt(index: number, value: string): void {
    const next = [...this.values()];
    next[index] = value;
    this.values.set(next);
  }

  pasteLinesAt(index: number, event: ClipboardEvent): void {
    const next = valuesWithPastedLinesAt(
      this.values(),
      index,
      event.clipboardData?.getData('text') ?? '',
    );
    if (!next) return;
    event.preventDefault();
    this.values.set(next);
  }

  addBlankRow(): void {
    this.values.update((values) => [...values, '']);
  }

  removeValueAt(index: number): void {
    const next = this.values().filter((_, current) => current !== index);
    this.values.set(next.length ? next : ['']);
  }
}
