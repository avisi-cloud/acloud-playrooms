import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../data/defaults';
import { DefaultsLookup, NAME_RE, blankCreateForm, parseRenderedPorts } from './forms';

/** A stand-in for PlayroomDefaultsService holding whatever the test needs. */
function lookup(values: Record<string, string>): DefaultsLookup {
  return {
    configuredText: (key, fallback = '') => values[key] ?? fallback,
    configuredToggle: (key, fallback) => (key in values ? values[key] === 'true' : fallback),
  };
}

describe('NAME_RE', () => {
  it('accepts DNS-1123 names', () => {
    for (const name of ['a', 'demo', 'my-room-2', 'a1', 'a'.repeat(50)]) {
      expect(NAME_RE.test(name), name).toBe(true);
    }
  });

  it('rejects anything the cluster would reject', () => {
    for (const name of [
      '',
      '-lead',
      'trail-',
      'Upper',
      'under_score',
      'dot.dot',
      'a'.repeat(51),
      'sp ace',
    ]) {
      expect(NAME_RE.test(name), name).toBe(false);
    }
  });
});

describe('blankCreateForm', () => {
  it('falls back to the built-in constants when no defaults are supplied', () => {
    const form = blankCreateForm('playhouse-demo');
    expect(form.playhouse).toBe('playhouse-demo');
    expect(form.storage).toBe(DEFAULTS.storage);
    expect(form.cpuReq).toBe(DEFAULTS.cpuReq);
    expect(form.waitTimeout).toBe(DEFAULTS.waitTimeout);
    expect(form.readOnly).toBe(true);
  });

  it('prefers the user configured defaults, which is the whole point', () => {
    // The Defaults screen used to change nothing about what the GUI created,
    // because this form filled itself from constants.
    const form = blankCreateForm(
      'ph',
      lookup({
        storage: '50Gi',
        'cpu-request': '2',
        'memory-limit': '8Gi',
        'wait-timeout': '30m',
        'ssh-key': '~/.ssh/work',
        'proxy-group': 'team',
        'read-only': 'false',
      }),
    );
    expect(form.storage).toBe('50Gi');
    expect(form.cpuReq).toBe('2');
    expect(form.memLim).toBe('8Gi');
    expect(form.waitTimeout).toBe('30m');
    expect(form.sshKey).toBe('~/.ssh/work');
    expect(form.proxyGroup).toBe('team');
    expect(form.readOnly).toBe(false);
  });

  it('falls back per key, so an unknown key does not blank the field', () => {
    const form = blankCreateForm('ph', lookup({ storage: '20Gi' }));
    expect(form.storage).toBe('20Gi');
    expect(form.cpuLim).toBe(DEFAULTS.cpuLim);
  });

  it('treats an empty configured value as unset rather than as a blank field', () => {
    const form = blankCreateForm('ph', lookup({ storage: '' }));
    expect(form.storage).toBe(DEFAULTS.storage);
  });

  it('starts privileged off and unacknowledged regardless of anything else', () => {
    const form = blankCreateForm('ph', lookup({ privileged: 'true' }));
    expect(form.privileged).toBe(false);
    expect(form.acknowledgePrivileged).toBe(false);
  });

  it('leaves exposure unset so the playhouse default applies', () => {
    expect(blankCreateForm('ph').exposure).toBe('');
  });
});

describe('parseRenderedPorts', () => {
  it('turns the rendered arrow form back into flag values', () => {
    expect(parseRenderedPorts('3000, 80 → 8080')).toEqual(['3000', '80:8080']);
  });

  it('tolerates spacing around the arrow', () => {
    expect(parseRenderedPorts('80→8080')).toEqual(['80:8080']);
  });

  it('yields a single blank entry for no ports, so the form has one empty row', () => {
    expect(parseRenderedPorts('')).toEqual(['']);
    expect(parseRenderedPorts('  ,  ')).toEqual(['']);
  });
});
