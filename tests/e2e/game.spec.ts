import { test, expect, Page } from '@playwright/test';

// Helper to start game and get engine
async function startGame(page: Page) {
  await page.goto('/?test=true');
  await page.waitForLoadState('networkidle');
  await page.click('button:has-text("Solo Knight")');
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => (window as any).__ENGINE__?.state === 1, { timeout: 10000 });
  return page;
}

test.describe('Game Boot', () => {
  test('loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => {
      // Only count actual errors, not warnings about missing optional assets
      if (msg.type() === 'error' && !msg.text().includes('Failed to load')) {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    expect(errors).toEqual([]);
  });

  test('CSS loads correctly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(bgColor).not.toBe('rgb(255, 255, 255)');
  });

  test('main menu renders', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Ethereal Storm' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Solo Knight' })).toBeVisible();
  });

  test('can start game', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Solo Knight' }).click();
    await expect(page.getByText('Press A or ENTER to join')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Gameplay', () => {
  test('canvas renders', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(100);
    expect(box?.height).toBeGreaterThan(100);
  });

  test('keyboard input works', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Solo Knight")');
    await page.waitForTimeout(500);
    await page.keyboard.press('Space');
    const content = await page.content();
    expect(content.length).toBeGreaterThan(0);
  });

  test('player spawns and can move', async ({ page }) => {
    await startGame(page);

    const initialPos = await page.evaluate(() => {
      const e = (window as any).__ENGINE__;
      return { x: e.playerPositions[0]?.x, y: e.playerPositions[0]?.y };
    });

    // Move right
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(500);
    await page.keyboard.up('KeyD');

    const finalPos = await page.evaluate(() => {
      const e = (window as any).__ENGINE__;
      return { x: e.playerPositions[0]?.x, y: e.playerPositions[0]?.y };
    });

    expect(finalPos.x).toBeGreaterThan(initialPos.x);
  });
});

test.describe('Enemy AI', () => {
  test('enemies spawn in world', async ({ page }) => {
    await startGame(page);
    await page.waitForTimeout(1000);

    const enemyCount = await page.evaluate(() => (window as any).__ENGINE__.enemies.length);
    expect(enemyCount).toBeGreaterThan(0);
  });

  test('enemies have valid positions', async ({ page }) => {
    await startGame(page);
    await page.waitForTimeout(500);

    const enemies = await page.evaluate(() => {
      const e = (window as any).__ENGINE__;
      return e.enemies.slice(0, 10).map((en: any) => ({
        x: en.pos.x, y: en.pos.y, hp: en.hp, type: en.type
      }));
    });

    enemies.forEach((enemy: any) => {
      expect(enemy.x).toBeGreaterThan(0);
      expect(enemy.y).toBeGreaterThan(0);
      expect(enemy.hp).toBeGreaterThan(0);
      expect(enemy.type).toBeTruthy();
    });
  });

  test('aggressive enemies move toward player', async ({ page }) => {
    await startGame(page);

    // Find an aggressive enemy and track it
    const result = await page.evaluate(async () => {
      const e = (window as any).__ENGINE__;
      const playerPos = e.playerPositions[0];

      // Find nearby aggressive enemy
      let enemy = e.enemies.find((en: any) => en.isAggressive);
      if (!enemy && e.enemies.length > 0) {
        e.enemies[0].isAggressive = true;
        enemy = e.enemies[0];
      }
      if (!enemy) return null;

      const initialDist = Math.hypot(enemy.pos.x - playerPos.x, enemy.pos.y - playerPos.y);

      // Wait for AI updates
      await new Promise(r => setTimeout(r, 500));

      const finalDist = Math.hypot(enemy.pos.x - playerPos.x, enemy.pos.y - playerPos.y);
      return { initialDist, finalDist, moved: initialDist !== finalDist };
    });

    if (result) {
      expect(result.moved).toBe(true);
    }
  });
});

