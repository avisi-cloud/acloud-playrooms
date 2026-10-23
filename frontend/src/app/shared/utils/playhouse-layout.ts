export interface LayoutBadge {
  label: string;
  severity: 'success' | 'info' | 'warn' | 'secondary';
  hint: string;
  /** Whether `playhouse update` is the way out, so the badge can open the drawer. */
  opensUpdate: boolean;
}

export function describeLayout(status: string | undefined): LayoutBadge {
  switch (status) {
    case 'current':
      return {
        label: 'Up to date',
        severity: 'success',
        hint: 'The playhouse layout matches this acloud.',
        opensUpdate: false,
      };
    case 'outdated':
      return {
        label: 'Update available',
        severity: 'info',
        hint: 'This acloud ships a newer playhouse layout. Edit the playhouse and choose Bring up to date.',
        opensUpdate: true,
      };
    case 'newer':
      return {
        label: 'Needs newer acloud',
        severity: 'warn',
        hint: 'A newer acloud last updated this playhouse. Upgrade acloud before you edit it.',
        opensUpdate: false,
      };
    default:
      return {
        label: 'Unknown',
        severity: 'secondary',
        hint: 'acloud could not read which layout this playhouse is on.',
        opensUpdate: false,
      };
  }
}
