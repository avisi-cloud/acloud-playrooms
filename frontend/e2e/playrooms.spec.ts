import { expect, type Page, test } from '@playwright/test';

// Icon glyphs are included in accessible names, so match action text at the end.

// Click the room name: the middle of a card can hold one of its action buttons.
async function openRoom(page: Page, name: string) {
  await page
    .getByRole('link', { name: `Open playroom ${name}`, exact: true })
    .locator('.card-name')
    .click();
  await expect(page).toHaveURL(new RegExp(`/rooms/.+`));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/rooms');
  await expect(
    page.getByRole('link', { name: 'Open playroom api-development', exact: true }),
  ).toBeVisible();
});

test('shows fixture statuses and narrows playrooms by search and status', async ({ page }) => {
  const rooms = page.getByRole('region', { name: 'Playrooms', exact: true });
  await expect(rooms.getByRole('link')).toHaveCount(6);
  for (const [name, status] of [
    ['api-development', 'Ready'],
    ['frontend-redesign', 'Ready'],
    ['review-payments', 'Stopped'],
    ['integration-tests', 'Creating'],
    ['failed-image-build', 'Failed'],
    ['workspace-with-a-long-name-for-layout-experiments', 'Ready'],
  ]) {
    await expect(
      rooms.getByRole('link', { name: `Open playroom ${name}`, exact: true }),
    ).toContainText(status);
  }

  await page.getByRole('textbox', { name: 'Search playrooms' }).fill('review');
  await expect(rooms.getByRole('link')).toHaveCount(1);
  await expect(
    rooms.getByRole('link', { name: 'Open playroom review-payments', exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('ready');
  await expect(rooms.getByRole('link')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No playrooms match' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search playrooms' }).clear();
  await expect(rooms.getByRole('link')).toHaveCount(3);
  await page.getByRole('combobox', { name: 'Filter by status' }).selectOption('stopped');
  await expect(rooms.getByRole('link')).toHaveCount(1);
  await expect(
    rooms.getByRole('link', { name: 'Open playroom review-payments', exact: true }),
  ).toBeVisible();
});

test('opens a room and returns to the overview', async ({ page }) => {
  await openRoom(page, 'api-development');
  await expect(page).toHaveURL('/rooms/api-development');
  await expect(page.getByRole('heading', { level: 1, name: 'api-development.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Connection', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /\bPlayrooms$/ }).click();
  await expect(page).toHaveURL('/rooms');
  await expect(
    page.getByRole('region', { name: 'Playrooms', exact: true }).getByRole('link'),
  ).toHaveCount(6);
});

test('creates a simulated playroom in Easy mode', async ({ page }) => {
  await page.getByRole('button', { name: /\bCreate Playroom$/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Create playroom', exact: true });
  await expect(drawer.getByRole('button', { name: 'Show advanced options' })).toBeVisible();
  await drawer.getByRole('textbox', { name: 'Name', exact: true }).fill('browser-test-room');
  await drawer.getByRole('button', { name: /\bCreate$/ }).click();
  await expect(drawer).toBeHidden();
  const room = page.getByRole('link', { name: 'Open playroom browser-test-room', exact: true });
  await expect(room).toBeVisible();
  await expect(room).toContainText('Ready');
  await page.getByRole('button', { name: /\bRefresh$/ }).click();
  await expect(room).toBeVisible();
});

test('stops and starts a playroom', async ({ page }) => {
  await openRoom(page, 'api-development');
  await page.getByRole('button', { name: /\bStop$/ }).click();
  await expect(page.getByRole('button', { name: /\bStart$/ })).toBeVisible();
  await page.getByRole('button', { name: /\bPlayrooms$/ }).click();
  await expect(
    page.getByRole('link', { name: 'Open playroom api-development', exact: true }),
  ).toContainText('Stopped');
  await openRoom(page, 'api-development');
  await page.getByRole('button', { name: /\bStart$/ }).click();
  await expect(page.getByRole('button', { name: /\bStop$/ })).toBeVisible();
  await page.getByRole('button', { name: /\bPlayrooms$/ }).click();
  await expect(
    page.getByRole('link', { name: 'Open playroom api-development', exact: true }),
  ).toContainText('Ready');
});

test('requires the matching name before deleting a playroom', async ({ page }) => {
  await openRoom(page, 'api-development');
  await page.getByLabel('More actions for playroom api-development', { exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete playroom', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete api-development', exact: true });
  const deleteButton = dialog.getByRole('button', { name: /\bDelete$/ });
  await expect(deleteButton).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Confirm name' }).fill('wrong-name');
  await expect(deleteButton).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Confirm name' }).fill('api-development');
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL('/rooms');
  await page.getByRole('button', { name: /\bRefresh$/ }).click();
  const rooms = page.getByRole('region', { name: 'Playrooms', exact: true });
  await expect(rooms.getByRole('link')).toHaveCount(5);
  await expect(
    rooms.getByRole('link', { name: 'Open playroom api-development', exact: true }),
  ).toHaveCount(0);
});

test('switches playhouse through the chooser', async ({ page }) => {
  await page.getByRole('button', { name: /Playhouse playhouse-platform-dev/ }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose a playhouse', exact: true });
  await chooser.getByRole('option', { name: /playhouse-platform-shared/ }).click();
  await chooser.getByRole('button', { name: /\bOpen playhouse$/ }).click();
  await expect(chooser).toBeHidden();
  await expect(
    page.getByRole('button', { name: /Playhouse playhouse-platform-shared/ }),
  ).toBeVisible();
  const rooms = page.getByRole('region', { name: 'Playrooms', exact: true });
  await expect(rooms.getByRole('link')).toHaveCount(1);
  await expect(
    rooms.getByRole('link', { name: 'Open playroom shared-tooling', exact: true }),
  ).toBeVisible();
});

test('remembers the Appearance theme after a reload', async ({ page }) => {
  await page.getByRole('link', { name: /\bSettings$/ }).click();
  const appearance = page.getByRole('region', { name: 'Appearance', exact: true });
  await appearance.getByRole('radio', { name: 'Light', exact: true }).check();
  await page.reload();
  await expect(appearance.getByRole('radio', { name: 'Light', exact: true })).toBeChecked();
  await appearance.getByRole('radio', { name: 'Dark', exact: true }).check();
  await page.reload();
  await expect(appearance.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
});

test('checks taken names and applies a cleaned name while typing', async ({ page }) => {
  await page.getByRole('button', { name: /\bCreate Playroom$/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Create playroom', exact: true });
  const name = drawer.getByRole('textbox', { name: 'Name', exact: true });
  await name.fill('api-development');
  await expect(drawer.getByText('Already used in this playhouse', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: /\bCreate$/ })).toBeDisabled();
  await name.fill('My_API Room!');
  await drawer.getByRole('button', { name: 'Use my-api-room', exact: true }).click();
  await expect(name).toHaveValue('my-api-room');
  await expect(drawer.getByRole('button', { name: /\bCreate$/ })).toBeEnabled();
});

for (const entry of ['card', 'details'] as const) {
  test(`creates a similar playroom from ${entry} with reported settings`, async ({ page }) => {
    if (entry === 'details') await openRoom(page, 'api-development');
    await page.getByLabel('More actions for playroom api-development', { exact: true }).click();
    await page.getByRole('menuitem', { name: 'Create similar', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Create playroom', exact: true });
    await expect(drawer.getByRole('navigation', { name: 'Wizard steps' })).toBeVisible();
    await expect(drawer.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('');
    await expect(drawer.getByText(/Not copied:/)).toBeVisible();
    await expect(
      drawer.getByRole('textbox', { name: 'Select or type an image', exact: true }),
    ).toHaveValue('opencode');
    await drawer.getByRole('textbox', { name: 'Name', exact: true }).fill(`similar-${entry}`);
    await drawer.getByRole('button', { name: /\bNext$/ }).click();
    await expect(drawer.getByRole('textbox', { name: /Guaranteed CPU/ })).toHaveValue('500m');
    await expect(drawer.getByRole('textbox', { name: 'Storage', exact: true })).toHaveValue('20Gi');
    await drawer.getByRole('button', { name: /\bNext$/ }).click();
    await expect(drawer.getByRole('textbox', { name: 'port 1', exact: true })).toHaveValue('3000');
    await expect(drawer.getByRole('textbox', { name: 'port 2', exact: true })).toHaveValue(
      '8080:80',
    );
    await drawer.getByRole('button', { name: /\bNext$/ }).click();
    await drawer.getByRole('button', { name: /\bNext$/ }).click();
    await drawer.getByRole('button', { name: /\bCreate$/ }).click();
    await expect(drawer).toBeHidden();
    if (entry === 'details') await page.getByRole('button', { name: /\bPlayrooms$/ }).click();
    const room = page.getByRole('link', { name: `Open playroom similar-${entry}`, exact: true });
    await expect(room).toBeVisible();
    await expect(room).toContainText('opencode');
  });
}
