import { Component, Input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

/** Repeating string input used by env, git, copy and port flag lists. */
@Component({
  selector: 'app-string-list-editor',
  imports: [FormsModule, ButtonModule, InputTextModule],
  templateUrl: './string-list-editor.html',
})
export class StringListEditorComponent {
  readonly values = model.required<string[]>();

  @Input() label = '';
  @Input() placeholder = '';
  @Input() addLabel = 'add value';
  @Input() itemLabel = 'value';
  @Input() showHeader = true;
  @Input() grouped = true;

  filledValueCount(): number {
    return this.values().filter((value) => value.trim().length > 0).length;
  }

  replaceValueAt(index: number, value: string): void {
    const next = [...this.values()];
    next[index] = value;
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
