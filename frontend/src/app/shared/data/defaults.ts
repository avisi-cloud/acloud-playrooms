import { DEFAULT_IMAGE } from './images';

export const DEFAULTS = {
  image: DEFAULT_IMAGE,
  storage: '10Gi',
  cpuReq: '250m',
  cpuLim: '4',
  memReq: '2Gi',
  memLim: '2Gi',
  waitTimeout: '5m',
} as const;
