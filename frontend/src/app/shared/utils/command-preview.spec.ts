import { describe, expect, it, vi } from 'vitest';
import { CommandPreview, splitCommandPreview } from './command-preview';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('CommandPreview', () => {
  it('asks the backend once and exposes the joined arguments', async () => {
    const fetch = vi.fn().mockResolvedValue(['acloud', 'playroom', 'create', 'demo']);
    const preview = new CommandPreview<{ name: string }>(fetch);

    preview.refreshIfInputChanged({ name: 'demo' });
    await flush();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(preview.command()).toBe('acloud playroom create demo');
  });

  it('skips the call when the input has not changed', async () => {
    // The component receives a fresh input object during change detection.
    // Without the fingerprint it would make a redundant IPC hop each pass.
    const fetch = vi.fn().mockResolvedValue(['acloud']);
    const preview = new CommandPreview<{ name: string }>(fetch);

    preview.refreshIfInputChanged({ name: 'demo' });
    preview.refreshIfInputChanged({ name: 'demo' });
    preview.refreshIfInputChanged({ name: 'demo' });
    await flush();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('calls again once the input actually changes', async () => {
    const fetch = vi.fn().mockResolvedValue(['acloud']);
    const preview = new CommandPreview<{ name: string }>(fetch);

    preview.refreshIfInputChanged({ name: 'demo' });
    await flush();
    preview.refreshIfInputChanged({ name: 'other' });
    await flush();

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('ignores a slow response that a newer one has overtaken', async () => {
    // Typing produces overlapping requests; the last input typed must win,
    // not the last response to arrive.
    let resolveFirst: (v: string[]) => void = () => {};
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string[]>((res) => {
            resolveFirst = res;
          }),
      )
      .mockImplementationOnce(() => Promise.resolve(['acloud', 'second']));

    const preview = new CommandPreview<{ name: string }>(fetch);
    preview.refreshIfInputChanged({ name: 'first' });
    preview.refreshIfInputChanged({ name: 'second' });
    await flush();

    expect(preview.command()).toBe('acloud second');

    resolveFirst(['acloud', 'first']);
    await flush();

    expect(preview.command()).toBe('acloud second');
  });

  it('clears the preview when the backend call fails', async () => {
    const preview = new CommandPreview<{ name: string }>(
      vi.fn().mockRejectedValue(new Error('nope')),
    );
    preview.refreshIfInputChanged({ name: 'demo' });
    await flush();
    expect(preview.command()).toBe('');
  });

  it('re-fetches the same input after a reset', async () => {
    // reset() runs when a drawer reopens on a fresh form; the fingerprint must
    // not make that a no-op.
    const fetch = vi.fn().mockResolvedValue(['acloud']);
    const preview = new CommandPreview<{ name: string }>(fetch);

    preview.refreshIfInputChanged({ name: 'demo' });
    await flush();
    preview.clear();
    expect(preview.command()).toBe('');

    preview.refreshIfInputChanged({ name: 'demo' });
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('drops an in-flight response that a reset has invalidated', async () => {
    let resolve: (v: string[]) => void = () => {};
    const preview = new CommandPreview<{ name: string }>(
      () =>
        new Promise<string[]>((res) => {
          resolve = res;
        }),
    );

    preview.refreshIfInputChanged({ name: 'demo' });
    preview.clear();
    resolve(['acloud', 'stale']);
    await flush();

    expect(preview.command()).toBe('');
  });
});

describe('splitCommandPreview', () => {
  it('styles flags separately from values without changing the shell preview', () => {
    const command =
      "acloud playroom create 'long name' --image opencode --privileged=false -o json --token '[redacted]'";
    const parts = splitCommandPreview(command);
    expect(parts.map((part) => part.text).join('')).toBe(command);
    expect(parts.filter((part) => part.kind === 'flag').map((part) => part.text)).toEqual([
      '--image',
      '--privileged=',
      '-o',
      '--token',
    ]);
    expect(parts.find((part) => part.text === 'false')?.kind).toBe('value');
  });

  it('keeps quoted flags, negative numbers and arguments after -- as values', () => {
    const command = 'acloud demo --count -2 "--quoted" "a b" -- --literal';
    const parts = splitCommandPreview(command);
    expect(parts.map((part) => part.text).join('')).toBe(command);
    expect(parts.filter((part) => part.kind === 'flag').map((part) => part.text)).toEqual([
      '--count',
      '--',
    ]);
    expect(splitCommandPreview('')).toEqual([]);
  });
});
