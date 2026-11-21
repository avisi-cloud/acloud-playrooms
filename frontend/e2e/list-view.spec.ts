import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/rooms');
  await expect(
    page.getByRole('link', { name: 'Open playroom api-development', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'List', exact: true }).click();
});

test('shows dense rows and remembers List and owner grouping on reload', async ({ page }) => {
  const table = page.getByRole('table', { name: 'Playrooms', exact: true });
  await expect(table.getByRole('columnheader')).toHaveText([
    'Name',
    'Status',
    'Owner',
    'Image',
    'Size',
    'Age',
    'Ports',
    'Actions',
  ]);
  await expect(table.locator('tbody tr')).toHaveCount(6);
  await page.getByRole('checkbox', { name: 'Group by owner', exact: true }).check();
  await expect(page.locator('.owner-label')).toHaveText([
    'Mine',
    'jordan@example.test',
    'sam@example.test',
  ]);
  await expect(page.locator('.owner-count')).toHaveText(['4', '1', '1']);
  const mine = page.getByRole('button', { name: 'Mine, 4 rooms', exact: true });
  await mine.click();
  await expect(mine).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('table', { name: 'Mine', exact: true })).toBeHidden();
  await mine.click();
  await expect(page.getByRole('table', { name: 'Mine', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('checkbox', { name: 'Group by owner', exact: true })).toBeChecked();
  await expect(
    page.getByRole('table', { name: 'Mine', exact: true }).locator('tbody tr'),
  ).toHaveCount(4);
});

test('combines search, status, pins and selection across views', async ({ page }) => {
  await page.getByRole('button', { name: 'Pin playroom frontend-redesign', exact: true }).click();
  const table = page.getByRole('table', { name: 'Playrooms', exact: true });
  await expect(table.locator('tbody tr').first()).toContainText('frontend-redesign');
  await page.getByRole('button', { name: 'Ready 3', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search playrooms' }).fill('claude-code');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Select playrooms', exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'Select playroom frontend-redesign', exact: true })
    .check();
  await page.getByRole('checkbox', { name: 'Group by owner', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Mine, 1 room', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Select playroom frontend-redesign', exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Unpin playroom frontend-redesign', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Select playroom frontend-redesign', exact: true }),
  ).toBeChecked();
});

test('reaches the shared action host and room details from a row', async ({ page }) => {
  await page.getByRole('button', { name: /Connect to playroom api-development$/ }).click();
  const connect = page.getByRole('dialog', { name: 'Connect to api-development', exact: true });
  await expect(connect).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /More actions for playroom api-development$/ }).click();
  await page.getByRole('menuitem', { name: /Open details$/ }).click();
  await expect(page).toHaveURL('/rooms/api-development');
  await page.getByRole('button', { name: /\bPlayrooms$/ }).click();
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('link', { name: 'Open playroom frontend-redesign', exact: true }).click();
  await expect(page).toHaveURL('/rooms/frontend-redesign');
});

for (const width of [1280, 900]) {
  test(`keeps the table and every row action inside the page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const table = page.getByRole('table', { name: 'Playrooms', exact: true });
    await expect
      .poll(() => table.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
      .toBe(true);
    const tableBox = await table.boundingBox();
    expect(tableBox).not.toBeNull();
    expect(tableBox!.x + tableBox!.width).toBeLessThanOrEqual(width);
    const row = table.locator('tbody tr').filter({ hasText: 'api-development' });
    await expect(row.locator('td').nth(2)).toHaveText('you');
    const buttons = row.locator('td').last().getByRole('button');
    await expect(buttons).toHaveCount(4);
    for (const button of await buttons.all()) {
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(tableBox!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(tableBox!.x + tableBox!.width);
    }
    if (width === 900)
      await expect(table.getByRole('columnheader', { name: 'Size', exact: true })).toBeHidden();
    await row.getByRole('button', { name: /Connect to playroom api-development$/ }).click();
    await expect(
      page.getByRole('dialog', { name: 'Connect to api-development', exact: true }),
    ).toBeVisible();
  });
}
