import { DEFAULTS } from '../../data/defaults';
import { Playroom, UpdateForm } from '../../models';
import { parseRenderedPorts, storageSizeInBytes } from '../../utils/forms';
import { describeSetting, SettingChange } from '../setting-changes/setting-changes';

export type PlayroomUpdateField = keyof UpdateForm | 'ephemeral';

function describeList(values: string[]): string {
  return (
    values
      .map((value) => value.trim())
      .filter(Boolean)
      .sort()
      .join(', ') || 'None'
  );
}

export function describeChanges(
  current: Playroom,
  form: UpdateForm,
): SettingChange<PlayroomUpdateField>[] {
  const setting = (
    field: PlayroomUpdateField,
    label: string,
    value: string | null,
    proposed: string | null,
    spec = false,
  ) => {
    const change = describeSetting(field, label, value, proposed, spec);
    const quantity = (quantity: string) =>
      field === 'cpuReq' || field === 'cpuLim'
        ? /^\d+(?:\.\d+)?m?$/.test(quantity)
          ? Number(quantity.replace(/m$/, '')) / (quantity.endsWith('m') ? 1000 : 1)
          : undefined
        : storageSizeInBytes(quantity);
    if (value && proposed && ['cpuReq', 'cpuLim', 'memReq', 'memLim', 'storage'].includes(field)) {
      const currentQuantity = quantity(value);
      if (currentQuantity !== undefined && currentQuantity === quantity(proposed))
        return { ...change, changed: false, needsNewSpec: false };
    }
    return change;
  };
  const text = (value: string) => value.trim() || null;
  const enabled = (value: boolean) => (value ? 'On' : 'Off');
  return [
    setting('image', 'Image', text(current.image), text(form.image), true),
    setting('storage', 'Storage', text(current.disk), text(form.storage)),
    setting('cpuReq', 'Guaranteed CPU', text(current.cpuReq), text(form.cpuReq), true),
    setting('cpuLim', 'Maximum CPU', text(current.cpuLim), text(form.cpuLim), true),
    setting('memReq', 'Guaranteed memory', text(current.memReq), text(form.memReq), true),
    setting('memLim', 'Maximum memory', text(current.memLim), text(form.memLim), true),
    setting('ephemeral', 'Ephemeral storage', enabled(current.ephemeral), null),
    setting(
      'readOnly',
      'Read-only system',
      current.system === 'read-only' ? 'On' : current.system === 'writable' ? 'Off' : null,
      form.changeReadOnly ? enabled(form.readOnly) : null,
      true,
    ),
    {
      ...setting('noWait', 'Return immediately', 'Off', form.noWait ? 'On' : null),
      comparison: false,
    },
    {
      ...setting(
        'waitTimeout',
        'Wait timeout',
        DEFAULTS.waitTimeout,
        form.waitTimeout.trim() !== DEFAULTS.waitTimeout ? text(form.waitTimeout) : null,
      ),
      comparison: false,
    },
    setting(
      'ports',
      'Forwarded ports',
      current.portForwards === undefined && !current.ports
        ? null
        : describeList(parseRenderedPorts(current.ports)),
      form.changePorts ? describeList(form.clearPorts ? [] : form.ports) : null,
    ),
    setting(
      'capabilities',
      'Capability profile',
      text(current.capabilityProfile),
      text(form.capabilities),
      true,
    ),
    setting(
      'capAdd',
      'Added capabilities',
      describeList(current.capabilityAdditions),
      form.changeCapAdd ? describeList(form.clearCapAdd ? [] : form.capAdd) : null,
      true,
    ),
    setting(
      'workspaceNamespace',
      'Kubernetes namespace',
      null,
      form.changeWorkspaceNamespace ? enabled(form.workspaceNamespace) : null,
      true,
    ),
    setting('moveToTailscale', 'Exposure', null, form.moveToTailscale ? 'Tailscale' : null),
    setting(
      'nodePortSSH',
      'NodePort SSH',
      null,
      form.changeNodePortSSH ? enabled(form.nodePortSSH) : null,
    ),
  ];
}
