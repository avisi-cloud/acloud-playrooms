import type { HealthCheck } from '../../../../core/services/wails-api';
import { Playroom, TailscaleUse } from '../../../../shared/models';
import { hasTailnetHost } from '../../../../shared/utils';

/**
 * The listing does not report exposure, so a reported `.ts.net` host is the
 * only proof; rooms without any host leave it not reported.
 */
export function tailscaleUseInPlayhouse(
  playhouse: string,
  roomsLoadedFor: string | null,
  rooms: Playroom[],
): TailscaleUse {
  if (!playhouse || roomsLoadedFor !== playhouse) return 'not-reported';
  if (rooms.some(hasTailnetHost)) return 'used';
  return rooms.some((room) => room.host) ? 'not-used' : 'not-reported';
}

/** Plain text for a support question: one line per check, with its fix and command. */
export function describeHealthChecks(checks: HealthCheck[], appVersion: string): string {
  const lines = [`Acloud Playrooms health check (app ${appVersion || 'Not reported'})`];
  for (const check of checks) {
    lines.push(`[${check.Status}] ${check.Name}: ${check.Explanation}`);
    if (check.Fix) lines.push(`  Fix: ${check.Fix}`);
    if (check.Command) lines.push(`  Command: ${check.Command}`);
  }
  return lines.join('\n');
}
