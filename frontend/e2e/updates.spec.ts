import { expect, test } from '@playwright/test';

test("keeps updates in the sidebar, floats What's new and remembers the app check switch", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const key = 'acloud-playroom-gui-dummy-cache';
    if (!localStorage.getItem(key))
      localStorage.setItem(key, JSON.stringify({ lastSeenAppVersion: '0.28.0' }));
  });
  await page.goto('/settings?updates=available');
  const update = page.getByRole('button', { name: 'Update 0.30.0 available', exact: true });
  await expect(update).toBeVisible();
  const headerTop = (await page.locator('.page-header').boundingBox())!.y;
  expect(headerTop).toBeLessThan(50);
  const whatsNew = page.getByRole('status', { name: "What's new in 0.29.1+dummy" });
  await expect(whatsNew).toBeVisible();
  await expect(page.locator('app-update-notices.page-notice section')).toHaveCount(1);
  await whatsNew.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(whatsNew).toHaveCount(0);
  expect((await page.locator('.page-header').boundingBox())!.y).toBe(headerTop);
  await update.click();
  const details = page.getByRole('dialog', { name: 'Available updates', exact: true });
  const app = details.getByRole('region', { name: 'Version 0.30.0 is available', exact: true });
  await expect(app).toContainText('brew upgrade --cask acloud-playrooms');
  await expect(app.getByRole('link', { name: 'Release notes', exact: true })).toHaveAttribute(
    'href',
    'https://github.com/avisi-cloud/acloud-playrooms/releases/tag/v0.30.0',
  );
  await expect(
    details.getByRole('region', { name: 'acloud 0.41.0 is available according to Homebrew' }),
  ).toBeVisible();
  await app.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(app).toHaveCount(0);
  await details.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(details).toBeHidden();
  await expect(update).toHaveCount(0);
  await page.locator('#check-for-updates').uncheck();
  await page.reload();
  await expect(page.locator('#check-for-updates')).not.toBeChecked();
  await expect(whatsNew).toHaveCount(0);
  await expect(update).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'acloud 0.41.0 available', exact: true }),
  ).toBeVisible();
});
