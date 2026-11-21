import { PlayhouseEntry } from '../../../../core/services/wails-api';
import {
  describeSetting,
  SettingChange,
} from '../../../../shared/components/setting-changes/setting-changes';
import type { UpdatePlayhouseForm } from './update-playhouse-drawer';

export type PlayhouseUpdateField = keyof UpdatePlayhouseForm | 'layout';

export function describeChanges(
  current: PlayhouseEntry | null,
  form: UpdatePlayhouseForm,
): SettingChange<PlayhouseUpdateField>[] {
  const setting = (field: PlayhouseUpdateField, label: string, proposed: string | null) =>
    describeSetting(field, label, null, proposed);
  const action = (field: PlayhouseUpdateField, label: string, proposed: string | null) => ({
    ...setting(field, label, proposed),
    comparison: false,
  });
  const text = (value: string) => value.trim() || null;
  const list = (values: string[]) =>
    text(
      values
        .map((value) => value.trim())
        .filter(Boolean)
        .join(', '),
    );
  return [
    setting('exposure', 'Exposure', text(form.exposure)),
    setting('defaultVia', 'Default connection path', text(form.defaultVia)),
    setting(
      'tailscaleOAuthClientID',
      'Tailscale OAuth client id',
      form.exposure === 'tailscale' && text(form.tailscaleOAuthClientID)
        ? 'Replacement supplied'
        : null,
    ),
    setting(
      'tailscaleOAuthClientSecret',
      'Tailscale OAuth client secret',
      form.exposure === 'tailscale' && text(form.tailscaleOAuthClientSecret)
        ? 'Replacement supplied'
        : null,
    ),
    action(
      'allowCurrentIP',
      'Add my current public IP',
      form.allowCurrentIP ? 'Add current IP' : null,
    ),
    action('allowIPs', 'Add IP addresses or ranges', list(form.allowIPs)),
    action('removeIPs', 'Remove IP addresses or ranges', list(form.removeIPs)),
    action('resetAllowlist', 'Clear the allowlist first', form.resetAllowlist ? 'Clear' : null),
    setting('updateChannel', 'Update channel', text(form.updateChannel)),
    setting(
      'maxPlayroomNodes',
      'Max playroom nodes',
      form.maxPlayroomNodes > 0 ? String(form.maxPlayroomNodes) : null,
    ),
    setting(
      'maxPrivilegedNodes',
      'Max privileged nodes',
      form.maxPrivilegedNodes > 0 ? String(form.maxPrivilegedNodes) : null,
    ),
    {
      ...describeSetting('waitTimeout', 'Wait timeout', '20m', form.waitTimeout),
      comparison: false,
    },
    describeSetting(
      'layout',
      'Layout version',
      current?.LayoutVersion == null ? null : String(current?.LayoutVersion),
      null,
    ),
  ];
}
