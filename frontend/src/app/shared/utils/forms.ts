import { DEFAULTS } from '../data/defaults';
import { CreateForm, Playroom, UpdateForm } from '../models/playroom';

export const NAME_RE = /^(?=.{1,50}$)[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

/**
 * The subset of `playroom config` this form reads. An interface rather than the
 * service, so this module stays free of Angular.
 */
export interface DefaultsLookup {
  configuredText(key: string, fallback?: string): string;
  configuredToggle(key: string, fallback: boolean): boolean;
}

/**
 * A blank create form, seeded from the user's configured defaults. The DEFAULTS
 * constants are the fallback for a key the CLI does not know, not the source.
 */
export function blankCreateForm(playhouse: string, defaults?: DefaultsLookup): CreateForm {
  const value = (key: string, fallback: string) =>
    defaults?.configuredText(key, fallback) || fallback;
  const bool = (key: string, fallback: boolean) =>
    defaults?.configuredToggle(key, fallback) ?? fallback;
  return {
    name: '',
    playhouse,
    image: value('image', DEFAULTS.image),
    storage: value('storage', DEFAULTS.storage),
    cpuReq: value('cpu-request', DEFAULTS.cpuReq),
    cpuLim: value('cpu-limit', DEFAULTS.cpuLim),
    memReq: value('memory-request', DEFAULTS.memReq),
    memLim: value('memory-limit', DEFAULTS.memLim),
    sshKey: value('ssh-key', ''),
    env: [''],
    git: [''],
    copy: [''],
    ports: [''],
    proxyGroup: value('proxy-group', ''),
    exposure: '',
    ephemeral: false,
    readOnly: bool('read-only', true),
    privileged: false,
    acknowledgePrivileged: false,
    noWait: false,
    waitTimeout: value('wait-timeout', DEFAULTS.waitTimeout),
    forceInstall: false,
  };
}

export function blankUpdateForm(room: Playroom): UpdateForm {
  return {
    name: room.name,
    playhouse: room.playhouse,
    image: room.image,
    cpuReq: room.cpuReq,
    cpuLim: room.cpuLim,
    memReq: room.memReq,
    memLim: room.memLim,
    changeReadOnly: false,
    readOnly: room.system !== 'writable',
    changePorts: false,
    clearPorts: false,
    ports: parseRenderedPorts(room.ports),
    noWait: false,
    waitTimeout: DEFAULTS.waitTimeout,
  };
}

export function parseRenderedPorts(raw: string): string[] {
  const ports = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.replace(/\s*→\s*/g, ':'));
  return ports.length ? ports : [''];
}
