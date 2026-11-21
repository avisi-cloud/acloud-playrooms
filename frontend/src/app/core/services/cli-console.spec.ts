import { Events } from '@wailsio/runtime';
import { TestBed } from '@angular/core/testing';
import { CliConsoleService, PlayroomActivityScope, CliEvent } from './cli-console';

describe('Room-specific Activity access', () => {
  const scope: PlayroomActivityScope = { name: 'demo', playhouse: 'ph', scopeRevision: 0 };

  function record(scope: PlayroomActivityScope): string {
    const activity = TestBed.inject(CliConsoleService);
    const operationId = activity.recordHandoff('acloud playroom connect demo', 'Terminal');
    activity.associatePlayroom(operationId, scope);
    return operationId;
  }

  it('finds the latest retained command for exactly this room, playhouse and scope', () => {
    const activity = TestBed.inject(CliConsoleService);
    record(scope);
    const latest = record(scope);
    record({ ...scope, name: 'other' });
    record({ ...scope, playhouse: 'other' });
    record({ ...scope, scopeRevision: 1 });
    expect(activity.latestPlayroomOperation(scope)).toBe(latest);
  });

  it('does not turn unrelated or missing commands into room history', () => {
    const activity = TestBed.inject(CliConsoleService);
    activity.recordHandoff('acloud auth login', 'Terminal');
    activity.associatePlayroom('no-output', scope);
    expect(activity.latestPlayroomOperation(scope)).toBe('');
  });

  it('drops associations when the session log is cleared', () => {
    const activity = TestBed.inject(CliConsoleService);
    record(scope);
    activity.clearLog();
    expect(activity.latestPlayroomOperation(scope)).toBe('');
  });

  it('copies scope metadata so later form changes cannot reassign a command', () => {
    const submitted = { ...scope };
    const operationId = record(submitted);
    submitted.name = 'other';
    expect(TestBed.inject(CliConsoleService).latestPlayroomOperation(scope)).toBe(operationId);
  });
});

describe('Activity entries', () => {
  const startedAt = '2026-11-21T10:00:00.000Z';
  const endedAt = '2026-11-21T10:00:01.250Z';

  function emit(name: string, event: CliEvent): void {
    (
      window as unknown as { _wails: { dispatchWailsEvent: (event: Events.WailsEvent) => void } }
    )._wails.dispatchWailsEvent(new Events.WailsEvent(name, event));
  }

  function start(operationId: string): void {
    emit('cli:started', {
      operationId,
      startedAt,
      command: ['acloud', 'demo', '--token', '[redacted]'],
    });
  }

  it('groups interleaved output and records reported timing and success', () => {
    const activity = TestBed.inject(CliConsoleService);
    start('first');
    start('second');
    emit('cli:output', { operationId: 'first', stream: 'stdout', line: 'first output' });
    emit('cli:output', { operationId: 'second', stream: 'stderr', line: 'second output' });
    expect(activity.entries().map((entry) => entry.status)).toEqual(['Running', 'Running']);
    emit('cli:done', {
      operationId: 'first',
      startedAt,
      endedAt,
      durationMilliseconds: 1250,
      exitCode: 0,
    });
    expect(activity.entries()[0]).toMatchObject({
      startedAt,
      endedAt,
      durationMilliseconds: 1250,
      exitCode: 0,
      status: 'OK',
    });
    expect(activity.entries()[0].output.map((line) => line.text)).toEqual(['first output']);
    expect(activity.entries()[1].output.map((line) => line.text)).toEqual(['second output']);
  });

  it('combines failures only with case-insensitive output search and resets filters for a linked command', () => {
    const activity = TestBed.inject(CliConsoleService);
    start('success');
    emit('cli:output', { operationId: 'success', line: 'matching output' });
    emit('cli:done', { operationId: 'success', exitCode: 0 });
    start('failure');
    emit('cli:done', { operationId: 'failure', exitCode: 3, error: 'Matching failure' });
    activity.filter.set('failures');
    activity.search.set('MATCHING');
    expect(activity.filteredEntries().map((entry) => entry.operationId)).toEqual(['failure']);
    activity.search.set('absent');
    expect(activity.filteredEntries()).toEqual([]);
    activity.open('success');
    expect(activity.filter()).toBe('all');
    expect(activity.search()).toBe('');
    expect(activity.filteredEntries()).toHaveLength(2);
  });

  it('exports the whole retained redacted log including folded or filtered entries', () => {
    const activity = TestBed.inject(CliConsoleService);
    start('success');
    emit('cli:output', { operationId: 'success', line: 'secret is [redacted]' });
    emit('cli:done', {
      operationId: 'success',
      startedAt,
      endedAt,
      durationMilliseconds: 1250,
      exitCode: 0,
    });
    activity.filter.set('failures');
    expect(activity.filteredEntries()).toEqual([]);
    expect(activity.logText()).toContain('$ acloud demo --token [redacted]');
    expect(activity.logText()).toContain('Duration: 1250 ms | OK | Exit code: 0');
    expect(activity.logText()).toContain('secret is [redacted]');
    activity.clearLog();
    expect(activity.entries()).toEqual([]);
    expect(activity.logText()).toBe('');
  });

  it('keeps missing timing and terminal outcomes unknown', () => {
    const activity = TestBed.inject(CliConsoleService);
    activity.recordHandoff('acloud demo', 'Terminal');
    expect(activity.entries()[0].status).toBe('Handed off');
    expect(activity.entries()[0].exitCode).toBeUndefined();
    expect(activity.logText()).toContain('Duration: Not reported');
  });

  it('records a command that failed before starting without inventing a command or exit code', async () => {
    const activity = TestBed.inject(CliConsoleService);
    await expect(
      activity.run('Demo', async () => {
        throw new Error('Could not find acloud');
      }),
    ).rejects.toThrow('Could not find acloud');
    expect(activity.entries()[0]).toMatchObject({ command: '', status: 'Failed' });
    expect(activity.entries()[0].exitCode).toBeUndefined();
  });

  it('retains metadata for long output but drops entries outside the buffer', () => {
    const activity = TestBed.inject(CliConsoleService);
    start('old');
    emit('cli:done', { operationId: 'old', exitCode: 0 });
    start('long');
    for (let index = 0; index < 5001; index++)
      emit('cli:output', { operationId: 'long', line: String(index) });
    expect(activity.entries()).toHaveLength(1);
    expect(activity.entries()[0].command).toBe('acloud demo --token [redacted]');
    expect(activity.entries()[0].output).toHaveLength(5000);
  });
});
