import { Injectable, computed, signal } from '@angular/core';
import { Events } from '@wailsio/runtime';
import { newOperationId, wailsApi } from './wails-api';

export type LogKind = 'command' | 'stdout' | 'stderr' | 'failure' | 'cancelled' | 'spacer';

export interface LogLine {
  operationId: string;
  kind: LogKind;
  text: string;
}

export interface RunningOperation {
  operationId: string;
  title: string;
}

/** Mirrors gui/backend/cli.Event. */
interface CliEvent {
  operationId?: string;
  command?: string[];
  stream?: 'stdout' | 'stderr';
  line?: string;
  exitCode?: number;
  error?: string;
}

/** The most the log keeps, so a runaway command cannot grow the page. */
const MAX_LINES = 5000;

/**
 * The activity log: every acloud command the user started, in order, with its
 * real output. Memory only, and polled reads never appear here.
 */
@Injectable({ providedIn: 'root' })
export class CliConsoleService {
  /**
   * The log buffer, appended to in place. `equal: () => false` notifies on every
   * set, so a streamed command need not rebuild the array per line.
   */
  private readonly _lines = signal<LogLine[]>([], { equal: () => false });
  private readonly _running = signal<RunningOperation[]>([]);
  private readonly _visible = signal(false);
  private readonly _lastFailed = signal(false);
  private readonly _focus = signal('');

  /**
   * Operations the user asked to stop. A cancelled command still exits non-zero,
   * so without this it would be indistinguishable from a failure.
   */
  private readonly cancelled = new Set<string>();

  readonly lines = this._lines.asReadonly();
  readonly running = this._running.asReadonly();
  readonly visible = this._visible.asReadonly();
  readonly lastFailed = this._lastFailed.asReadonly();
  /** The operation the panel should scroll to when it opens. */
  readonly focus = this._focus.asReadonly();

  readonly isRunning = computed(() => this._running().length > 0);
  readonly isEmpty = computed(() => this._lines().length === 0);

  /** The operation a cancel button would stop: the most recently started one. */
  readonly cancellable = computed<RunningOperation | null>(() => {
    const running = this._running();
    return running.length > 0 ? running[running.length - 1] : null;
  });

  constructor() {
    Events.On('cli:started', (event) => this.recordCommandStarted(event.data as CliEvent));
    Events.On('cli:output', (event) => this.recordOutputLine(event.data as CliEvent));
    Events.On('cli:done', (event) => this.recordCommandFinished(event.data as CliEvent));
  }

  /**
   * Runs one command, logging it under an operation id the caller can put on a
   * toast. The error is recorded and re-thrown for the caller to act on.
   */
  async run<T>(title: string, action: (operationId: string) => Promise<T>): Promise<T> {
    const operationId = newOperationId();
    this._running.update((list) => [...list, { operationId, title }]);
    try {
      return await action(operationId);
    } catch (error) {
      // A command that never started emits no done event, so record it here.
      if (!this.hasLinesFor(operationId)) {
        this.appendLine({
          operationId,
          kind: this.cancelled.has(operationId) ? 'cancelled' : 'failure',
          text: String(error),
        });
      }
      if (!this.cancelled.has(operationId)) this.openLogBecauseSomethingFailed(operationId);
      throw error;
    } finally {
      this._running.update((list) => list.filter((op) => op.operationId !== operationId));
      this.cancelled.delete(operationId);
    }
  }

  /**
   * Records a command the GUI handed to the user's terminal, which emits no
   * events of its own. Returns the operation id, so a toast can link to it.
   */
  recordHandoff(command: string, destination: string): string {
    const operationId = newOperationId();
    if (!this.isEmpty()) this.appendLine({ operationId, kind: 'spacer', text: '' });
    this.appendLine({ operationId, kind: 'command', text: command });
    this.appendLine({ operationId, kind: 'stdout', text: `Handed to ${destination}.` });
    return operationId;
  }

  open(operationId = ''): void {
    this._focus.set(operationId);
    this._visible.set(true);
  }

  close(): void {
    this._visible.set(false);
  }

  toggle(): void {
    if (this._visible()) {
      this.close();
      return;
    }
    this.open();
  }

  clearLog(): void {
    this._lines.set([]);
    this._lastFailed.set(false);
  }

  /** Asks the backend to stop the most recently started running command. */
  async cancelMostRecentCommand(): Promise<void> {
    const target = this.cancellable();
    if (!target) return;
    // Marked before the call, so the done event is known to be a cancellation.
    this.cancelled.add(target.operationId);
    await wailsApi.cancelOperation(target.operationId);
  }

  private recordCommandStarted(event: CliEvent): void {
    if (!event.operationId) return;
    if (!this.isEmpty())
      this.appendLine({ operationId: event.operationId, kind: 'spacer', text: '' });
    this.appendLine({
      operationId: event.operationId,
      kind: 'command',
      text: (event.command ?? []).join(' '),
    });
  }

  private recordOutputLine(event: CliEvent): void {
    if (!event.operationId || event.line === undefined) return;
    this.appendLine({
      operationId: event.operationId,
      kind: event.stream === 'stderr' ? 'stderr' : 'stdout',
      text: event.line,
    });
  }

  private recordCommandFinished(event: CliEvent): void {
    if (!event.operationId) return;
    if (!event.error) return;
    if (this.cancelled.has(event.operationId)) {
      this.appendLine({ operationId: event.operationId, kind: 'cancelled', text: 'Cancelled.' });
      return;
    }
    this.appendLine({ operationId: event.operationId, kind: 'failure', text: event.error });
    this.openLogBecauseSomethingFailed(event.operationId);
  }

  /**
   * A failure opens the log at the command that failed, unless a drawer or
   * dialog is open — the panel sits below their masks.
   */
  private openLogBecauseSomethingFailed(operationId: string): void {
    this._lastFailed.set(true);
    if (document.querySelector('.p-drawer-mask, .p-dialog-mask')) return;
    this.open(operationId);
  }

  /** Appends one line, dropping the oldest once the cap is reached. */
  private appendLine(line: LogLine): void {
    const lines = this._lines();
    lines.push(line);
    if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
    this._lines.set(lines);
  }

  private hasLinesFor(operationId: string): boolean {
    return this._lines().some((line) => line.operationId === operationId);
  }
}
