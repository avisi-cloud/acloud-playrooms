import type { PlayroomResources, PlayroomSize, PlayroomSizePreset } from '../models/playroom';

/** The sizes Easy mode offers. Storage is not part of a size. */
export const PLAYROOM_SIZE_PRESETS: Record<PlayroomSizePreset, PlayroomResources> = {
  small: { cpuReq: '250m', cpuLim: '2', memReq: '2Gi', memLim: '2Gi' },
  medium: { cpuReq: '500m', cpuLim: '4', memReq: '4Gi', memLim: '4Gi' },
  large: { cpuReq: '1', cpuLim: '8', memReq: '8Gi', memLim: '8Gi' },
};

export const PLAYROOM_SIZE_LABELS: Record<PlayroomSize, string> = {
  defaults: 'Your defaults',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  custom: 'Custom',
};
