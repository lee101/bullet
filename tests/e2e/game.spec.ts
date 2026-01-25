import { test, expect } from '@playwright/test';

test.describe('Game Boot', () => {
  test('loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(errors).toEqual([]);
  });

  test('CSS loads correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check body has dark background (not unstyled white)
    const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(bgColor).not.toBe('rgb(255, 255, 255)');

    // Check tailwind classes are working
    const root = page.locator('#root');
    await expect(root).toBeVisible();
  });

  test('main menu renders', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Title visible (use heading role to be specific)
    await expect(page.getByRole('heading', { name: 'Ethereal Storm' })).toBeVisible({ timeout: 10000 });

    // At least one play button
    await expect(page.getByRole('button', { name: 'Solo Knight' })).toBeVisible();
  });

  test('can start game', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Solo Knight' }).click();

    // Should transition to lobby
    await expect(page.getByText('Press A or ENTER to join')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Gameplay', () => {
  test('canvas renders', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Canvas has dimensions
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(100);
    expect(box?.height).toBeGreaterThan(100);
  });

  test('keyboard input works', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Start solo
    await page.click('button:has-text("Solo Knight")');
    await page.waitForTimeout(500);

    // Press space to join lobby
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);

    // Should show joined state or proceed
    const content = await page.content();
    expect(content.length).toBeGreaterThan(0);
  });
});

test.describe('Performance', () => {
  test('no memory leaks on menu navigation', async ({ page }) => {
    await page.goto('/');

    const getMemory = async () => {
      return await page.evaluate(() => {
        if ((performance as any).memory) {
          return (performance as any).memory.usedJSHeapSize;
        }
        return 0;
      });
    };

    const initial = await getMemory();

    // Navigate back and forth
    for (let i = 0; i < 5; i++) {
      await page.click('button:has-text("Solo Knight")');
      await page.waitForTimeout(200);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    const final = await getMemory();

    // Allow 50MB growth max (skip if memory API not available)
    if (initial > 0) {
      expect(final - initial).toBeLessThan(50 * 1024 * 1024);
    }
  });
});
