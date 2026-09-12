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
 * `--exposure` values, mirroring pkg/playroom's Exposure* constants. The blank
 * option leaves the flag off, so the playhouse's declared default applies.
 */
export const EXPOSURES = [
  { id: '', label: 'Playhouse default', hint: 'Use whatever the playhouse declares' },
  {
    id: 'tailscale',
    label: 'Tailscale',
    hint: 'Reachable on the tailnet; required for port forwards',
  },
  { id: 'nodeport', label: 'NodePort', hint: 'Direct SSH where nodes have public IPs' },
  {
    id: 'portforward',
    label: 'Port-forward',
    hint: 'No public exposure; reached via the API server',
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
    hint: 'Needs a Tailscale organisation and OAuth credentials',
  },
  { id: 'nodeport', label: 'NodePort', hint: 'Free direct SSH where nodes have public IPs' },
  {
    id: 'portforward',
    label: 'Port-forward',
    hint: 'No public exposure; reached via the API server',
  },
] as const;
