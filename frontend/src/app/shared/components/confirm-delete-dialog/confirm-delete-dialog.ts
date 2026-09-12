import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { CommandPreviewComponent, PreviewFunction } from '../command-preview/command-preview';

/**
 * Typed-confirmation delete dialog, shared by the playroom and playhouse
 * deletes. Emits (confirm) only once the typed text matches [confirmTarget].
 */
@Component({
  selector: 'app-confirm-delete-dialog',
  imports: [FormsModule, DialogModule, ButtonModule, InputTextModule, CommandPreviewComponent],
  templateUrl: './confirm-delete-dialog.html',
  styleUrl: './confirm-delete-dialog.css',
})
export class ConfirmDeleteDialog implements OnChanges {
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();

  @Input() title = '';
  @Input() subtitle = '';
  @Input() warning = '';
  @Input({ required: true }) confirmTarget = '';
  @Input() confirmLabel = 'Confirm name';
  @Input() showHint = true;
  @Input() command = '';
  @Input() previewInput: unknown = null;
  @Input() previewFn: PreviewFunction | null = null;
  @Input() width = '480px';
  @Input() deleteLabel = 'Delete';

  @Output() confirm = new EventEmitter<void>();

  confirmText = '';
  touched = false;

  /**
   * Whether what has been typed is a near miss worth explaining. Trimmed, and
   * only once the field has been used, so an empty field is not scolded.
   */
  typedTextIsANearMiss(): boolean {
    return this.touched && this.confirmText.trim().length > 0 && !this.typedTextMatchesTarget();
  }

  typedTextMatchesTarget(): boolean {
    return this.confirmText.trim() === this.confirmTarget.trim();
  }

  get dialogStyle(): Record<string, string> {
    return { width: this.width };
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && this.visible) {
      this.confirmText = '';
      this.touched = false;
    }
  }

  onVisibleChange(value: boolean): void {
    this.visible = value;
    this.visibleChange.emit(value);
  }

  close(): void {
    this.onVisibleChange(false);
  }

  confirmIfTypedTextMatches(): void {
    if (!this.typedTextMatchesTarget()) return;
    this.confirm.emit();
  }
}
