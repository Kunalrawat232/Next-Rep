// Offline-then-sync journey against the hosted test project. Needs the test user in .env.local; skipped otherwise.
import { expect, test } from '@playwright/test';

const email = process.env.E2E_USER_A_EMAIL;
const password = process.env.E2E_USER_A_PASSWORD;
const configured = Boolean(
  email && password && process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY,
);

// A trace would record the typed password, so these tests never keep one.
test.use({ trace: 'off' });

test.describe('workout', () => {
  test.skip(!configured, 'needs the hosted test user in .env.local');

  test('logs a set online, another offline, and both reach the server', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Password').fill(password!);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: /Ready to lift\?|Welcome to Next Rep/ }),
    ).toBeVisible();

    await page.goto('/workout');
    // isVisible() does not wait, so first wait until the page shows one of the two states.
    const addGym = page.getByRole('heading', { name: /add a gym first/i });
    const start = page.getByRole('button', { name: 'Start workout' });
    await expect(addGym.or(start)).toBeVisible();
    if (await addGym.isVisible()) {
      await page.getByRole('link', { name: 'Add a gym' }).click();
      await page.getByLabel('Gym name').fill('E2E gym');
      await page.getByLabel('Barbell weight (kg)').fill('20');
      await page.getByRole('button', { name: 'Create gym' }).click();
      // The form goes to the gym list once the gym is saved; leaving earlier would cancel the save.
      await expect(page).toHaveURL(/\/gyms$/);
      await expect(page.getByText('E2E gym')).toBeVisible();
      await page.goto('/workout');
    }
    await start.click();

    await page.getByRole('link', { name: 'Choose exercise' }).click();
    await page.getByRole('searchbox', { name: 'Search exercises' }).fill('barbell bench press');
    await page
      .getByRole('button', { name: /^Barbell Bench Press/ })
      .first()
      .click();

    await page.getByRole('link', { name: 'Tap instead' }).click();
    await page.getByRole('textbox', { name: /^weight/i }).fill('60');
    await page.getByRole('button', { name: 'Log set' }).click();
    await expect(page.getByText('All synced')).toBeVisible();

    await context.setOffline(true);
    await page.getByRole('link', { name: 'Tap instead' }).click();
    await page.getByRole('textbox', { name: /^weight/i }).fill('62.5');
    await page.getByRole('button', { name: 'Log set' }).click();
    await expect(page.getByText(/you are offline/i)).toBeVisible();
    await expect(page.getByText(/1 waiting to sync/i)).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText('All synced')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'End workout' }).click();
    await page.getByRole('button', { name: 'Yes, end it' }).click();
    await expect(page.getByRole('heading', { name: 'Ready to lift?' })).toBeVisible();
  });
});
