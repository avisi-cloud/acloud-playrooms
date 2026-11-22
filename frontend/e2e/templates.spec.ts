import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('saves, manages, shares and starts from a playroom template', async ({ page }) => {
  await page.goto('/rooms');
  await page.getByRole('button', { name: /\bCreate Playroom$/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Create playroom', exact: true });
  await drawer.getByRole('button', { name: 'Web development', exact: true }).click();
  await drawer.getByLabel('Name', { exact: true }).fill('template-room');
  const saveTemplate = drawer.getByRole('region', { name: 'Save playroom template', exact: true });
  await saveTemplate.getByLabel('Save as template', { exact: true }).fill('Reusable room');
  await saveTemplate.getByRole('button', { name: 'Save template', exact: true }).click();
  await expect(saveTemplate.getByRole('status')).toHaveText('Template saved.');
  await drawer.getByRole('button', { name: 'Close create playroom', exact: true }).click();

  await page.getByRole('link', { name: /Settings$/ }).click();
  const settings = page.getByRole('region', { name: 'Playroom templates', exact: true });
  const row = settings.getByRole('group', { name: 'Template Reusable room', exact: true });
  await expect(row.getByRole('textbox')).toHaveCount(0);
  await row.getByRole('button', { name: 'Rename', exact: true }).click();
  await row.getByRole('textbox', { name: 'Template name', exact: true }).fill('Cancelled name');
  await row.getByRole('textbox', { name: 'Template name', exact: true }).press('Escape');
  await expect(row.getByRole('textbox')).toHaveCount(0);
  await expect(row.getByText('Reusable room', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Rename', exact: true }).click();
  await row.getByRole('textbox', { name: 'Template name', exact: true }).fill('Shared room');
  await row.getByRole('textbox', { name: 'Template name', exact: true }).press('Enter');
  const shared = settings.getByRole('group', { name: 'Template Shared room', exact: true });
  await expect(shared).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await shared.getByRole('button', { name: 'Export', exact: true }).click();
  const download = await downloadEvent;
  const path = await download.path();
  const file = JSON.parse(await readFile(path!, 'utf8'));
  expect(file.version).toBe(1);
  expect(file.templates[0].options.ports).toEqual(['8080:8080']);
  expect(file.templates[0].options).not.toHaveProperty('name');
  await shared.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(shared).toHaveCount(0);
  const chooserEvent = page.waitForEvent('filechooser');
  await settings.getByRole('button', { name: 'Import templates', exact: true }).click();
  await (await chooserEvent).setFiles(path!);
  await expect(settings.getByText('Shared room', { exact: true })).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Workspace', exact: true })
    .getByRole('link', { name: /Playrooms\b/ })
    .click();
  await page.getByRole('button', { name: /\bCreate Playroom$/ }).click();
  await drawer.getByRole('button', { name: 'Shared room', exact: true }).click();
  await drawer.getByLabel('Name', { exact: true }).fill('from-template');
  await drawer.getByRole('button', { name: /\bCreate$/, exact: false }).click();
  await expect(
    page.getByRole('link', { name: 'Open playroom from-template', exact: true }),
  ).toBeVisible();
});

test('refuses unknown fields on import without changing saved templates', async ({ page }) => {
  await page.goto('/settings');
  const settings = page.getByRole('region', { name: 'Playroom templates', exact: true });
  await expect(
    settings.getByRole('button', { name: 'Import templates', exact: true }),
  ).toBeEnabled();
  const chooserEvent = page.waitForEvent('filechooser');
  await settings.getByRole('button', { name: 'Import templates', exact: true }).click();
  await (
    await chooserEvent
  ).setFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":1,"templates":[],"unknown":true}'),
  });
  await expect(settings.getByRole('alert')).toContainText('Unknown');
  await expect(settings.getByText('Web development', { exact: true })).toBeVisible();
});
