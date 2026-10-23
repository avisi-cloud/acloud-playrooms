/**
 * The plain-language name of every playroom option, and what it does for you,
 * keyed by its CLI flag (which is also its `playroom config` key). Every screen
 * that shows one of these options reads it here, so one option has one name.
 */
export const PLAYROOM_OPTION_TEXTS = {
  image: { label: 'Image', hint: 'Pick a published image, or type a full registry path.' },
  storage: { label: 'Storage', hint: 'Disk space for your home folder.' },
  'cpu-request': { label: 'Guaranteed CPU' },
  'cpu-limit': { label: 'Maximum CPU' },
  'memory-request': { label: 'Guaranteed memory' },
  'memory-limit': { label: 'Maximum memory' },
  user: { label: 'User' },
  'ssh-key': {
    label: 'SSH public key',
    hint: 'The key you connect with. Empty uses your first ~/.ssh/id_*.pub.',
  },
  'forward-agent': { label: 'Forward SSH agent' },
  env: {
    label: 'Environment variables',
    hint: 'Passed in from your Mac, such as an API key. KEY uses your value; KEY=VALUE sets one.',
  },
  git: {
    label: 'Git repositories',
    hint: 'Cloned when the playroom starts. HTTPS only; a private repo needs a token under Environment variables.',
  },
  copy: {
    label: 'Copy paths',
    hint: 'Files or folders copied from your Mac after the playroom starts. SRC or SRC:DEST.',
  },
  port: {
    label: 'Forwarded ports',
    hint: 'Open an app in the playroom, such as a web server, from your Mac. Needs Tailscale.',
  },
  exposure: {
    label: 'Exposure',
    hint: 'How your Mac reaches the playroom. Forwarded ports need Tailscale.',
  },
  'nodeport-ssh': {
    label: 'Also allow SSH over a NodePort',
    hint: 'Reachable from the IP allowlist of the playhouse. Connect with Connect via NodePort.',
  },
  via: {
    label: 'Connect via',
    hint: 'Which way to reach the playroom. Default uses how it is exposed.',
  },
  'proxy-group': {
    label: 'Proxy group',
    hint: 'Only needed when the playhouse runs Tailscale in high-availability mode.',
  },
  editor: { label: 'Editor' },
  'wait-timeout': { label: 'Wait timeout', hint: 'How long to wait for the playroom to be ready.' },
  'no-wait': { label: "Don't wait" },
  'force-install': { label: 'Sign in to the playhouse again' },
  ephemeral: {
    label: 'Disposable home folder',
    hint: 'Your files are wiped whenever the playroom restarts. Good for quick experiments.',
  },
  'read-only': {
    label: 'Read-only system files',
    hint: 'Only your home folder and /tmp can change. Turn off to install packages with apt; they reset on restart.',
  },
  capabilities: {
    label: 'Capabilities',
    hint: 'What sudo and other root tools may do inside the playroom. The agent runs without root either way.',
  },
  'cap-add': {
    label: 'Added capabilities',
    hint: 'Extra Linux capabilities on top of the profile, such as NET_ADMIN.',
  },
  'workspace-namespace': { label: 'Give the agent its own Kubernetes namespace' },
  privileged: {
    label: 'Privileged mode',
    hint: 'Full access to the node it runs on. Needed for Docker inside the playroom.',
  },
} as const;

export type PlayroomOptionKey = keyof typeof PLAYROOM_OPTION_TEXTS;
