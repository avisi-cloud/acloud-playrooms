import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/rooms');
  await expect(
    page.getByRole('link', { name: 'Open playroom api-development', exact: true }),
  ).toBeVisible();
});

test('searches commands, navigates with Enter and remembers recent choices', async ({ page }) => {
  await page.keyboard.press('Meta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette', exact: true });
  const search = palette.getByRole('combobox', {
    name: 'Search playrooms, playhouses and actions',
  });
  await expect(search).toBeFocused();
  await search.fill('sttng');
  await expect(palette.getByRole('option').first()).toContainText('Settings');
  await search.press('Enter');
  await expect(page).toHaveURL('/settings');
  await expect(palette).toBeHidden();
  await page.keyboard.press('Meta+k');
  await expect(palette.getByRole('option').first()).toContainText('Settings');
  await search.press('ArrowDown');
  await expect(palette.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
  await search.press('Escape');
  await expect(palette).toBeHidden();
});

test('hands connect to the existing dialog and closes it with Escape', async ({ page }) => {
  await page.keyboard.press('Meta+k');
  const palette = page.getByRole('dialog', { name: 'Command palette', exact: true });
  const search = palette.getByRole('combobox', {
    name: 'Search playrooms, playhouses and actions',
  });
  await search.fill('Connect api-development');
  await search.press('Enter');
  await expect(palette).toBeHidden();
  const connect = page.getByRole('dialog', { name: 'Connect to api-development', exact: true });
  await expect(connect).toBeVisible();
  await expect(connect.locator(':focus')).toHaveCount(1);
  await expect(connect.getByRole('tab', { name: /Connect/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await connect.locator('#connect-terminal').click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(connect).toBeVisible();
  await connect.getByRole('textbox', { name: 'User', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(connect).toBeHidden();
});

test('lists command K in the keyboard shortcut overview', async ({ page }) => {
  await page.locator('#main-content').focus();
  await page.keyboard.press('?');
  const overview = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true });
  await expect(overview).toContainText('Command palette');
  await expect(overview).toContainText('⌘K');
});

test('runs room lifecycle actions and switches to a matching playhouse', async ({ page }) => {
  const palette = page.getByRole('dialog', { name: 'Command palette', exact: true });
  const search = palette.getByRole('combobox', {
    name: 'Search playrooms, playhouses and actions',
  });
  const room = page.getByRole('link', { name: 'Open playroom api-development', exact: true });
  for (const [action, status] of [
    ['Stop', 'Stopped'],
    ['Start', 'Ready'],
  ]) {
    await page.locator('#main-content').focus();
    await page.keyboard.press('Meta+k');
    await search.fill(`${action} api-development`);
    await expect(palette.getByRole('option')).toHaveCount(1);
    await search.press('Enter');
    await expect(palette).toBeHidden();
    await expect(room).toContainText(status);
  }
  await page.locator('#main-content').focus();
  await page.keyboard.press('Meta+k');
  await search.fill('Switch playhouse: playhouse-platform-shared');
  await expect(palette.getByRole('option')).toHaveCount(1);
  await search.press('Enter');
  await expect(palette).toBeHidden();
  await expect(
    page.getByRole('link', { name: 'Open playroom shared-tooling', exact: true }),
  ).toBeVisible();
});
