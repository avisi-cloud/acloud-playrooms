import { describe, expect, it } from 'vitest';
import * as playhouseModels from '../../../../bindings/github.com/avisi-cloud/acloud-playrooms/backend/playhouse/models';
import * as playroomModels from '../../../../bindings/github.com/avisi-cloud/acloud-playrooms/backend/playroom/models';

/**
 * The other half of the Go parity test: every field on a generated input model
 * is either wired to a control, or listed below with a reason.
 */

/** Fields the UI sets, per input model. */
const WIRED: Record<string, string[]> = {
  'playroom.CreateInput': [
    'Name',
    'Playhouse',
    'Image',
    'Storage',
    'CPURequest',
    'CPULimit',
    'MemoryRequest',
    'MemoryLimit',
    'SSHKey',
    'EnvVars',
    'GitRepos',
    'Copies',
    'Ports',
    'ProxyGroup',
    'Exposure',
    'Ephemeral',
    'ReadOnly',
    'Privileged',
    'NoWait',
    'WaitTimeout',
    'ForceInstall',
  ],
  'playroom.UpdateInput': [
    'Name',
    'Playhouse',
    'Image',
    'CPURequest',
    'CPULimit',
    'MemRequest',
    'MemLimit',
    'Exposure',
    'ChangeReadOnly',
    'ReadOnly',
    'ChangePorts',
    'Ports',
    'NoWait',
    'WaitTimeout',
  ],
  'playroom.DeleteInput': ['Name', 'Playhouse', 'Force', 'NoWait', 'WaitTimeout'],
  'playroom.StartInput': ['Name', 'Playhouse', 'NoWait'],
  'playroom.StopInput': ['Name', 'Playhouse'],
  'playroom.OpenInput': ['Name', 'Playhouse', 'Editor', 'Tunnel'],
  'playroom.ConnectInput': ['Name', 'Playhouse', 'User', 'ForwardAgent', 'Tunnel', 'Terminal'],
  'playroom.ListInput': ['Playhouse'],
  'playhouse.CreateInput': [
    'Name',
    'CloudAccount',
    'Region',
    'Environment',
    'Version',
    'UpdateChannel',
    'MaintenanceScheduleIdentity',
    'NodeType',
    'SystemNodeType',
    'PlayroomNodeType',
    'PrivilegedNodeType',
    'NodeCount',
    'MaxPlayroomNodes',
    'MaxPrivilegedNodes',
    'Exposure',
    'TailscaleOAuthClientID',
    'TailscaleOAuthClientSecret',
    'WaitTimeout',
    'NoDefault',
  ],
  'playhouse.DeleteInput': ['Name', 'Force', 'NoWait', 'WaitTimeout'],
};

/**
 * Fields with no control, and why. A reason is required; "not done yet" is a
 * reason, and an honest one.
 */
const UNWIRED: Record<string, Record<string, string>> = {
  'playroom.CreateInput': {},
  'playroom.UpdateInput': {
    Force: 'Update targets a room the user is looking at; the owner guard is wanted here.',
    ForceInstall:
      'Session refresh is not a per-operation concern; see the open question in DECISIONS.md.',
  },
  'playroom.DeleteInput': {
    ForceInstall: 'Session refresh is not a per-operation concern; see DECISIONS.md.',
  },
  'playroom.StartInput': {
    Force: 'Starting a room you do not own is not a flow the GUI offers.',
    ForceInstall: 'Session refresh is not a per-operation concern; see DECISIONS.md.',
    WaitTimeout: 'Start is always --no-wait from the GUI; the list polls until the room is ready.',
  },
  'playroom.StopInput': {
    Force: 'Stopping a room you do not own is not a flow the GUI offers.',
    ForceInstall: 'Session refresh is not a per-operation concern; see DECISIONS.md.',
  },
  'playroom.OpenInput': {},
  'playroom.ConnectInput': {
    ForceInstall: 'Session refresh is not a per-operation concern; see DECISIONS.md.',
  },
  'playroom.ListInput': {
    Mine: 'Filtered client-side for an instant toggle; re-listing per keystroke would be worse.',
    ForceInstall: 'Session refresh is not a per-operation concern; see DECISIONS.md.',
  },
  'playhouse.CreateInput': {},
  'playhouse.DeleteInput': {},
};

/** A zero-valued instance of each model, which is where the field names live. */
const MODELS: Record<string, object> = {
  'playroom.CreateInput': new playroomModels.CreateInput({}),
  'playroom.UpdateInput': new playroomModels.UpdateInput({}),
  'playroom.DeleteInput': new playroomModels.DeleteInput({}),
  'playroom.StartInput': new playroomModels.StartInput({}),
  'playroom.StopInput': new playroomModels.StopInput({}),
  'playroom.OpenInput': new playroomModels.OpenInput({}),
  'playroom.ConnectInput': new playroomModels.ConnectInput({}),
  'playroom.ListInput': new playroomModels.ListInput({}),
  'playhouse.CreateInput': new playhouseModels.CreateInput({}),
  'playhouse.DeleteInput': new playhouseModels.DeleteInput({}),
};

describe('every backend input field is either wired to the UI or explained', () => {
  for (const [name, model] of Object.entries(MODELS)) {
    describe(name, () => {
      const fields = Object.keys(model);
      const wired = WIRED[name] ?? [];
      const unwired = UNWIRED[name] ?? {};

      it('has no field that is neither wired nor explained', () => {
        const unaccounted = fields.filter((f) => !wired.includes(f) && !(f in unwired));
        expect(
          unaccounted,
          `${name} gained ${unaccounted.join(', ')}. Add a control for it, or list it in ` +
            `UNWIRED with the reason it is not exposed.`,
        ).toEqual([]);
      });

      it('does not claim to wire a field that no longer exists', () => {
        const stale = wired.filter((f) => !fields.includes(f));
        expect(
          stale,
          `${name} lists ${stale.join(', ')} as wired, but the Go struct has no such field.`,
        ).toEqual([]);
      });

      it('does not carry a reason for a field that no longer exists', () => {
        const stale = Object.keys(unwired).filter((f) => !fields.includes(f));
        expect(
          stale,
          `${name} explains ${stale.join(', ')}, which the Go struct no longer has.`,
        ).toEqual([]);
      });

      it('does not both wire and excuse the same field', () => {
        const both = wired.filter((f) => f in unwired);
        expect(both, `${name} lists ${both.join(', ')} as both wired and unwired.`).toEqual([]);
      });
    });
  }
});
