import { PLAYROOM_SIZE_PRESETS } from '../data/playroom-sizes';
import { PlayroomResources, PlayroomSize, PlayroomSizePreset } from '../models/playroom';

const PRESETS_SMALLEST_FIRST = Object.keys(PLAYROOM_SIZE_PRESETS) as PlayroomSizePreset[];

function sameResources(left: PlayroomResources, right: PlayroomResources): boolean {
  return (
    left.cpuReq === right.cpuReq &&
    left.cpuLim === right.cpuLim &&
    left.memReq === right.memReq &&
    left.memLim === right.memLim
  );
}

/** Read from the four values, so the size shown cannot disagree with what is sent; Your defaults wins a tie. */
export function sizeMatchingResources(
  resources: PlayroomResources,
  yourDefaults: PlayroomResources,
): PlayroomSize {
  if (sameResources(resources, yourDefaults)) return 'defaults';
  return (
    PRESETS_SMALLEST_FIRST.find((preset) =>
      sameResources(resources, PLAYROOM_SIZE_PRESETS[preset]),
    ) ?? 'custom'
  );
}

/** Custom is not offered here: it is whatever was typed, not something to pick. */
export function resourcesOfSize(
  size: Exclude<PlayroomSize, 'custom'>,
  yourDefaults: PlayroomResources,
): PlayroomResources {
  const source = size === 'defaults' ? yourDefaults : PLAYROOM_SIZE_PRESETS[size];
  return {
    cpuReq: source.cpuReq,
    cpuLim: source.cpuLim,
    memReq: source.memReq,
    memLim: source.memLim,
  };
}

const CPU_QUANTITY_RE = /^(\d+(?:\.\d+)?)(m)?$/;
const MEMORY_QUANTITY_RE = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|Pi|k|M|G|T|P)?$/;

/** `250m` as `0.25`; anything unreadable is shown as typed rather than guessed. */
function cpuInPlainWords(quantity: string): string {
  const match = CPU_QUANTITY_RE.exec(quantity.trim());
  if (!match) return quantity.trim();
  const cores = match[2] ? Number(match[1]) / 1000 : Number(match[1]);
  return String(Number(cores.toFixed(3)));
}

/** `2Gi` as `2 GiB`; anything unreadable is shown as typed rather than guessed. */
function memoryInPlainWords(quantity: string): string {
  const match = MEMORY_QUANTITY_RE.exec(quantity.trim());
  if (!match) return quantity.trim();
  return match[2] ? `${match[1]} ${match[2]}B` : `${match[1]} bytes`;
}

function isNone(quantity: string): boolean {
  return quantity.trim().toLowerCase() === 'none';
}

/** A request and limit as one range; `none` means nothing reserved, or no maximum. */
function rangeInPlainWords(
  request: string,
  limit: string,
  quantityInPlainWords: (quantity: string) => string,
  unit: string,
): string {
  if (isNone(request) && isNone(limit)) return `${unit} not set`;
  if (isNone(request)) return `up to ${quantityInPlainWords(limit)} ${unit}`;
  if (isNone(limit)) return `at least ${quantityInPlainWords(request)} ${unit}`;
  const requestWords = quantityInPlainWords(request);
  const limitWords = quantityInPlainWords(limit);
  if (requestWords === limitWords) return `${requestWords} ${unit}`;
  return `${requestWords}–${limitWords} ${unit}`;
}

/** The four values as a person would say them, e.g. "0.25–2 CPU · 2 GiB memory". */
export function describeResourcesInPlainWords(resources: PlayroomResources): string {
  return [
    rangeInPlainWords(resources.cpuReq, resources.cpuLim, cpuInPlainWords, 'CPU'),
    rangeInPlainWords(resources.memReq, resources.memLim, memoryInPlainWords, 'memory'),
  ].join(' · ');
}
