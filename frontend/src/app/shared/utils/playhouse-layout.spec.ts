import { describe, expect, it } from 'vitest';
import { describeLayout } from './playhouse-layout';

describe('describeLayout', () => {
  it('labels a current layout without offering an update', () => {
    expect(describeLayout('current')).toMatchObject({ label: 'Up to date', opensUpdate: false });
  });

  it('sends an outdated playhouse to the update', () => {
    expect(describeLayout('outdated')?.opensUpdate).toBe(true);
  });

  // update refuses a layout from a newer acloud, so the badge must not offer it.
  it('does not offer an update for a layout from a newer acloud', () => {
    expect(describeLayout('newer')?.opensUpdate).toBe(false);
  });

  it('shows an unread layout as unknown instead of guessing', () => {
    expect(describeLayout('unknown').label).toBe('Unknown');
  });

  it('keeps missing and unrecognised statuses unknown', () => {
    for (const status of ['', undefined, 'future-status']) {
      expect(describeLayout(status)).toMatchObject({ label: 'Unknown', opensUpdate: false });
    }
  });
});
