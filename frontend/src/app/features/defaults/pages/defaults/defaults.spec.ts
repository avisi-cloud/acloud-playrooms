import { DEFAULT_FIELDS } from './defaults';

const RESOURCE_KEYS = ['cpu-request', 'cpu-limit', 'memory-request', 'memory-limit'];

describe('Defaults field registry', () => {
  // 0.35.0 accepts `none` for these four, and a slider can only offer what is
  // in its options list.
  it('offers none as a stop on every resource slider', () => {
    for (const key of RESOURCE_KEYS) {
      const field = DEFAULT_FIELDS.find((candidate) => candidate.key === key);
      expect(field, key).toBeDefined();
      expect(field?.options as string[], key).toContain('none');
      // First, so "unset" sits at one end of the track rather than mid-scale.
      expect((field?.options as string[])[0], key).toBe('none');
    }
  });

  it('defines every field exactly once', () => {
    const keys = DEFAULT_FIELDS.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every slider and static select usable options', () => {
    for (const field of DEFAULT_FIELDS) {
      if (field.kind === 'slider') expect(field.options?.length, field.key).toBeGreaterThan(1);
      if (field.kind === 'select' && !field.dynamicOptions) {
        expect(field.options?.length, field.key).toBeGreaterThan(0);
      }
    }
  });
});
