#!/usr/bin/env bun
/**
 * Bullet Hell Game - Asset Generator
 * Generates images for the actual game entities using FAL AI + BiRefNet
 */

import sharp from 'sharp';
import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

// Load API key from environment or .secretbashrc
const FAL_KEY = process.env.FAL_API_KEY ||
  Bun.spawnSync(['bash', '-c', 'source ~/.secretbashrc && echo $FAL_API_KEY']).stdout.toString().trim();

if (!FAL_KEY) {
  console.error('Error: FAL_API_KEY not found');
  process.exit(1);
}

const PROJECT_DIR = join(import.meta.dir, '..');
const ASSETS_DIR = join(PROJECT_DIR, 'assets/game');

interface Asset {
  name: string;
  prompt: string;
  size?: string;
  removeBg?: boolean;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateImage(prompt: string, size: string = 'square'): Promise<string | null> {
  console.log(`    Submitting generation...`);

  // Use the queue-based flux-schnell API
  const response = await fetch('https://queue.fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt,
      image_size: size,
      num_images: 1,
      enable_safety_checker: false
    })
  });

  const data = await response.json() as any;

  // Check for direct images (synchronous response)
  if (data.images?.[0]?.url) {
    return data.images[0].url;
  }

  // Check for request_id (async queue response)
  if (data.request_id) {
    // Use provided URLs or construct from request_id
    const statusUrl = data.status_url || `https://queue.fal.run/fal-ai/flux/requests/${data.request_id}/status`;
    const responseUrl = data.response_url || `https://queue.fal.run/fal-ai/flux/requests/${data.request_id}`;

    // Poll for result
    for (let i = 0; i < 60; i++) {
      await sleep(2000);
      try {
        const statusRes = await fetch(statusUrl, {
          headers: { 'Authorization': `Key ${FAL_KEY}` }
        });
        const statusData = await statusRes.json() as any;

        if (statusData.status === 'COMPLETED') {
          const resultRes = await fetch(responseUrl, {
            headers: { 'Authorization': `Key ${FAL_KEY}` }
          });
          const resultData = await resultRes.json() as any;
          if (resultData.images?.[0]?.url) {
            return resultData.images[0].url;
          }
        }
        if (statusData.status === 'FAILED') {
          console.error('Generation failed');
          return null;
        }
      } catch (e) {
        // Polling error, continue
      }
    }
  }

  console.error('No usable response:', JSON.stringify(data).slice(0, 200));
  return null;
}

async function removeBackground(imageUrl: string): Promise<string> {
  console.log(`    Removing background...`);

  const response = await fetch('https://queue.fal.run/fal-ai/birefnet', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image_url: imageUrl,
      model: 'General Use (Light)'
    })
  });

  const data = await response.json() as any;

  // Check direct result
  if (data.image?.url) {
    return data.image.url;
  }

  if (!data.request_id) {
    console.warn('BiRefNet no request_id, using original');
    return imageUrl;
  }

  // Use provided URLs or construct from request_id
  const statusUrl = data.status_url || `https://queue.fal.run/fal-ai/birefnet/requests/${data.request_id}/status`;
  const responseUrl = data.response_url || `https://queue.fal.run/fal-ai/birefnet/requests/${data.request_id}`;

  // Poll for result
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try {
      const statusRes = await fetch(statusUrl, {
        headers: { 'Authorization': `Key ${FAL_KEY}` }
      });
      const statusData = await statusRes.json() as any;

      if (statusData.status === 'COMPLETED') {
        const resultRes = await fetch(responseUrl, {
          headers: { 'Authorization': `Key ${FAL_KEY}` }
        });
        const resultData = await resultRes.json() as any;
        if (resultData.image?.url) {
          return resultData.image.url;
        }
      }
      if (statusData.status === 'FAILED') {
        console.warn('BiRefNet failed, using original');
        return imageUrl;
      }
    } catch (e) {
      // Continue polling
    }
  }

  console.warn('BiRefNet timeout, using original');
  return imageUrl;
}

async function downloadAndSave(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();

  const webpBuffer = await sharp(Buffer.from(buffer))
    .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90 })
    .toBuffer();

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, webpBuffer);
}

async function generateAsset(category: string, asset: Asset): Promise<boolean> {
  const outputPath = join(ASSETS_DIR, category, `${asset.name}.webp`);

  if (existsSync(outputPath)) {
    console.log(`  Skip: ${category}/${asset.name} (exists)`);
    return true;
  }

  console.log(`  Generating: ${category}/${asset.name}`);

  const stylePrefix = 'pixel art style, 16-bit game sprite, clean crisp pixels, centered, ';
  const styleSuffix = ', game asset, transparent background, top-down view';
  const fullPrompt = stylePrefix + asset.prompt + styleSuffix;

  try {
    const imageUrl = await generateImage(fullPrompt, asset.size || 'square');
    if (!imageUrl) {
      console.error(`  Failed: ${asset.name}`);
      return false;
    }

    let finalUrl = imageUrl;
    if (asset.removeBg !== false) {
      finalUrl = await removeBackground(imageUrl);
    }

    await downloadAndSave(finalUrl, outputPath);
    console.log(`  ✓ ${asset.name}`);
    return true;
  } catch (error) {
    console.error(`  Error: ${asset.name}:`, error);
    return false;
  }
}

