import { DEFAULT_FIELDS, labelForDefaultKey, labelSpellsOutKey } from './defaults';

const RESOURCE_KEYS = ['cpu-request', 'cpu-limit', 'memory-request', 'memory-limit'];

describe('Defaults field registry', () => {
  // acloud accepts `none` for these four, and a slider can only offer what is
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

  it('gives every key acloud 0.37 reports a proper control instead of a text box', () => {
    const expectedKinds: Record<string, string> = {
      exposure: 'select',
      capabilities: 'select',
      'workspace-namespace': 'toggle',
      privileged: 'toggle',
    };
    for (const [key, kind] of Object.entries(expectedKinds)) {
      expect(DEFAULT_FIELDS.find((field) => field.key === key)?.kind, key).toBe(kind);
    }
  });

  it('labels a key with the words the create and update drawers use', () => {
    expect(labelForDefaultKey('cpu-request')).toBe('Guaranteed CPU');
    expect(labelForDefaultKey('read-only')).toBe('Read-only system files');
  });

  it('gives every known key a plain label of its own', () => {
    for (const field of DEFAULT_FIELDS) {
      expect(labelForDefaultKey(field.key), field.key).not.toBe(field.key);
    }
  });

  it('shows the key only where the label uses other words', () => {
    expect(labelSpellsOutKey('image')).toBe(true);
    expect(labelSpellsOutKey('proxy-group')).toBe(true);
    expect(labelSpellsOutKey('cpu-request')).toBe(false);
    expect(labelSpellsOutKey('some-new-key')).toBe(true);
  });

  // A newer CLI may report keys this build has never seen; they keep their name.
  it('keeps the key itself as the label of a key it does not know', () => {
    expect(labelForDefaultKey('some-new-key')).toBe('some-new-key');
    expect(labelForDefaultKey('toString')).toBe('toString');
  });
});
