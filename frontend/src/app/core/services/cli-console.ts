import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Events } from '@wailsio/runtime';
import { runtimeMode } from '../development/runtime-mode';
import { onDummyActivityEvent } from '../dummy/activity-events';
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

export interface PlayroomActivityScope {
  name: string;
  playhouse: string;
  scopeRevision: number;
}

interface PlayroomOperation extends PlayroomActivityScope {
  operationId: string;
}

/** Mirrors gui/backend/cli.Event. */
export interface CliEvent {
  startedAt?: string;
  endedAt?: string;
  durationMilliseconds?: number;
  operationId?: string;
  command?: string[];
  stream?: 'stdout' | 'stderr';
  line?: string;
  exitCode?: number;
  error?: string;
}

export type ActivityStatus =
  'OK' | 'Failed' | 'Running' | 'Cancelled' | 'Handed off' | 'Not reported';
export interface ActivityEntry {
  operationId: string;
  command: string;
  output: LogLine[];
  startedAt?: string;
  endedAt?: string;
  durationMilliseconds?: number;
  exitCode?: number;
  status: ActivityStatus;
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
  private readonly metadata = signal<ReadonlyMap<string, Omit<ActivityEntry, 'output'>>>(new Map());
  private readonly _running = signal<RunningOperation[]>([]);
  private readonly _visible = signal(false);
  private readonly _lastFailed = signal(false);
  private readonly _focus = signal('');
  private readonly playroomOperations = signal<PlayroomOperation[]>([]);

  /**
   * Operations the user asked to stop. A cancelled command still exits non-zero,
   * so without this it would be indistinguishable from a failure.
   */
  private readonly cancelled = new Set<string>();

  readonly lines = this._lines.asReadonly();
  readonly entries = computed(() => {
    const entries = new Map<string, ActivityEntry>();
    for (const line of this.lines()) {
      if (line.kind === 'spacer') continue;
      let entry = entries.get(line.operationId);
      if (!entry) {
        entry = {
          operationId: line.operationId,
          command: '',
          status: 'Not reported',
          ...this.metadata().get(line.operationId),
          output: [],
        };
        entries.set(line.operationId, entry);
      }
      if (line.kind === 'command') entry.command = line.text;
      else entry.output.push(line);
    }
    return [...entries.values()];
  });
  readonly filter = signal<'all' | 'failures'>('all');
  readonly search = signal('');
  readonly filteredEntries = computed(() => {
    const search = this.search().toLocaleLowerCase();
    return this.entries().filter(
      (entry) =>
        (this.filter() === 'all' || entry.status === 'Failed') &&
        (search === '' ||
          entry.output.some((line) => line.text.toLocaleLowerCase().includes(search))),
    );
  });
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
    const receive = (name: 'cli:started' | 'cli:output' | 'cli:done', event: CliEvent) => {
      if (name === 'cli:started') this.recordCommandStarted(event);
      else if (name === 'cli:output') this.recordOutputLine(event);
      else this.recordCommandFinished(event);
    };
    const unsubscribe = runtimeMode.dummy
      ? [onDummyActivityEvent(receive)]
      : (['cli:started', 'cli:output', 'cli:done'] as const).map((name) =>
          Events.On(name, (event) => receive(name, event.data as CliEvent)),
        );
    inject(DestroyRef).onDestroy(() => unsubscribe.forEach((off) => off()));
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
        this.setMetadata(operationId, { status: 'Failed' });
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
    this.setMetadata(operationId, {
      command,
      status: 'Handed off',
      startedAt: new Date().toISOString(),
    });
    if (!this.isEmpty()) this.appendLine({ operationId, kind: 'spacer', text: '' });
    this.appendLine({ operationId, kind: 'command', text: command });
    this.appendLine({ operationId, kind: 'stdout', text: `Handed to ${destination}.` });
    return operationId;
  }

  open(operationId = ''): void {
    this.filter.set('all');
    this.search.set('');
    this._focus.set(operationId);
    this._visible.set(true);
  }

  associatePlayroom(operationId: string, scope: PlayroomActivityScope): void {
    this.playroomOperations.update((operations) =>
      [
        ...operations.filter((operation) => operation.operationId !== operationId),
        { ...scope, operationId },
      ].slice(-MAX_LINES),
    );
  }

  /** Scope is captured when the command starts, not when its output arrives. */
  latestPlayroomOperation(scope: PlayroomActivityScope): string {
    const retainedOperations = new Set(this.lines().map((line) => line.operationId));
    return (
      this.playroomOperations()
        .slice()
        .reverse()
        .find(
          (operation) =>
            operation.name === scope.name &&
            operation.playhouse === scope.playhouse &&
            operation.scopeRevision === scope.scopeRevision &&
            retainedOperations.has(operation.operationId),
        )?.operationId ?? ''
    );
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
    this.metadata.set(new Map());
    this.playroomOperations.set([]);
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
    this.setMetadata(event.operationId, {
      command: (event.command ?? []).join(' '),
      status: 'Running',
      startedAt: event.startedAt,
    });
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
    this.setMetadata(event.operationId, {
      startedAt: event.startedAt ?? this.metadata().get(event.operationId)?.startedAt,
      endedAt: event.endedAt,
      durationMilliseconds: event.durationMilliseconds,
      exitCode: event.exitCode,
      status: this.cancelled.has(event.operationId)
        ? 'Cancelled'
        : event.error || (event.exitCode !== undefined && event.exitCode !== 0)
          ? 'Failed'
          : event.exitCode === 0
            ? 'OK'
            : 'Not reported',
    });
    if (!event.error && (event.exitCode === undefined || event.exitCode === 0)) return;
    if (this.cancelled.has(event.operationId)) {
      this.appendLine({ operationId: event.operationId, kind: 'cancelled', text: 'Cancelled.' });
      return;
    }
    this.appendLine({
      operationId: event.operationId,
      kind: 'failure',
      text: event.error ?? `Exit code ${event.exitCode}`,
    });
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
    if (lines.length > MAX_LINES) {
      lines.splice(0, lines.length - MAX_LINES);
      const retained = new Set(lines.map((line) => line.operationId));
      this.metadata.update((metadata) => new Map([...metadata].filter(([id]) => retained.has(id))));
    }
    this._lines.set(lines);
  }

  logText(): string {
    return this.entries()
      .map((entry) =>
        [
          `$ ${entry.command || 'Command not reported'}`,
          `Started: ${entry.startedAt ?? 'Not reported'} | Duration: ${entry.durationMilliseconds === undefined ? 'Not reported' : `${entry.durationMilliseconds} ms`} | ${entry.status} | Exit code: ${entry.exitCode ?? 'Not reported'}`,
          ...entry.output.map((line) => line.text),
        ].join('\n'),
      )
      .join('\n\n');
  }

  private setMetadata(operationId: string, values: Partial<Omit<ActivityEntry, 'output'>>): void {
    this.metadata.update((metadata) =>
      new Map(metadata).set(operationId, {
        operationId,
        command: '',
        status: 'Not reported',
        ...metadata.get(operationId),
        ...values,
      }),
    );
  }

  private hasLinesFor(operationId: string): boolean {
    return this._lines().some((line) => line.operationId === operationId);
  }
}
