/**
 * E2E smoke test — boots the production build via `vite preview` and
 * checks that:
 *  - the app renders,
 *  - the sidebar is visible,
 *  - clicking the Hooks nav lands on the playground,
 *  - the i18n language switch swaps the title.
 *
 * The dev server is started by Playwright's `webServer` config in
 * `playwright.config.ts`, so this file only needs to drive the page.
 */
import { expect, test } from '@playwright/test';

test('sidebar renders and the language switch updates the title', async ({ page }) => {
  await page.goto('/');
  // Title bar shows "React Learning" by default in English.
  await expect(page.locator('aside')).toBeVisible();
  await expect(page.getByRole('heading', { name: /React Learning/i })).toBeVisible();

  // Open the i18n page.
  await page.getByRole('link', { name: /i18n/i }).first().click();
  await expect(page).toHaveURL(/\/i18n$/);

  // Switch to Chinese and assert the new title.
  await page.getByRole('button', { name: /中文/ }).click();
  await expect(page.getByRole('heading', { name: /React 学习/ })).toBeVisible();

  // The Counter card on the Hooks page should accept clicks.
  await page.getByRole('link', { name: /hooks/i }).first().click();
  await page.getByRole('button', { name: /^\+1$/ }).click();
  await page.getByRole('button', { name: /^\+1$/ }).click();
  await expect(page.getByText(/count\s*=\s*2/)).toBeVisible();
});
