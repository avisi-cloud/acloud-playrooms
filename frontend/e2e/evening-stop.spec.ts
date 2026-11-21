import { expect, type Page, test } from '@playwright/test';

async function openClockPreview(page: Page, path: string) {
  const start = new Date('2026-11-23T12:00:00Z');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
  await page.goto(path);
  await page.clock.runFor(5500);
}

test('saves evening stop settings and a per-room Keep running opt-out', async ({ page }) => {
  await page.goto('/settings');
  const enabled = page.locator('#evening-stop-enabled');
  await expect(enabled).not.toBeChecked();
  await enabled.check();
  await expect(enabled).toBeEnabled();
  await page.locator('#evening-stop-time').fill('21:30');
  await expect(enabled).toBeEnabled();
  await page.locator('#evening-stop-days').click();
  await page.getByRole('option', { name: 'Every day', exact: true }).click();
  await expect(enabled).toBeEnabled();
  await page.reload();
  await expect(enabled).toBeChecked();
  await expect(page.locator('#evening-stop-time')).toHaveValue('21:30');
  await expect(page.locator('#evening-stop-days')).toContainText('Every day');
  await page.goto('/rooms');
  await page
    .getByRole('link', { name: 'Open playroom api-development', exact: true })
    .locator('.card-name')
    .click();
  const keep = page.locator('#room-keep-running');
  await expect(keep).toBeEnabled();
  await keep.check();
  await expect(keep).toBeEnabled();
  await page.reload();
  await expect(keep).toBeChecked();
});

test('offers snooze and Keep running tonight in the fast-clock preview', async ({ page }) => {
  await openClockPreview(page, '/settings?schedule=fast');
  await page.locator('#evening-stop-enabled').check();
  await page.clock.runFor(50);
  await expect(page.locator('#evening-stop-enabled')).toBeEnabled();
  const headerBefore = await page.locator('.page-header').boundingBox();
  await page.clock.runFor(1000);
  const reminder = page.getByRole('status', { name: 'Playroom reminder' });
  await expect(reminder).toContainText('api-development and 1 more stop at 22:00');
  expect((await page.locator('.page-header').boundingBox())?.y).toBe(headerBefore?.y);
  await reminder.getByRole('button', { name: 'Snooze 1 hour', exact: true }).click();
  await page.clock.runFor(50);
  await expect(reminder).toHaveCount(0);
  await page.clock.runFor(60_000);
  await expect(reminder).toContainText('api-development and 1 more stop at 23:00');
  await reminder.getByRole('button', { name: 'Keep running tonight', exact: true }).click();
  await page.clock.runFor(50);
  await expect(reminder).toHaveCount(0);
});

test('shows an honest idle reminder with a Stop action', async ({ page }) => {
  await openClockPreview(page, '/rooms?schedule=idle');
  const reminder = page
    .getByRole('status', { name: 'Playroom reminder' })
    .filter({ hasText: 'api-development:' });
  await expect(reminder).toContainText('No connection from this app for 4 hours', {
    timeout: 10_000,
  });
  await reminder.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.clock.runFor(1500);
  await expect(reminder).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Open playroom api-development', exact: true }),
  ).toContainText('Stopped');
  await expect(
    page.getByRole('link', {
      name: 'Open playroom workspace-with-a-long-name-for-layout-experiments',
      exact: true,
    }),
  ).toContainText('Ready');
});
