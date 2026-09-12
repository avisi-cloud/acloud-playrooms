import { describe, expect, it } from 'vitest';
import { describeError, explainFailure } from './cli-error';

describe('explainFailure', () => {
  it('splits the CLI template into what went wrong and what to do about it', () => {
    const message =
      'playroom "ai-buddy" is owned by jasper@avisi.nl, not you (sem@avisi.nl); pass --force to act on it anyway';

    expect(explainFailure(message)).toEqual({
      problem: 'Playroom "ai-buddy" is owned by jasper@avisi.nl, not you (sem@avisi.nl)',
      remedy: 'Pass --force to act on it anyway',
    });
  });

  it('reads the message out of a rejected binding call', () => {
    const thrown = new Error(
      JSON.stringify({
        message: 'no playroom "ghost" in playhouse "playhouse-ame"',
        cause: { Arguments: ['playroom', 'start', 'ghost'], ExitCode: 1 },
      }),
    );

    expect(explainFailure(thrown).problem).toBe('No playroom "ghost" in playhouse "playhouse-ame"');
  });

  it('reads it out of the same call stringified, prefix and all', () => {
    const stringified = `Error: ${JSON.stringify({ message: 'playhouse must not be empty' })}`;

    expect(explainFailure(stringified).problem).toBe('Playhouse must not be empty');
  });

  it('takes the lines a failure printed after itself as the remedy', () => {
    const message =
      'cluster did not start within timeout\n\nThis is always safe to re-run to resume where it left off:\n  acloud playhouse create demo';

    expect(explainFailure(message)).toEqual({
      problem: 'Cluster did not start within timeout',
      remedy:
        'This is always safe to re-run to resume where it left off: acloud playhouse create demo',
    });
  });

  it('leaves a message that follows no template as one problem with no remedy', () => {
    expect(explainFailure('--port none cannot be combined with other --port values')).toEqual({
      problem: '--port none cannot be combined with other --port values',
      remedy: '',
    });
  });

  it('says something a user can act on when the command said nothing', () => {
    expect(explainFailure('   ').problem).toBe('The command failed. Open Activity for the output.');
  });

  it('reduces an HTML error page to what it actually said', () => {
    const page =
      '<!DOCTYPE html><html lang="en"><body><pre>Cannot POST /wails/runtime</pre></body></html>';

    expect(explainFailure(page).problem).toBe('Cannot POST /wails/runtime');
  });
});

describe('describeError', () => {
  it('is the problem on its own, for places with room for one line', () => {
    expect(describeError('playroom "x" is owned by someone else; pass --force to act on it')).toBe(
      'Playroom "x" is owned by someone else',
    );
  });

  it('truncates a message too long for the space it has', () => {
    expect(describeError('a'.repeat(400)).length).toBe(160);
  });
});
