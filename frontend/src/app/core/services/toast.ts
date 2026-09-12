import { Injectable, inject } from '@angular/core';
import { MessageService, ToastMessageOptions } from 'primeng/api';
import { ToastMessage } from '../../shared/models';
import { describeError, explainFailure } from '../../shared/utils';

export type Tone = ToastMessage['tone'];

const SEVERITY: Record<Tone, string> = {
  ok: 'success',
  busy: 'info',
  warn: 'warn',
  bad: 'error',
  idle: 'secondary',
};

/**
 * How long a toast stays up, by tone. A failure waits to be dismissed; the
 * activity log behind it is the full story.
 */
const LIFE: Record<Tone, number | undefined> = {
  ok: 3600,
  busy: 3600,
  warn: 8000,
  bad: undefined, // sticky
  idle: 3600,
};

/**
 * What a toast carries beyond its two lines: the command it came from, so it
 * can link back into the activity log, and the remedy when the CLI named one.
 */
export interface ToastLink {
  operationId: string;
  remedy?: string;
}

/**
 * Thin wrapper around PrimeNG's MessageService. Centralizes the tone→severity
 * mapping that was previously duplicated as a `toast()` method in every screen.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly messages = inject(MessageService);

  /**
   * Short, tone-based toast. Pass the operation id behind it and the toast
   * becomes a way into the activity log.
   */
  toast(message: string, tone: Tone = 'ok', operationId = ''): void {
    this.messages.add({
      severity: SEVERITY[tone] ?? 'info',
      // A toast is a summary. Callers hand it whatever the CLI returned, which
      // has included an entire HTML error document.
      detail: describeError(message),
      life: LIFE[tone],
      sticky: LIFE[tone] === undefined,
      closable: true,
      data: operationId ? ({ operationId } satisfies ToastLink) : undefined,
    });
  }

  /**
   * A failed command as three lines, the way the CLI writes them: what the user
   * was doing, why it failed, and what to do about it. Sticky.
   */
  failure(whatFailed: string, error: unknown, operationId = ''): void {
    const { problem, remedy } = explainFailure(error);
    this.messages.add({
      severity: 'error',
      summary: whatFailed,
      detail: problem,
      sticky: true,
      closable: true,
      data: { operationId, remedy } satisfies ToastLink,
    });
  }

  /** Full passthrough for toasts that need a summary, custom life, etc. */
  show(options: ToastMessageOptions): void {
    this.messages.add(options);
  }
}
