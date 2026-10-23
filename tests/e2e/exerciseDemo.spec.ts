// Opens an exercise from the list and checks the demonstration area (hotlinked, never stored by the app).
// Needs the test user in .env.local against the hosted project; skipped otherwise.
import { expect, test } from '@playwright/test';

const email = process.env.E2E_USER_A_EMAIL;
const password = process.env.E2E_USER_A_PASSWORD;
const configured = Boolean(
  email && password && process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY,
);

// A trace would record the typed password, so these tests never keep one.
test.use({ trace: 'off' });

test.describe('exercise demonstration', () => {
  test.skip(!configured, 'needs the hosted test user in .env.local');

  test('opening an exercise shows its details and a demonstration area', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: /Ready to lift\?|Welcome to Next Rep/ }),
    ).toBeVisible();

    await page.goto('/exercises');
    await page.getByRole('searchbox', { name: 'Search exercises' }).fill('barbell bench press');
    await page
      .getByRole('link', { name: /^Barbell Bench Press/ })
      .first()
      .click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Barbell Bench Press' }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Details' })).toContainText('Barbell');
    const demo = page.getByRole('region', { name: 'Demonstration' });
    await expect(demo).toBeVisible();
    // The animation if the media host answers, the placeholder if it does not: either way, never a broken image.
    await expect(
      demo
        .getByRole('img', { name: 'Demonstration of Barbell Bench Press' })
        .or(
          demo.getByText(/Demonstration unavailable|No demonstration|need an internet connection/),
        ),
    ).toBeVisible();
  });
});
