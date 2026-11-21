export interface SettingChange<Field extends string = string> {
  field: Field;
  label: string;
  current: string | null;
  proposed: string | null;
  changed: boolean;
  needsNewSpec: boolean;
  comparison: boolean;
}

export function describeSetting<Field extends string>(
  field: Field,
  label: string,
  current: string | null,
  proposed: string | null,
  needsNewSpec = false,
): SettingChange<Field> {
  const changed = proposed !== null && proposed !== current;
  return {
    field,
    label,
    current,
    proposed,
    changed,
    needsNewSpec: changed && needsNewSpec,
    comparison: true,
  };
}

export function describeComparison(change: SettingChange | undefined): string {
  if (!change?.comparison) return '';
  if (change.changed) return `${change.current ?? 'Not reported'} → ${change.proposed}`;
  return change.current === null ? '' : 'Unchanged';
}
