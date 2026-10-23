import { describe, expect, it } from 'vitest';
import { describeOutdated, renderCapabilities } from './playroom-outdated';

describe('describeOutdated', () => {
  it('says nothing about a current room', () => {
    expect(describeOutdated({ outdated: false, ephemeral: false })).toBeNull();
  });

  it('sends an outdated persistent room to the update', () => {
    expect(describeOutdated({ outdated: true, ephemeral: false })?.opensUpdate).toBe(true);
  });

  // playroom update refuses an ephemeral room, so the badge must not offer it.
  it('tells an outdated disposable room to be recreated instead', () => {
    const badge = describeOutdated({ outdated: true, ephemeral: true });
    expect(badge?.opensUpdate).toBe(false);
    expect(badge?.hint).toContain('create a new one');
  });
});

describe('renderCapabilities', () => {
  it('shows the profile with any additions, like acloud', () => {
    expect(renderCapabilities({ capabilityProfile: 'minimal', capabilityAdditions: [] })).toBe(
      'minimal',
    );
    expect(
      renderCapabilities({
        capabilityProfile: 'minimal',
        capabilityAdditions: ['NET_RAW', 'SYS_PTRACE'],
      }),
    ).toBe('minimal + NET_RAW,SYS_PTRACE');
  });

  it('shows nothing when acloud did not report a profile', () => {
    expect(renderCapabilities({ capabilityProfile: '', capabilityAdditions: [] })).toBe('');
  });
});
