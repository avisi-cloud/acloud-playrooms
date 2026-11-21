import { describeComparison, describeSetting } from './setting-changes';

describe('Setting comparisons', () => {
  it('shows only the current and proposed values for an edited setting', () => {
    expect(describeComparison(describeSetting('storage', 'Storage', '20Gi', '40Gi'))).toBe(
      '20Gi → 40Gi',
    );
  });

  it('marks a reported setting unchanged without repeating its label or value', () => {
    expect(describeComparison(describeSetting('image', 'Image', 'opencode', 'opencode'))).toBe(
      'Unchanged',
    );
  });

  it('shortens an unknown current value and hides an unknown unchanged setting', () => {
    expect(describeComparison(describeSetting('channel', 'Update channel', null, 'rapid'))).toBe(
      'Not reported → rapid',
    );
    expect(describeComparison(describeSetting('channel', 'Update channel', null, null))).toBe('');
    expect(describeComparison(undefined)).toBe('');
  });

  it('never compares run options or actions even when changed', () => {
    expect(
      describeComparison({
        ...describeSetting('resetAllowlist', 'Clear the allowlist first', null, 'Clear'),
        comparison: false,
      }),
    ).toBe('');
  });
});
