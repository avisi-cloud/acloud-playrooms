import { LayoutStatus } from '../models';

export interface LayoutBadge {
  label: string;
  severity: 'info' | 'warn' | 'secondary';
  hint: string;
  /** Whether `playhouse update` is the way out, so the badge can open the drawer. */
  opensUpdate: boolean;
}

/** What a playhouse's layout status tells the user; null when there is nothing to say. */
export function describeLayout(status: string | undefined): LayoutBadge | null {
  switch (status as LayoutStatus | undefined) {
    case 'outdated':
      return {
        label: 'update available',
        severity: 'info',
        hint: 'This acloud ships a newer playhouse layout. Edit the playhouse and choose Bring up to date.',
        opensUpdate: true,
      };
    case 'newer':
      return {
        label: 'needs a newer acloud',
        severity: 'warn',
        hint: 'A newer acloud last updated this playhouse. Upgrade acloud before you edit it.',
        opensUpdate: false,
      };
    case 'unknown':
      return {
        label: 'layout unknown',
        severity: 'secondary',
        hint: 'acloud could not read which layout this playhouse is on.',
        opensUpdate: false,
      };
    default:
      return null;
  }
}
