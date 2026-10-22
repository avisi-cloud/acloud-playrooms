import { describe, expect, it } from 'vitest';
import { PLAYROOM_SIZE_PRESETS } from '../data/playroom-sizes';
import {
  describeResourcesInPlainWords,
  resourcesOfSize,
  sizeMatchingResources,
} from './playroom-size';

const yourDefaults = { cpuReq: '250m', cpuLim: '4', memReq: '2Gi', memLim: '2Gi' };

describe('sizeMatchingResources', () => {
  it('reads the seeded values as your defaults', () => {
    expect(sizeMatchingResources({ ...yourDefaults }, yourDefaults)).toBe('defaults');
  });

  it('reads each preset by its four values', () => {
    for (const size of ['small', 'medium', 'large'] as const) {
      expect(sizeMatchingResources(PLAYROOM_SIZE_PRESETS[size], yourDefaults), size).toBe(size);
    }
  });

  it('reads a hand-edited value as custom', () => {
    const resources = { ...PLAYROOM_SIZE_PRESETS.medium, cpuLim: '6' };
    expect(sizeMatchingResources(resources, yourDefaults)).toBe('custom');
  });

  // Your defaults is what the form starts on, so a tie must not relabel it.
  it('prefers your defaults when they equal a preset', () => {
    expect(sizeMatchingResources(PLAYROOM_SIZE_PRESETS.small, PLAYROOM_SIZE_PRESETS.small)).toBe(
      'defaults',
    );
  });
});

describe('resourcesOfSize', () => {
  it('gives the preset values for a preset', () => {
    expect(resourcesOfSize('large', yourDefaults)).toEqual({
      cpuReq: '1',
      cpuLim: '8',
      memReq: '8Gi',
      memLim: '8Gi',
    });
  });

  it('gives only the four resource values of your defaults', () => {
    const seededForm = { ...yourDefaults, storage: '50Gi', name: 'demo' };
    expect(resourcesOfSize('defaults', seededForm)).toEqual(yourDefaults);
  });
});

describe('describeResourcesInPlainWords', () => {
  it('says each preset in plain words', () => {
    expect(describeResourcesInPlainWords(PLAYROOM_SIZE_PRESETS.small)).toBe(
      '0.25–2 CPU · 2 GiB memory',
    );
    expect(describeResourcesInPlainWords(PLAYROOM_SIZE_PRESETS.medium)).toBe(
      '0.5–4 CPU · 4 GiB memory',
    );
    expect(describeResourcesInPlainWords(PLAYROOM_SIZE_PRESETS.large)).toBe(
      '1–8 CPU · 8 GiB memory',
    );
  });

  it('shows a memory range when guaranteed and maximum differ', () => {
    expect(
      describeResourcesInPlainWords({ cpuReq: '1', cpuLim: '1', memReq: '512Mi', memLim: '1Gi' }),
    ).toBe('1 CPU · 512 MiB–1 GiB memory');
  });

  it('says what none means instead of printing it as a number', () => {
    expect(
      describeResourcesInPlainWords({ cpuReq: 'none', cpuLim: '4', memReq: '2Gi', memLim: 'none' }),
    ).toBe('up to 4 CPU · at least 2 GiB memory');
    expect(
      describeResourcesInPlainWords({
        cpuReq: 'none',
        cpuLim: 'none',
        memReq: 'None',
        memLim: 'none',
      }),
    ).toBe('CPU not set · memory not set');
  });

  it('shows a value it cannot read as typed, instead of guessing', () => {
    expect(
      describeResourcesInPlainWords({ cpuReq: 'lots', cpuLim: '2', memReq: '2GB', memLim: '2GB' }),
    ).toBe('lots–2 CPU · 2GB memory');
  });
});
