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
  await expect(page.getByRole('button', { name: 'Stopped 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ready 3', exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search playrooms' }).clear();
  await page.getByRole('button', { name: 'Ready 3', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search playrooms' }).fill('review');
  await expect(rooms.getByRole('link')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No playrooms match' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search playrooms' }).clear();
  await expect(rooms.getByRole('link')).toHaveCount(3);
  await page.getByRole('button', { name: 'Stopped 1', exact: true }).click();
  await expect(rooms.getByRole('link')).toHaveCount(1);
  await expect(
    rooms.getByRole('link', { name: 'Open playroom review-payments', exact: true }),
  ).toBeVisible();
});

test('searches images and both forwarded port numbers', async ({ page }) => {
  const rooms = page.getByRole('region', { name: 'Playrooms', exact: true });
  const search = page.getByRole('textbox', { name: 'Search playrooms' });
  await search.fill('custom-image:missing');
  await expect(rooms.getByRole('link')).toHaveCount(1);
  await expect(rooms.getByRole('link').first()).toHaveAttribute(
    'aria-label',
    'Open playroom failed-image-build',
  );
  for (const port of ['8080', '3000']) {
    await search.fill(port);
    await expect(rooms.getByRole('link')).toHaveCount(5);
    await expect(
      rooms.getByRole('link', { name: 'Open playroom review-payments', exact: true }),
    ).toHaveCount(0);
  }
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
  const removed = dialog.getByRole('list', { name: 'What deleting removes', exact: true });
  await expect(removed.getByRole('listitem')).toHaveText([
    'The home folder /home/playroom (20Gi) and everything in it',
    'Its persistent storage, which cannot be recovered',
  ]);
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

test('offers Easy create as the first step in an empty playhouse', async ({ page }) => {
  await page.getByRole('button', { name: /\bCreate Playroom$/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Create playroom', exact: true });
  await drawer.getByRole('button', { name: 'Show advanced options' }).click();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();

  await page.getByRole('button', { name: /Playhouse playhouse-platform-dev/ }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose a playhouse', exact: true });
  await chooser.getByRole('option', { name: /playhouse-platform-infrastructure/ }).click();
  await chooser.getByRole('button', { name: /\bOpen playhouse$/ }).click();
  await expect(chooser).toBeHidden();
  await expect(page.getByRole('heading', { name: 'No playrooms yet', exact: true })).toBeVisible();

  await page.getByRole('button', { name: /\bCreate your first playroom$/ }).click();
  await expect(drawer.getByRole('button', { name: 'Show advanced options' })).toBeVisible();
});

test('explains an organisation without playhouses and offers a way out', async ({ page }) => {
  await page.getByRole('button', { name: /Playhouse playhouse-platform-dev/ }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose a playhouse', exact: true });
  await chooser.getByRole('option', { name: /New team \(empty\)/ }).click();
  await expect(page).toHaveURL(/\/playhouse$/);
  await chooser.getByRole('button', { name: 'Close chooser', exact: true }).click();
  await expect(chooser).toBeHidden();

  await expect(
    page.getByRole('heading', { name: 'No playhouses in new-team', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /\bCreate a playhouse$/ })).toBeVisible();
  await page.getByRole('button', { name: /\bSwitch organisation$/ }).click();
  await expect(chooser).toBeVisible();
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

test('remembers keeping the app running in the menu bar after a reload', async ({ page }) => {
  await page.getByRole('link', { name: /\bSettings$/ }).click();
  const menuBar = page.getByRole('region', { name: 'Menu bar', exact: true });
  const keepRunning = menuBar.getByRole('switch', { name: 'Keep running in the menu bar' });
  await expect(keepRunning).not.toBeChecked();
  await keepRunning.check();
  await page.reload();
  await expect(keepRunning).toBeChecked();
});

test('offers a session fix on the room error panel', async ({ page }) => {
  await page.goto('/rooms?failure=session');
  const failure = page.locator('.read-failure');
  await expect(failure).toContainText('session not active');
  await failure
    .getByRole('button', { name: 'Sign in to the playhouse again', exact: true })
    .click();
  await expect(failure).toBeHidden();
  await expect(
    page.getByRole('link', { name: 'Open playroom api-development', exact: true }),
  ).toBeVisible();
});

test('confirms the NodePort allowlist command and offers another connection', async ({ page }) => {
  await openRoom(page, 'api-development');
  await page.getByRole('button', { name: /\bConnect$/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect to api-development', exact: true });
  await dialog.locator('#connect-via').click();
  await page.getByRole('option', { name: 'NodePort', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Add my current IP to the allowlist', exact: true })
    .click();
  await expect(dialog).toContainText('--allow-current-ip');
  await dialog.getByRole('button', { name: 'Confirm adding my IP', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Connect again', exact: true })).toBeEnabled();
  await expect(dialog).toContainText('Your IP was added.');
});

test('returns a failed create to Options with its draft', async ({ page }) => {
  await page.goto('/rooms?failure=privileged');
  await page.getByRole('button', { name: /\bCreate Playroom$/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Create playroom', exact: true });
  await drawer.getByRole('textbox', { name: 'Name', exact: true }).fill('fix-options-demo');
  await drawer.getByRole('button', { name: /\bCreate$/, exact: false }).click();
  await page.getByRole('button', { name: 'Go to Options', exact: true }).click();
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('#create-privileged')).toBeVisible();
  await expect(drawer.locator('#create-privileged')).not.toBeChecked();
});

test('offers an update after a recognised room failure', async ({ page }) => {
  await page.goto('/rooms?failure=outdated');
  await openRoom(page, 'review-payments');
  await page.getByRole('button', { name: /\bStart$/ }).click();
  await page.getByRole('button', { name: 'Update playroom', exact: true }).click();
  await expect(
    page.locator('.toast-detail').filter({ hasText: 'Updated "review-payments"' }),
  ).toBeVisible();
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
    // By id: once the image catalog loads, the select names its input after the chosen image.
    await expect(drawer.locator('#create-image')).toHaveValue('opencode');
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

test('pins a room from its card and unpins it from details', async ({ page }) => {
  const rooms = page.getByRole('region', { name: 'Playrooms', exact: true });
  await page.getByRole('button', { name: 'Pin playroom review-payments', exact: true }).click();
  await expect(rooms.getByRole('link').first()).toHaveAttribute(
    'aria-label',
    'Open playroom review-payments',
  );
  await page.getByRole('combobox', { name: 'Sort playrooms' }).selectOption('status');
  await expect(rooms.getByRole('link').first()).toHaveAttribute(
    'aria-label',
    'Open playroom review-payments',
  );
  await page.reload();
  await expect(rooms.getByRole('link').first()).toHaveAttribute(
    'aria-label',
    'Open playroom review-payments',
  );
  await openRoom(page, 'review-payments');
  await page.getByRole('button', { name: 'Unpin playroom review-payments', exact: true }).click();
  await page.getByRole('button', { name: /\bPlayrooms$/ }).click();
  await expect(
    page.getByRole('button', { name: 'Pin playroom review-payments', exact: true }),
  ).toBeVisible();
  await expect(rooms.getByRole('link').first()).toHaveAttribute(
    'aria-label',
    'Open playroom api-development',
  );
});

test('runs the health check from Settings and copies the results', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: /Health check$/ }).click();
  await expect(page).toHaveURL(/\/settings\/health$/);
  await expect(page.getByRole('heading', { name: 'Health check.', exact: true })).toBeVisible();
  const editor = page.getByRole('region', { name: 'Editor', exact: true });
  await expect(editor).toContainText('Remote - SSH extension is not');
  await expect(editor).toContainText('code --install-extension ms-vscode-remote.remote-ssh');
  await expect(page.getByRole('region', { name: 'Tailscale', exact: true })).toContainText(
    'logged in',
  );
  await expect(page.getByRole('status').filter({ hasText: 'need' })).toHaveText(
    '1 check needs attention.',
  );
  await page.getByRole('button', { name: /Run again$/ }).click();
  await expect(editor).toBeVisible();
  await page.getByRole('button', { name: /Copy results$/ }).click();
  await expect(
    page.locator('.toast-detail').filter({ hasText: 'Copied the health check results' }),
  ).toBeVisible();
});

test('offers the health check after a failed open in the editor', async ({ page }) => {
  await openRoom(page, 'api-development');
  await page.getByRole('button', { name: /Open in editor$/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Connect to api-development', exact: true });
  await dialog.getByRole('button', { name: /Open$/ }).click();
  await page.getByRole('button', { name: 'Run health check', exact: true }).first().click();
  await expect(page).toHaveURL(/\/settings\/health$/);
  await expect(page.getByRole('region', { name: 'SSH public key', exact: true })).toContainText(
    'id_ed25519.pub',
  );
});

test('splits pasted git repositories, explains them, and suggests used ones', async ({ page }) => {
  await page.getByRole('button', { name: /\bCreate Playroom$/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Create playroom', exact: true });
  await drawer.getByRole('button', { name: 'Show advanced options' }).click();
  await drawer.getByRole('textbox', { name: 'Name', exact: true }).fill('git-paste-room');
  await drawer.getByRole('button', { name: /\bNext$/ }).click();
  await drawer.getByRole('button', { name: /\bNext$/ }).click();
  await drawer.getByRole('textbox', { name: 'git repository 1', exact: true }).evaluate((input) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData(
      'text/plain',
      'https://gitlab.example.com/team/api.git@main\ngit@github.com:team/web.git\n',
    );
    input.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
    );
  });
  await expect(drawer.getByRole('textbox', { name: 'git repository 1', exact: true })).toHaveValue(
    'https://gitlab.example.com/team/api.git@main',
  );
  await expect(drawer.getByText(/acloud skips SSH remotes/)).toBeVisible();
  await expect(drawer.getByText(/forward GITLAB_TOKEN under Environment variables/)).toBeVisible();
  await drawer.getByLabel('Remove git repository 2', { exact: true }).click();
  await expect(drawer.getByText(/acloud skips SSH remotes/)).toBeHidden();
  await drawer.getByRole('button', { name: /\bNext$/ }).click();
  await drawer.getByRole('button', { name: /\bNext$/ }).click();
  await drawer.getByRole('button', { name: /\bCreate$/ }).click();
  await expect(drawer).toBeHidden();
  await expect(
    page.getByRole('link', { name: 'Open playroom git-paste-room', exact: true }),
  ).toContainText('Ready');

  await page.getByRole('button', { name: /\bCreate Playroom$/ }).click();
  await drawer.getByRole('textbox', { name: 'Name', exact: true }).fill('git-suggest-room');
  await drawer.getByRole('button', { name: /\bNext$/ }).click();
  await drawer.getByRole('button', { name: /\bNext$/ }).click();
  // A row with suggestions is a combobox: the list attribute links it to its datalist.
  const repository = drawer.getByRole('combobox', { name: 'git repository 1', exact: true });
  const suggestions = drawer.locator(`datalist#${await repository.getAttribute('list')} option`);
  await expect(suggestions).toHaveCount(1);
  await expect(suggestions).toHaveAttribute('value', 'https://gitlab.example.com/team/api.git');
});

test('reads the list again by itself and says when it was last read', async ({ page }) => {
  await page.clock.install();
  await page.goto('/rooms');
  const header = page.locator('header.page-header');
  const updated = header.getByText(/^Updated /);
  await expect(updated).toHaveText('Updated just now');
  await page.clock.runFor(7_000);
  await expect(updated).toHaveText(/^Updated [5-8]s ago$/);
  // integration-tests is still creating, so the list reads itself within ten seconds.
  await page.clock.runFor(4_000);
  await expect(updated).toHaveText('Updated just now');
  await page.clock.runFor(7_000);
  await expect(updated).toHaveText(/^Updated [5-8]s ago$/);
  await header.getByRole('button', { name: /Refresh$/ }).click();
  await expect(updated).toHaveText('Updated just now');
});

test('runs bulk actions only on selected owned playrooms with one delete confirmation', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Select playrooms', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Select playroom review-payments', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('checkbox', { name: 'Select playroom api-development', exact: true })
    .check();
  await page
    .getByRole('checkbox', { name: 'Select playroom frontend-redesign', exact: true })
    .check();
  const actions = page.getByRole('group', { name: 'Selection actions' });
  await expect(actions).toContainText('2 selected');
  await actions.getByRole('button', { name: 'Update outdated', exact: true }).click();
  const progress = page.getByRole('list', { name: 'Progress per playroom' });
  await expect(progress).toContainText('frontend-redesign: succeeded');
  await actions.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(progress).toContainText('api-development: succeeded');
  await expect(progress).toContainText('frontend-redesign: succeeded');
  await actions.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Commands finished: 2 succeeded' }),
  ).toBeVisible();
  await actions.getByRole('button', { name: 'Delete selected', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  await expect(dialog).toContainText('api-development');
  await expect(dialog).toContainText('frontend-redesign');
  await expect(dialog.getByRole('button', { name: /Delete selected playrooms$/ })).toBeDisabled();
  await dialog.getByLabel('Type delete to confirm', { exact: true }).fill('delete');
  await dialog.getByRole('button', { name: /Delete selected playrooms$/ }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Select playroom api-development', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('checkbox', { name: 'Select playroom frontend-redesign', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('checkbox', { name: 'Select playroom review-payments', exact: true }),
  ).toBeVisible();
});

test('selects cards with Command-click and Shift-click without navigating', async ({ page }) => {
  await page
    .getByRole('link', { name: 'Open playroom api-development', exact: true })
    .locator('.card-name')
    .click({ modifiers: ['Meta'] });
  await expect(
    page.getByRole('checkbox', { name: 'Select playroom api-development', exact: true }),
  ).toBeChecked();
  await page
    .getByRole('group', { name: 'Select playroom frontend-redesign', exact: true })
    .locator('.card-name')
    .click({ modifiers: ['Shift'] });
  await expect(
    page.getByRole('checkbox', { name: 'Select playroom frontend-redesign', exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Select playroom failed-image-build', exact: true }),
  ).toBeChecked();
  await expect(page).toHaveURL(/\/rooms$/);
});

test('deep links open room details and confirmation surfaces within the current scope', async ({
  page,
}) => {
  const sendLink = async (url: string) => {
    await expect
      .poll(() =>
        page.evaluate(
          (detail) =>
            window.dispatchEvent(new CustomEvent('dummy:deep-link', { detail, cancelable: true })),
          url,
        ),
      )
      .toBe(false);
  };
  const playhouse = 'playhouse-platform-dev';
  await sendLink(`acloud-playrooms://rooms/${playhouse}/api-development`);
  await expect(page).toHaveURL('/rooms/api-development');
  await expect(page.getByRole('heading', { level: 1, name: 'api-development.' })).toBeVisible();
  await page.getByRole('button', { name: /\bCopy link$/ }).click();
  await expect(
    page.locator('.page-header-right').getByRole('button', { name: /\bCopied$/ }),
  ).toBeVisible();
  await sendLink(`acloud-playrooms://connect/${playhouse}/api-development`);
  const connect = page.getByRole('dialog', { name: 'Connect to api-development', exact: true });
  await expect(connect).toBeVisible();
  await expect(connect.getByRole('button', { name: /\bConnect$/, exact: false })).toBeVisible();
  await connect.getByRole('button', { name: /\bCancel$/ }).click();
  await expect(connect).toBeHidden();
  await sendLink(`acloud-playrooms://create?playhouse=${playhouse}`);
  const create = page.getByRole('dialog', { name: 'Create playroom', exact: true });
  await expect(create).toBeVisible();
  await page.getByRole('button', { name: 'Close create playroom', exact: true }).click();
  await expect(create).toBeHidden();
  await sendLink(`acloud-playrooms://create?playhouse=${playhouse}`);
  await expect(create).toBeVisible();
  await page.getByRole('button', { name: 'Close create playroom', exact: true }).click();
  await sendLink('acloud-playrooms://rooms/playhouse-product-dev/api-development');
  await expect(page.getByRole('alert').filter({ hasText: 'Could not open link' })).toContainText(
    'current context and organisation',
  );
  await expect(page).toHaveURL('/rooms');
});
