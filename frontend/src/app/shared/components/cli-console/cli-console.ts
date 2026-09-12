import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { CliConsoleService } from '../../../core/services/cli-console';
import { copyToClipboard } from '../../utils';

/**
 * The activity log panel: every acloud command this session ran, with its real
 * output. Opened deliberately, or by a failure, and dismissed like a dialog.
 */
@Component({
  selector: 'app-cli-console',
  imports: [ButtonModule],
  templateUrl: './cli-console.html',
  styleUrl: './cli-console.css',
  // Every value comes from signals, which notify on their own — and a streaming
  // command pushes thousands of lines through this template.
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CliConsoleComponent {
  readonly console = inject(CliConsoleService);

  private readonly output = viewChild<ElementRef<HTMLElement>>('output');

  constructor() {
    // Follow new output the way a terminal does, and jump to the command the
    // panel was opened for when there is one.
    effect(() => {
      this.console.lines();
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
    await copyToClipboard(
      this.console
        .lines()
        .map((line) => (line.kind === 'command' ? `$ ${line.text}` : line.text))
        .join('\n'),
    );
  }

  private scrollLogTo(focusOpId: string): void {
    const element = this.output()?.nativeElement;
    if (!element) return;

    if (focusOpId) {
      const anchor = element.querySelector<HTMLElement>(`[data-op="${focusOpId}"]`);
      if (anchor) {
        anchor.scrollIntoView({ block: 'start' });
        return;
      }
    }
    element.scrollTop = element.scrollHeight;
  }
}
