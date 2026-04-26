const { test, expect } = require('@playwright/test');

test.use({
  viewport: { width: 430, height: 932 }
});

async function openFreshApp(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: 'SocialEra Home' })).toBeVisible();
}

test.describe('public app smoke', () => {
  test('loads the shell and public home surface', async ({ page }) => {
    await openFreshApp(page);

    await expect(page.getByRole('button', { name: 'Home' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Shop' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Videos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Composer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Usapp Chats' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Spotlight' })).toBeVisible();
  });

  test('navigates public shop, videos, and search surfaces', async ({ page }) => {
    await openFreshApp(page);

    await page.getByRole('button', { name: 'Shop' }).click();
    await expect(page.getByRole('heading', { name: 'Shop from the floating bottom dock' })).toBeVisible();

    await page.getByRole('button', { name: 'Videos' }).click();
    await expect(page.getByRole('heading', { name: 'Motion-first SocialEra' })).toBeVisible();

    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('heading', { name: 'Search members, products, and posts' })).toBeVisible();

    await page.getByRole('button', { name: 'Home' }).click();
    await expect(page.getByRole('heading', { name: 'Spotlight' })).toBeVisible();
  });

  test('redirects protected surfaces to auth when signed out', async ({ page }) => {
    await openFreshApp(page);

    await page.getByRole('button', { name: 'Composer' }).click();
    await expect(page.getByRole('heading', { name: 'Log into your SocialEra account' })).toBeVisible();
    await expect(page.getByText('The app unlocks right after you sign in. The Shop can still be browsed in guest mode.')).toBeVisible();

    await page.getByRole('button', { name: 'Usapp Chats' }).click();
    await expect(page.getByRole('heading', { name: 'Log into your SocialEra account' })).toBeVisible();

    await page.getByRole('button', { name: 'Open profile' }).click();
    await expect(page.getByRole('heading', { name: 'Log into your SocialEra account' })).toBeVisible();
  });
});
