import { expect, type Page, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function exportSettings(page: Page): Promise<Record<string, Record<string, unknown>>> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export settings…$/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('acloud-playrooms-settings.json');
  return JSON.parse(await readFile(await file.path(), 'utf8'));
}

async function importSettings(page: Page, content: string): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Import settings…$/ }).click();
  await (
    await chooser
  ).setFiles({
    name: 'acloud-playrooms-settings.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content),
  });
}

test('exports settings and imports them after showing what changes', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('#evening-stop-time')).toHaveValue('22:00');

  const exported = await exportSettings(page);
  expect(exported['format']).toBe('acloud-playrooms-settings');
  expect(exported['version']).toBe(1);
  expect(exported['appPreferences']['theme']).toBe('dark');
  expect(exported['playroomDefaults']).toEqual({});
  expect(JSON.stringify(exported)).not.toMatch(/token|secret|password/i);

  exported['appPreferences']['theme'] = 'light';
  exported['eveningStop']['time'] = '21:30';
  exported['playroomDefaults'] = { storage: '40Gi' };
  await importSettings(page, JSON.stringify(exported));

  const dialog = page.getByRole('dialog', { name: 'Import settings' });
  const changes = dialog.getByRole('table', { name: 'Settings that will change' });
  await expect(changes.getByRole('row', { name: /Theme/ })).toContainText('DarkLight');
  await expect(changes.getByRole('row', { name: /Stop at/ })).toContainText('22:0021:30');
  await expect(changes.getByRole('row', { name: /storage/ })).toContainText('Built-in (20Gi)40Gi');
  await expect(page.locator('html')).toHaveClass(/app-dark/);

  await dialog.getByRole('button', { name: 'Apply 3 changes' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.locator('.toast-detail').filter({ hasText: 'Imported 3 settings' }),
  ).toBeVisible();
  await expect(page.locator('html')).not.toHaveClass(/app-dark/);
  await expect(page.locator('#evening-stop-time')).toHaveValue('21:30');

  const again = await exportSettings(page);
  expect(again['playroomDefaults']).toEqual({ storage: '40Gi' });
  await importSettings(page, JSON.stringify(again));
  await expect(dialog).toContainText('This file matches your current settings.');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
});

test('refuses a settings file with an unknown key', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('#evening-stop-time')).toHaveValue('22:00');
  const exported = await exportSettings(page);
  exported['toolPaths']['ssh'] = '/usr/bin/ssh';

  await importSettings(page, JSON.stringify(exported));

  await expect(
    page.locator('.toast-summary').filter({ hasText: 'Could not import settings' }),
  ).toBeVisible();
  await expect(
    page.locator('.toast-detail').filter({ hasText: 'Unknown setting "ssh"' }),
  ).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Import settings' })).toHaveCount(0);
});
