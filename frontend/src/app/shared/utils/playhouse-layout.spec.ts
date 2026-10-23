import { describe, expect, it } from 'vitest';
import { describeLayout } from './playhouse-layout';

describe('describeLayout', () => {
  it('says nothing about a current layout', () => {
    expect(describeLayout('current')).toBeNull();
  });

  it('sends an outdated playhouse to the update', () => {
    expect(describeLayout('outdated')?.opensUpdate).toBe(true);
  });

  // update refuses a layout from a newer acloud, so the badge must not offer it.
  it('does not offer an update for a layout from a newer acloud', () => {
    expect(describeLayout('newer')?.opensUpdate).toBe(false);
  });

  it('shows an unread layout as unknown instead of guessing', () => {
    expect(describeLayout('unknown')?.label).toBe('layout unknown');
  });

  it('says nothing when acloud reported no status', () => {
    expect(describeLayout('')).toBeNull();
    expect(describeLayout(undefined)).toBeNull();
  });
});
