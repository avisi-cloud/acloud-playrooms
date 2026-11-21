import { Playroom } from '../models/playroom';

const QUANTITY = /^\+?(\d+(?:\.\d*)?|\.\d+)([eE][+-]?\d+|[numkMGTPE]|[KMGTPE]i)?$/;
const DECIMAL_MULTIPLIERS = {
  n: 1e-9,
  u: 1e-6,
  m: 1e-3,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
};
const BINARY_SUFFIXES = ['Ki', 'Mi', 'Gi', 'Ti', 'Pi', 'Ei'];

/** Convert reported Kubernetes quantities to cores or bytes; missing or invalid stays unknown. */
export function parseResourceQuantity(quantity: string): number | null {
  const match = QUANTITY.exec(quantity.trim());
  if (!match) return null;
  const suffix = match[2] ?? '';
  const binaryPower = BINARY_SUFFIXES.indexOf(suffix);
  const multiplier = !suffix
    ? 1
    : binaryPower >= 0
      ? 1024 ** (binaryPower + 1)
      : /^[eE]/.test(suffix) && suffix.length > 1
        ? 10 ** Number(suffix.slice(1))
        : DECIMAL_MULTIPLIERS[suffix as keyof typeof DECIMAL_MULTIPLIERS];
  const value = Number(match[1]) * multiplier;
  return Number.isFinite(value) && (value !== 0 || Number(match[1]) === 0) ? value : null;
}

export interface RequestedResource {
  total: number;
  reported: number;
  unknown: number;
}

export interface RequestedResources {
  cpu: RequestedResource;
  memory: RequestedResource;
  storage: RequestedResource;
}

export function totalRequestedResources(rooms: readonly Playroom[]): RequestedResources {
  const totals: RequestedResources = {
    cpu: { total: 0, reported: 0, unknown: 0 },
    memory: { total: 0, reported: 0, unknown: 0 },
    storage: { total: 0, reported: 0, unknown: 0 },
  };
  for (const room of rooms) {
    for (const [resource, quantity] of [
      [totals.cpu, room.cpuReq],
      [totals.memory, room.memReq],
      [totals.storage, room.disk],
    ] as const) {
      const value = parseResourceQuantity(quantity);
      if (value === null) resource.unknown++;
      else {
        resource.total += value;
        resource.reported++;
      }
    }
  }
  return totals;
}

/** `full` names every unit; `compact` fits the title row, rounding to 2 decimals unless that hides a request. */
export type RequestedResourcesFormat = 'full' | 'compact';

const GIB = 1024 ** 3;
const RESOURCE_LABELS = {
  cpu: { divisor: 1, name: 'CPU', full: 'CPU', compact: 'CPU' },
  memory: { divisor: GIB, name: 'Memory', full: 'GiB memory', compact: 'GiB' },
  storage: { divisor: GIB, name: 'Storage', full: 'GiB storage', compact: 'GiB' },
} as const;

/** One text per resource, in CPU, memory, storage order. */
export function describeRequestedResourceParts(
  resources: RequestedResources,
  format: RequestedResourcesFormat,
): string[] {
  return (['cpu', 'memory', 'storage'] as const).map((key) => {
    const resource = resources[key];
    const label = RESOURCE_LABELS[key];
    if (!resource.reported && resource.unknown) return `${label.name}: Not reported`;
    const value = Number((resource.total / label.divisor).toPrecision(9));
    const shown = format === 'compact' ? Number(value.toFixed(2)) || value : value;
    return `${shown} ${label[format]}`;
  });
}

export function describeRequestedResources(
  resources: RequestedResources,
  format: RequestedResourcesFormat = 'full',
): string {
  return describeRequestedResourceParts(resources, format).join(' · ');
}

export function describeUnknownRequests(resources: RequestedResources): string[] {
  return (['cpu', 'memory', 'storage'] as const).flatMap((key) => {
    const count = resources[key].unknown;
    const name = key === 'cpu' ? 'CPU' : key;
    return count ? [`${count} ${count === 1 ? 'room' : 'rooms'} without a ${name} request`] : [];
  });
}
