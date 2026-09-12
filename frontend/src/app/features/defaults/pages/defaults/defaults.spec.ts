import { DEFAULT_FIELDS } from './defaults';

describe('Defaults field registry', () => {
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
