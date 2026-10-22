// The picker loads the image flavors from the backend at runtime. Only the
// built-in default alias stays here, mirroring pkg/playroom.DefaultImage.
export const DEFAULT_IMAGE = 'opencode';

export const EDITORS = [
  { id: 'vscode', label: 'VS Code' },
  { id: 'intellij', label: 'IntelliJ' },
  { id: 'webstorm', label: 'WebStorm' },
] as const;

export const TERMINALS = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'iterm', label: 'iTerm2' },
  { id: 'ghostty', label: 'Ghostty' },
] as const;

/**
 * `--exposure` values, mirroring backend/playroom's Exposure constants. The blank
 * option leaves the flag off, so the playhouse's declared default applies.
 */
export const EXPOSURES = [
  { id: '', label: 'Playhouse default', hint: 'Whatever this playhouse is set up with' },
  {
    id: 'tailscale',
    label: 'Tailscale',
    hint: 'Connect privately from your Mac; needed for forwarded ports',
  },
  {
    id: 'nodeport',
    label: 'NodePort',
    hint: 'SSH over the internet; only where nodes have public IPs',
  },
  {
    id: 'portforward',
    label: 'Port-forward',
    hint: 'Nothing exposed; acloud connects through the cluster API',
  },
] as const;

/** `--capabilities` profiles, mirroring backend/playroom's Capabilities constants. */
export const CAPABILITIES = [
  { id: 'minimal', label: 'Minimal', hint: 'Only what login and sudo need' },
  {
    id: 'standard',
    label: 'Standard',
    hint: 'Also lets tools like tcpdump, nmap and some apt packages work',
  },
] as const;

/**
 * `--exposure` for `playhouse create`, which sets the default playrooms inherit.
 * No blank entry, so the form starts on the CLI's own default.
 */
export const PLAYHOUSE_EXPOSURES = [
  {
    id: 'tailscale',
    label: 'Tailscale',
    hint: 'Connect privately from your Mac. Needs a Tailscale organisation and OAuth credentials',
  },
  {
    id: 'nodeport',
    label: 'NodePort',
    hint: 'Free SSH over the internet; only where nodes have public IPs',
  },
  {
    id: 'portforward',
    label: 'Port-forward',
    hint: 'Nothing exposed; acloud connects through the cluster API',
  },
] as const;
