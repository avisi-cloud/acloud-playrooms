import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  effect,
  inject,
  viewChild,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { wailsApi } from '../../../core/services/wails-api';
import { ActivityEntry } from '../../../core/services/cli-console';
import { ButtonModule } from 'primeng/button';
import { CliConsoleService } from '../../../core/services/cli-console';
import { copyToClipboard } from '../../utils';

/**
 * The activity log panel: every acloud command this session ran, with its real
 * output. Opened deliberately, or by a failure, and dismissed like a dialog.
 */
@Component({
  selector: 'app-cli-console',
  imports: [ButtonModule, DatePipe, FormsModule, InputTextModule, TagModule],
  templateUrl: './cli-console.html',
  styleUrl: './cli-console.css',
  // Every value comes from signals, which notify on their own — and a streaming
  // command pushes thousands of lines through this template.
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CliConsoleComponent {
  readonly console = inject(CliConsoleService);
  readonly exportError = signal('');
  readonly copied = signal('');
  private readonly expanded = signal<ReadonlyMap<string, boolean>>(new Map());

  outputExpanded(entry: ActivityEntry): boolean {
    return (
      this.expanded().get(entry.operationId) ??
      (entry.output.length <= 20 &&
        entry.output.reduce((length, line) => length + line.text.length, 0) <= 2000)
    );
  }

  toggleOutput(entry: ActivityEntry): void {
    this.expanded.update((expanded) =>
      new Map(expanded).set(entry.operationId, !this.outputExpanded(entry)),
    );
  }

  duration(entry: ActivityEntry): string {
    return entry.durationMilliseconds === undefined
      ? 'Not reported'
      : `${(entry.durationMilliseconds / 1000).toFixed(2)} s`;
  }

  async copyEntry(entry: ActivityEntry, kind: 'command' | 'output'): Promise<void> {
    await copyToClipboard(
      kind === 'command' ? entry.command : entry.output.map((line) => line.text).join('\n'),
    );
    this.copied.set(`${entry.operationId}-${kind}`);
  }

  async exportLog(): Promise<void> {
    this.exportError.set('');
    try {
      await wailsApi.exportActivityLog(this.console.logText());
    } catch {
      this.exportError.set('Could not export the log. Try again and choose a writable folder.');
    }
  }

  private readonly output = viewChild<ElementRef<HTMLElement>>('output');

  constructor() {
    // Follow new output the way a terminal does, and jump to the command the
    // panel was opened for when there is one.
    effect(() => {
      this.console.filteredEntries();
      const focus = this.console.focus();
      if (!this.console.visible()) return;
      queueMicrotask(() => this.scrollLogTo(focus));
    });
  }

  /** The other half of dismissing like a dialog. */
  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    if (this.console.visible()) this.console.close();
  }

  async copyWholeLogToClipboard(): Promise<void> {
    await copyToClipboard(this.console.logText());
  }

  private scrollLogTo(focusOpId: string): void {
    const element = this.output()?.nativeElement;
    if (!element) return;

    if (focusOpId) {
      const anchor = Array.from(element.querySelectorAll<HTMLElement>('[data-op]')).find(
        (entry) => entry.dataset['op'] === focusOpId,
      );
      if (anchor) {
        anchor.scrollIntoView({ block: 'start' });
        return;
      }
    }
    element.scrollTop = element.scrollHeight;
  }
}
