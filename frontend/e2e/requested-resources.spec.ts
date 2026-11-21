import { expect, test } from '@playwright/test';

for (const [width, visibleText] of [
  [1280, 'Requested 4.5 CPU · 18 GiB · 140 GiB'],
  [900, '4.5 CPU · 18 GiB'],
] as const) {
  test(`shows requested resources uncut at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/rooms');
    const summary = page.getByRole('button', { name: 'Requested resources', exact: true });
    await expect(summary).toBeVisible();
    expect((await summary.innerText()).replace(/\s+/g, ' ').trim()).toBe(visibleText);
    expect(await summary.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    const bounds = (await summary.boundingBox())!;
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);

    const details = page.getByRole('dialog', { name: 'Requested resources', exact: true });
    await summary.click();
    await expect(details).toContainText('Requested: 4.5 CPU · 18 GiB memory · 140 GiB storage');
    await expect(details).toContainText('Yours: 2 CPU · 8 GiB memory · 100 GiB storage');
    await page.keyboard.press('Escape');
    await expect(details).toBeHidden();

    await summary.click();
    await expect(details).toBeVisible();
    await page.locator('.rooms-title-row h1').click();
    await expect(details).toBeHidden();

    await page.getByRole('textbox', { name: 'Search playrooms' }).fill('no-match');
    await expect(page.getByRole('heading', { name: 'No playrooms match' })).toBeVisible();
    expect((await summary.innerText()).replace(/\s+/g, ' ').trim()).toBe(visibleText);
  });
}
