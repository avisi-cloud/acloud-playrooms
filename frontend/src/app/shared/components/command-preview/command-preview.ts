import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  signal,
} from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { CommandPreview, copyToClipboard } from '../../utils';

// Input types are generated per command; the value is opaque here and only
// handed back to the matching backend function.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PreviewFunction = (input: any) => Promise<string[]>;

/**
 * The "Equivalent command" block: a monospace command line that copies on click.
 * Set [copyable]="false" for a read-only preview.
 */
@Component({
  selector: 'app-command-preview',
  imports: [ButtonModule],
  templateUrl: './command-preview.html',
  styleUrl: './command-preview.css',
  // Inputs are immutable snapshots and generated output/copy state are signals.
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommandPreviewComponent implements OnChanges {
  /** A prebuilt command remains supported for static/read-only callers. */
  @Input() command = '';
  /** Backend input used with [previewFn] to build the real command. */
  @Input() input: unknown = null;
  @Input() previewFn: PreviewFunction | null = null;
  /** Hidden overlays disable preview traffic and reset stale results. */
  @Input() enabled = true;
  @Input() label = 'Equivalent command';
  @Input() copyable = true;
  /** Tight top spacing — used where the preview sits directly under content. */
  @Input() tight = false;
  /** Shown dimmed until the backend returns the real arguments. */
  @Input() placeholder = 'building command…';

  readonly copied = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private preview: CommandPreview<unknown> | null = null;
  private activePreviewFn: PreviewFunction | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['previewFn'] || this.previewFn !== this.activePreviewFn) {
      this.activePreviewFn = this.previewFn;
      this.preview = this.previewFn ? new CommandPreview(this.previewFn) : null;
    }
    if (!this.enabled) {
      this.preview?.clear();
      return;
    }
    if (this.preview && this.input !== null && this.input !== undefined) {
      this.preview.refreshIfInputChanged(this.input);
    }
  }

  resolvedCommand(): string {
    return this.preview?.command() ?? this.command;
  }

  async copyCommandToClipboard(): Promise<void> {
    const command = this.resolvedCommand();
    if (!this.copyable || !command) return;
    await copyToClipboard(command);
    this.copied.set(true);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.copied.set(false), 1400);
  }
}
