import { TestBed } from '@angular/core/testing';
import { CliConsoleService, PlayroomActivityScope } from './cli-console';

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
