// Sign-in journey against the hosted test project. Needs the test user in .env.local; skipped otherwise.
import { expect, test } from '@playwright/test';

const email = process.env.E2E_USER_A_EMAIL;
const password = process.env.E2E_USER_A_PASSWORD;
const configured = Boolean(
  email && password && process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY,
);

// A trace would record the typed password, so these tests never keep one.
test.use({ trace: 'off' });

test.describe('sign in', () => {
  test.skip(!configured, 'needs the hosted test user in .env.local');

  test('signs in, stays signed in after a reload, and signs out', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: /Ready to lift\?|Welcome to Next Rep/ }),
    ).toBeVisible();

    await page.goto('/settings');
    await expect(page.getByText(email!.toLowerCase())).toBeVisible();

    await page.reload();
    await expect(page.getByText(email!.toLowerCase())).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('shows a friendly message for a wrong password', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(`${password!}-wrong`);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Wrong email or password.');
  });
});
