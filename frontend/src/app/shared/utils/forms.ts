import { DEFAULTS } from '../data/defaults';
import { CAPABILITIES } from '../data/images';
import { Capabilities, CreateForm, ImageEntry, Playroom, UpdateForm } from '../models/playroom';

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
    capabilities: capabilitiesOrBlank(value('capabilities', '')),
    capAdd: [''],
    ephemeral: false,
    readOnly: bool('read-only', true),
    privileged: false,
    workspaceNamespace: bool('workspace-namespace', false),
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
    storage: '',
    capabilities: '',
    changeReadOnly: false,
    readOnly: room.system !== 'writable',
    changePorts: false,
    clearPorts: false,
    ports: parseRenderedPorts(room.ports),
    changeCapAdd: false,
    clearCapAdd: false,
    capAdd: [''],
    changeWorkspaceNamespace: false,
    workspaceNamespace: true,
    acknowledgeWorkspaceNamespaceRemoval: false,
    // Off by default: an update with no exposure flag keeps the current one.
    moveToTailscale: false,
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

/** A configured `capabilities` default this GUI knows, or blank so acloud decides. */
export function capabilitiesOrBlank(raw: string): Capabilities {
  return CAPABILITIES.find((profile) => profile.id === raw)?.id ?? '';
}

/** The catalog entry for an image alias; undefined for a typed registry path. */
export function findImageEntry(
  images: ImageEntry[],
  name: string | null | undefined,
): ImageEntry | undefined {
  const normalizedName = name?.trim();
  return normalizedName ? images.find((image) => image.Name === normalizedName) : undefined;
}

type StorageUnit = '' | 'k' | 'M' | 'G' | 'T' | 'P' | 'Ki' | 'Mi' | 'Gi' | 'Ti' | 'Pi';

const BYTES_PER_STORAGE_UNIT: Record<StorageUnit, number> = {
  '': 1,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  Ki: 2 ** 10,
  Mi: 2 ** 20,
  Gi: 2 ** 30,
  Ti: 2 ** 40,
  Pi: 2 ** 50,
};

const STORAGE_QUANTITY_RE = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|Pi|k|M|G|T|P)?$/;

/** A Kubernetes storage quantity such as `20Gi` in bytes; undefined when it cannot be read. */
export function storageSizeInBytes(quantity: string): number | undefined {
  const match = STORAGE_QUANTITY_RE.exec(quantity.trim());
  if (!match) return undefined;
  const unit = (match[2] ?? '') as StorageUnit;
  return Number(match[1]) * BYTES_PER_STORAGE_UNIT[unit];
}

/** acloud only grows storage; a size it cannot read is left for acloud to judge. */
export function storageDoesNotGrow(currentSize: string, requestedSize: string): boolean {
  const currentBytes = storageSizeInBytes(currentSize);
  const requestedBytes = storageSizeInBytes(requestedSize);
  if (currentBytes === undefined || requestedBytes === undefined) return false;
  return requestedBytes <= currentBytes;
}
