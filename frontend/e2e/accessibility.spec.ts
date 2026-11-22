import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  test.describe(`${theme} accessibility`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((lastTheme) => {
        localStorage.setItem('acloud-playroom-gui-dummy-cache', JSON.stringify({ lastTheme }));
      }, theme);
    });

    for (const route of [
      '/rooms',
      '/rooms/api-development',
      '/playhouse',
      '/defaults',
      '/settings',
      '/settings/health',
      '/setup',
    ]) {
      test(`checks ${route} with axe`, async ({ page }) => {
        await page.goto(route);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(page.getByRole('main')).toHaveAttribute('aria-busy', 'false');
        // Axe must not measure colours mid-animation (a fading drawer blends them).
        await page.waitForFunction(() =>
          document
            .getAnimations()
            .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
            .every((animation) => animation.playState !== 'running'),
        );
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(results.violations).toEqual([]);
      });
    }

    test('checks the create form and its stable image name', async ({ page }) => {
      await page.goto('/rooms');
      await page.getByRole('button', { name: /Create Playroom$/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Create playroom', exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('#create-image')).toHaveAccessibleName('Image');
      // Axe must not measure colours mid-animation (a fading drawer blends them).
      await page.waitForFunction(() =>
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .every((animation) => animation.playState !== 'running'),
      );
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });

    test('names card actions and announces a reported status change', async ({ page }) => {
      await page.goto('/rooms');
      const card = page.getByRole('link', { name: 'Open playroom api-development', exact: true });
      await expect(
        card.getByRole('button', { name: 'Connect to playroom api-development', exact: true }),
      ).toBeVisible();
      await card
        .getByRole('button', { name: 'Stop playroom api-development', exact: true })
        .click();
      await expect(page.locator('[aria-live="polite"][aria-atomic="true"]')).toHaveText(
        'api-development is stopped',
      );
    });

    test('focuses the destination heading and exposes tooltips on focus', async ({ page }) => {
      await page.goto('/rooms');
      await page
        .getByRole('link', { name: 'Open playroom api-development', exact: true })
        .locator('.card-name')
        .click();
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
      await page.goto('/rooms');
      const create = page.getByRole('button', { name: /Create Playroom$/ });
      await expect(create).toBeEnabled();
      await create.focus();
      await expect(page.getByRole('tooltip')).toHaveText('Create a playroom (c)');
    });
  });
}
