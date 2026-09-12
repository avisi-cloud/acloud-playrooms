import { PageLoadingService } from './page-loading';

describe('PageLoadingService', () => {
  it('is active only while a shown load is running', async () => {
    const service = new PageLoadingService();
    let release = () => {};
    const work = new Promise<void>((resolve) => {
      release = resolve;
    });

    const running = service.runAndShowIndicatorIf(true, () => work);
    expect(service.active()).toBe(true);

    release();
    await running;
    expect(service.active()).toBe(false);
  });

  it('stays quiet for reads that are not first loads', async () => {
    const service = new PageLoadingService();
    let release = () => {};
    const work = new Promise<void>((resolve) => {
      release = resolve;
    });

    const running = service.runAndShowIndicatorIf(false, () => work);
    expect(service.active()).toBe(false);

    release();
    await running;
  });

  it('waits for the last of several overlapping loads', async () => {
    // A count rather than a flag: the first load to finish must not clear the
    // indicator while a second is still running.
    const service = new PageLoadingService();
    let releaseFirst = () => {};
    let releaseSecond = () => {};
    const first = service.runAndShowIndicatorIf(
      true,
      () =>
        new Promise<void>((r) => {
          releaseFirst = r;
        }),
    );
    const second = service.runAndShowIndicatorIf(
      true,
      () =>
        new Promise<void>((r) => {
          releaseSecond = r;
        }),
    );

    releaseFirst();
    await first;
    expect(service.active()).toBe(true);

    releaseSecond();
    await second;
    expect(service.active()).toBe(false);
  });

  it('clears when the work fails', async () => {
    const service = new PageLoadingService();
    await expect(
      service.runAndShowIndicatorIf(true, () => Promise.reject(new Error('nope'))),
    ).rejects.toThrow('nope');
    expect(service.active()).toBe(false);
  });
});
