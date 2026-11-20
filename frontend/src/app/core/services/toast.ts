import { Injectable, inject, signal } from '@angular/core';
import { MessageService, ToastMessageOptions } from 'primeng/api';
import { ToastMessage } from '../../shared/models';
import { describeError, explainFailure } from '../../shared/utils';

export type Tone = ToastMessage['tone'];
type NotificationSeverity = 'success' | 'info' | 'warn' | 'error' | 'secondary' | 'contrast';
type NotificationOptions = Omit<ToastMessageOptions, 'severity'> & {
  severity?: NotificationSeverity;
};

const SEVERITY: Record<Tone, NotificationSeverity> = {
  ok: 'success',
  busy: 'info',
  warn: 'warn',
  bad: 'error',
  idle: 'secondary',
};

const SEVERITY_LABELS: Record<NotificationSeverity, string> = {
  success: 'Success',
  info: 'Information',
  warn: 'Warning',
  error: 'Error',
  secondary: 'Information',
  contrast: 'Information',
};

export const NOTIFICATION_DURATION_MS = 5000;

export interface NotificationRecord {
  id: number;
  createdAt: Date;
  severity: NotificationSeverity;
  severityLabel: string;
  summary: string;
  detail: string;
  operationId: string;
  remedy: string;
}

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
  private readonly _history = signal<NotificationRecord[]>([]);
  private nextNotificationId = 0;
  readonly history = this._history.asReadonly();
  readonly historyVisible = signal(false);

  /** An operation id links the notification to its command in Activity. */
  toast(message: string, tone: Tone = 'ok', operationId = ''): void {
    this.show({
      severity: SEVERITY[tone],
      // A toast is a summary. Callers hand it whatever the CLI returned, which
      // has included an entire HTML error document.
      detail: describeError(message),
      closable: true,
      data: operationId ? ({ operationId } satisfies ToastLink) : undefined,
    });
  }

  /** Keeps the failed action, problem and remedy separate for readability. */
  failure(whatFailed: string, error: unknown, operationId = ''): void {
    const { problem, remedy } = explainFailure(error);
    this.show({
      severity: 'error',
      summary: whatFailed,
      detail: problem,
      closable: true,
      data: { operationId, remedy } satisfies ToastLink,
    });
  }

  /** All notifications share one expiry and remain available in this session. */
  show(options: NotificationOptions): void {
    const notification: NotificationRecord = {
      id: ++this.nextNotificationId,
      createdAt: new Date(),
      severity: options.severity ?? 'info',
      severityLabel: SEVERITY_LABELS[options.severity ?? 'info'],
      summary: options.summary ?? '',
      detail: options.detail ?? '',
      operationId: options.data?.operationId ?? '',
      remedy: options.data?.remedy ?? '',
    };
    this._history.update((history) => [notification, ...history]);
    this.messages.add({ ...options, life: NOTIFICATION_DURATION_MS, sticky: false });
  }
}