// ============================================================================
// GAME-SPECIFIC ASSETS
// ============================================================================

const ENEMIES: Asset[] = [
  { name: 'swarm', prompt: 'small red aggressive creature, swarming insect monster, glowing red eyes, attack pose' },
  { name: 'shooter', prompt: 'green alien shooter enemy, ranged attacker with energy cannon, sci-fi soldier' },
  { name: 'tank', prompt: 'large blue armored tank enemy, heavy plated monster, fortress creature, massive' },
  { name: 'elite', prompt: 'golden elite warrior enemy, glowing yellow aura, powerful commander, royal armor' },
  { name: 'ghost', prompt: 'purple ghostly specter enemy, ethereal floating spirit, haunting phantom, translucent' },
  { name: 'stalker', prompt: 'orange predator enemy, sleek hunter creature, ambush predator, sharp claws' },
  { name: 'serpent', prompt: 'purple snake serpent enemy, coiled magical serpent, venomous creature' },
  { name: 'deer', prompt: 'brown noble stag creature, peaceful deer, forest animal, majestic antlers' },
  { name: 'sentry', prompt: 'gray robotic sentry, stationary guard turret, mechanical sentinel' },
  { name: 'patrol', prompt: 'dark blue patrol guard, walking sentinel, armored soldier' },
  { name: 'guard', prompt: 'heavy guard enemy, elite fortress defender, tower shield and spear' },
  { name: 'wolf', prompt: 'brown wild wolf, fierce hunting wolf, forest predator, snarling' },
  { name: 'boss-drake', prompt: 'massive red dragon boss, fire breathing drake, giant wings, terrifying' },
];

const MOUNTS: Asset[] = [
  { name: 'horse', prompt: 'brown noble horse mount, rideable steed, galloping horse, saddle' },
  { name: 'chariot', prompt: 'golden war chariot, two-wheeled battle cart, ornate vehicle' },
  { name: 'dragon', prompt: 'red flying dragon mount, fire dragon, rideable drake, majestic wings' },
];

const PLAYER: Asset[] = [
  { name: 'player-blue', prompt: 'blue armored warrior hero, fantasy knight, glowing blue armor' },
  { name: 'player-pink', prompt: 'pink magical hero, enchanted mage, glowing pink robes' },
  { name: 'player-green', prompt: 'green ranger hero, forest archer, nature warrior' },
  { name: 'player-yellow', prompt: 'yellow paladin hero, holy warrior, radiant golden armor' },
];

const NPCS: Asset[] = [
  { name: 'trader', prompt: 'friendly merchant trader, traveling salesman with pack, shopkeeper' },
  { name: 'town', prompt: 'medieval town building, fantasy citadel, castle marketplace' },
];

const PROJECTILES: Asset[] = [
  { name: 'bullet-physical', prompt: 'white energy projectile, glowing bullet, magic bolt' },
  { name: 'bullet-fire', prompt: 'red fire projectile, flaming bullet, fireball' },
  { name: 'bullet-ice', prompt: 'cyan ice projectile, frozen bullet, ice shard' },
  { name: 'bullet-magic', prompt: 'purple magic projectile, arcane missile, spell bolt' },
  { name: 'bullet-lightning', prompt: 'yellow lightning projectile, electric bolt, thunder spark' },
  { name: 'bullet-poison', prompt: 'purple poison projectile, toxic glob, venom bolt' },
];

const ITEMS: Asset[] = [
  { name: 'coin', prompt: 'golden coin, shiny gold currency, treasure coin' },
  { name: 'health-potion', prompt: 'red health potion, healing elixir, HP restore' },
  { name: 'mana-potion', prompt: 'blue mana potion, magic elixir, MP restore' },
];

const EFFECTS: Asset[] = [
  { name: 'explosion', prompt: 'fiery explosion effect, blast burst, impact particles' },
  { name: 'heal', prompt: 'green healing effect, restoration sparkles, cure aura' },
  { name: 'nova', prompt: 'cyan magical nova, expanding ring burst, spell wave' },
];

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('Bullet Hell - Game Asset Generator');
  console.log(`Output: ${ASSETS_DIR}\n`);

  const categories: Record<string, Asset[]> = {
    enemies: ENEMIES,
    mounts: MOUNTS,
    players: PLAYER,
    npcs: NPCS,
    projectiles: PROJECTILES,
    items: ITEMS,
    effects: EFFECTS,
  };

  const specific = process.argv[2];

  if (specific && categories[specific]) {
    console.log(`=== Generating ${specific} ===`);
    for (const asset of categories[specific]) {
      await generateAsset(specific, asset);
    }
  } else {
    for (const [category, assets] of Object.entries(categories)) {
      console.log(`\n=== Generating ${category} ===`);
      for (const asset of assets) {
        await generateAsset(category, asset);
      }
    }
  }

  console.log('\n✓ Asset generation complete!');
}

main().catch(console.error);
