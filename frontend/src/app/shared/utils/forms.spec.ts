import { describe, expect, it } from 'vitest';
import { DEFAULTS } from '../data/defaults';
import {
  DefaultsLookup,
  NAME_RE,
  blankCreateForm,
  capabilitiesOrBlank,
  findImageEntry,
  parseRenderedPorts,
  storageDoesNotGrow,
  storageSizeInBytes,
} from './forms';

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

  it('seeds the capability profile and namespace toggle from the configured defaults', () => {
    const form = blankCreateForm(
      'ph',
      lookup({ capabilities: 'standard', 'workspace-namespace': 'true' }),
    );
    expect(form.capabilities).toBe('standard');
    expect(form.workspaceNamespace).toBe(true);
    expect(form.capAdd).toEqual(['']);
  });

  it('starts without a namespace and with acloud choosing the profile when nothing is configured', () => {
    const form = blankCreateForm('ph');
    expect(form.capabilities).toBe('');
    expect(form.workspaceNamespace).toBe(false);
  });
});

describe('capabilitiesOrBlank', () => {
  it('keeps a known profile', () => {
    expect(capabilitiesOrBlank('minimal')).toBe('minimal');
    expect(capabilitiesOrBlank('standard')).toBe('standard');
  });

  it('leaves an unknown value to acloud instead of guessing a profile', () => {
    expect(capabilitiesOrBlank('everything')).toBe('');
    expect(capabilitiesOrBlank('')).toBe('');
  });
});

describe('findImageEntry', () => {
  const images = [
    {
      Name: 'claude-code-dind',
      Reference: 'registry/claude-code-dind:latest',
      Description: 'Docker',
      IsDefault: false,
      RequiresPrivileged: true,
    },
  ];

  it('finds a catalog alias, ignoring surrounding spaces', () => {
    expect(findImageEntry(images, ' claude-code-dind ')?.RequiresPrivileged).toBe(true);
  });

  it('finds nothing for a typed registry path', () => {
    expect(findImageEntry(images, 'registry.example.com/custom:1')).toBeUndefined();
  });
});

describe('storageSizeInBytes', () => {
  it('reads binary and decimal suffixes the way Kubernetes does', () => {
    expect(storageSizeInBytes('20Gi')).toBe(20 * 2 ** 30);
    expect(storageSizeInBytes('512Mi')).toBe(512 * 2 ** 20);
    expect(storageSizeInBytes('20G')).toBe(20e9);
    expect(storageSizeInBytes('1.5Ti')).toBe(1.5 * 2 ** 40);
  });

  it('reads a plain number as bytes, ignoring surrounding spaces', () => {
    expect(storageSizeInBytes(' 21474836480 ')).toBe(21474836480);
  });

  it('returns undefined for anything it cannot read, instead of guessing', () => {
    for (const quantity of ['', 'none', '20gb', '20 Gi', 'Gi', '-5Gi']) {
      expect(storageSizeInBytes(quantity), quantity).toBeUndefined();
    }
  });
});

describe('storageDoesNotGrow', () => {
  it('allows a larger size, in any unit', () => {
    expect(storageDoesNotGrow('20Gi', '30Gi')).toBe(false);
    expect(storageDoesNotGrow('20Gi', '1Ti')).toBe(false);
    expect(storageDoesNotGrow('20Gi', '22G')).toBe(false);
  });

  it('refuses the same or a smaller size, also when written differently', () => {
    expect(storageDoesNotGrow('20Gi', '20Gi')).toBe(true);
    expect(storageDoesNotGrow('20Gi', '10Gi')).toBe(true);
    expect(storageDoesNotGrow('20Gi', '21474836480')).toBe(true);
    expect(storageDoesNotGrow('20Gi', '20G')).toBe(true);
  });

  it('leaves an empty or unreadable size to acloud', () => {
    expect(storageDoesNotGrow('20Gi', '')).toBe(false);
    expect(storageDoesNotGrow('20Gi', 'lots')).toBe(false);
    expect(storageDoesNotGrow('', '10Gi')).toBe(false);
    expect(storageDoesNotGrow('unknown', '10Gi')).toBe(false);
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
