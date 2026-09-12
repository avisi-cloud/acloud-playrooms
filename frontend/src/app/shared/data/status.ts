export const STATUS = {
  ready: { label: 'Ready', tone: 'ok', desc: 'Running · host assigned' },
  creating: { label: 'Creating', tone: 'busy', desc: 'Provisioning · waiting for readiness' },
  starting: { label: 'Starting', tone: 'busy', desc: 'Scaled to 1 · waiting for readiness' },
  'no-host': { label: 'No host', tone: 'warn', desc: 'Running · SSH address not yet assigned' },
  stopped: { label: 'Stopped', tone: 'idle', desc: 'Scaled to 0 · storage retained' },
  deleting: { label: 'Deleting', tone: 'busy', desc: 'Teardown in progress' },
  failed: { label: 'Failed', tone: 'bad', desc: 'Provisioning failed' },
  // A status this build has not seen. It still polls, but claims nothing about
  // itself — the raw backend string travels with it.
  unknown: { label: 'Unknown', tone: 'busy', desc: 'Status not recognised — still watching' },
} as const;