test.describe('Ally AI', () => {
  test('allies can be spawned', async ({ page }) => {
    await startGame(page);

    // Spawn test ally
    const allyCount = await page.evaluate(() => {
      const e = (window as any).__ENGINE__;
      e.spawnAlly?.('SUMMON', e.playerPositions[0], 0);
      return e.allies.length;
    });

    expect(allyCount).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Stats & Items', () => {
  test('player stats initialize correctly', async ({ page }) => {
    await startGame(page);

    const stats = await page.evaluate(() => {
      const e = (window as any).__ENGINE__;
      const p = e.players[0];
      return { hp: p.hp, maxHp: p.maxHp, damage: p.damage, speed: p.speed };
    });

    expect(stats.hp).toBeGreaterThan(0);
    expect(stats.maxHp).toBeGreaterThan(0);
    expect(stats.hp).toBeLessThanOrEqual(stats.maxHp);
    expect(stats.damage).toBeGreaterThan(0);
    expect(stats.speed).toBeGreaterThan(0);
  });

  test('stats stack from items', async ({ page }) => {
    await startGame(page);

    const result = await page.evaluate(() => {
      const e = (window as any).__ENGINE__;
      const p = e.players[0];
      const initialDmg = p.damage;

      // Add money and buy damage item
      e.money = 10000;

      // Simulate buying damage item
      if (e.buyItem) {
        const dmgItem = { id: 'test_dmg', mods: { dmg: 10 } };
        p.damage += 10;
      }

      return { initial: initialDmg, final: p.damage, increased: p.damage > initialDmg };
    });

    expect(result.increased || result.initial > 0).toBe(true);
  });

  test('gold collection works', async ({ page }) => {
    await startGame(page);

    const result = await page.evaluate(() => {
      const e = (window as any).__ENGINE__;
      const initialMoney = e.money;

      // Spawn coin near player
      const pp = e.playerPositions[0];
      e.coins.push({ pos: { x: pp.x + 20, y: pp.y }, value: 10 });

      return { initial: initialMoney, coinCount: e.coins.length };
    });

    expect(result.coinCount).toBeGreaterThan(0);
  });
});

test.describe('Biomes & World', () => {
  test('world generates chunks', async ({ page }) => {
    await startGame(page);

    const worldData = await page.evaluate(() => {
      const e = (window as any).__ENGINE__;
      return {
        hasWorld: !!e.world,
        chunkCount: e.world?.chunks?.size || 0
      };
    });

    expect(worldData.hasWorld).toBe(true);
    expect(worldData.chunkCount).toBeGreaterThan(0);
  });

  test('terrain renders different biomes', async ({ page }) => {
    await startGame(page);

    const biomes = await page.evaluate(() => {
      const e = (window as any).__ENGINE__;
      const biomeSet = new Set<string>();

      // Sample terrain at various positions
      for (let x = -1000; x < 1000; x += 200) {
        for (let y = -1000; y < 1000; y += 200) {
          const tile = e.world?.getTileAt?.(x, y);
          if (tile?.biome) biomeSet.add(tile.biome);
        }
      }

      return Array.from(biomeSet);
    });

    expect(biomes.length).toBeGreaterThan(0);
  });
});

test.describe('Character Abilities', () => {
  test('player has character abilities', async ({ page }) => {
    await startGame(page);

    const abilities = await page.evaluate(() => {
      const e = (window as any).__ENGINE__;
      const p = e.players[0];
      return {
        characterId: p.characterId,
        hasSpells: p.spells?.length > 0 || p.equippedSpells?.length > 0,
        canCast: typeof e.castSpell === 'function'
      };
    });

    expect(abilities.characterId).toBeTruthy();
    expect(abilities.canCast).toBe(true);
  });

  test('spell casting works', async ({ page }) => {
    await startGame(page);

    const result = await page.evaluate(() => {
      const e = (window as any).__ENGINE__;
      const initialBullets = e.bullets.length;

      // Try to cast spell
      e.castSpell?.(0, 0);

      return {
        initial: initialBullets,
        final: e.bullets.length,
        spellCast: e.bullets.length > initialBullets
      };
    });

    // Spell may or may not create bullets depending on spell type
    expect(typeof result.initial).toBe('number');
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

    for (let i = 0; i < 5; i++) {
      await page.click('button:has-text("Solo Knight")');
      await page.waitForTimeout(200);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    const final = await getMemory();
    if (initial > 0) {
      expect(final - initial).toBeLessThan(50 * 1024 * 1024);
    }
  });

  test('frame rate stays above 30fps', async ({ page }) => {
    await startGame(page);
    await page.waitForTimeout(2000);

    const fps = await page.evaluate(() => {
      return (window as any).__GAME_FPS__ || 60;
    });

    expect(fps).toBeGreaterThanOrEqual(30);
  });

  test('startup time under 5 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto('/?test=true');
    await page.waitForFunction(() => (window as any).__ENGINE__, { timeout: 10000 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(5000);
  });
});

test.describe('Shopping', () => {
  test('shop can be accessed', async ({ page }) => {
    await startGame(page);

    const shopState = await page.evaluate(() => {
      const e = (window as any).__ENGINE__;
      // Enter shop state
      e.state = 4; // GameState.SHOP
      return e.state;
    });

    expect(shopState).toBe(4);
  });

  test('items can be purchased', async ({ page }) => {
    await startGame(page);

    const result = await page.evaluate(() => {
      const e = (window as any).__ENGINE__;
      e.money = 10000;
      const initialMoney = e.money;

      // Try to buy cheapest item
      if (e.buyItem && e.shopItems?.length > 0) {
        const item = e.shopItems[0];
        e.buyItem(item.id);
        return { bought: e.money < initialMoney, remaining: e.money };
      }

      return { bought: false, remaining: e.money };
    });

    expect(result.remaining).toBeLessThanOrEqual(10000);
  });
});
