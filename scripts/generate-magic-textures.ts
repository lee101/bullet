#!/usr/bin/env bun
/**
 * Magic Wheel Art Asset Generator
 * Uses FAL AI for element orbs, projectiles, and effects
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const FAL_KEY = process.env.FAL_API_KEY ||
  Bun.spawnSync(['bash', '-c', 'source ~/.secretbashrc && echo $FAL_API_KEY']).stdout.toString().trim();

if (!FAL_KEY) {
  console.error('FAL_API_KEY not found');
  process.exit(1);
}

const OUTPUT_DIR = 'public/assets/magic';

interface MagicAsset {
  name: string;
  prompt: string;
  size: number;
}

const MAGIC_ASSETS: MagicAsset[] = [
  // Element orbs (for floating above player and wheel UI) - high quality game art
  { name: 'orb_fire', prompt: 'perfect circular magical fire orb, intense orange flames with red core swirling inside translucent glass sphere, volumetric lighting, particle effects, high quality 2D game sprite, centered composition, pure black background, no shadows, sharp edges', size: 128 },
  { name: 'orb_ice', prompt: 'perfect circular magical ice orb, cyan blue frozen crystal core with white frost particles swirling inside glass sphere, cold mist effect, high quality 2D game sprite, centered composition, pure black background, no shadows, sharp edges', size: 128 },
  { name: 'orb_lightning', prompt: 'perfect circular magical lightning orb, bright yellow electric bolts crackling inside glass sphere with white sparks, energy arcs, high quality 2D game sprite, centered composition, pure black background, no shadows, sharp edges', size: 128 },
  { name: 'orb_earth', prompt: 'perfect circular magical earth orb, brown stone fragments and amber crystals floating inside glass sphere, dust particles, high quality 2D game sprite, centered composition, pure black background, no shadows, sharp edges', size: 128 },
  { name: 'orb_black', prompt: 'perfect circular magical void orb, dark purple black swirling vortex inside glass sphere with violet edges, cosmic darkness, high quality 2D game sprite, centered composition, pure black background, no shadows, sharp edges', size: 128 },
  { name: 'orb_cure', prompt: 'perfect circular magical healing orb, bright green white holy light rays inside glass sphere with golden sparkles, divine glow, high quality 2D game sprite, centered composition, pure black background, no shadows, sharp edges', size: 128 },
  { name: 'orb_blood', prompt: 'perfect circular magical blood orb, deep crimson red swirling liquid inside glass sphere with dark veins, sinister glow, high quality 2D game sprite, centered composition, pure black background, no shadows, sharp edges', size: 128 },
  { name: 'orb_lumin', prompt: 'perfect circular magical light orb, pure white golden radiant sun energy inside glass sphere with holy rays, divine brilliance, high quality 2D game sprite, centered composition, pure black background, no shadows, sharp edges', size: 128 },

  // Magic projectiles (for wheel casting) - dynamic motion effects
  { name: 'proj_fire', prompt: 'magical fire projectile shooting right, flaming comet with orange red flame trail streaking behind, motion blur, intense glow, 2D game VFX sprite, horizontal orientation, black background', size: 128 },
  { name: 'proj_ice', prompt: 'magical ice projectile shooting right, frozen crystal shard with cyan blue frost trail streaking behind, cold mist, 2D game VFX sprite, horizontal orientation, black background', size: 128 },
  { name: 'proj_lightning', prompt: 'magical lightning projectile shooting right, electric yellow bolt with white spark trail streaking behind, energy crackling, 2D game VFX sprite, horizontal orientation, black background', size: 128 },
  { name: 'proj_earth', prompt: 'magical earth projectile shooting right, stone boulder with brown debris trail streaking behind, dust particles, 2D game VFX sprite, horizontal orientation, black background', size: 128 },
  { name: 'proj_black', prompt: 'magical void projectile shooting right, dark purple orb with black shadow trail streaking behind, void tendrils, 2D game VFX sprite, horizontal orientation, black background', size: 128 },
  { name: 'proj_cure', prompt: 'magical healing projectile shooting right, green white orb with golden sparkle trail streaking behind, holy light, 2D game VFX sprite, horizontal orientation, black background', size: 128 },
  { name: 'proj_blood', prompt: 'magical blood projectile shooting right, crimson sphere with dark red blood trail streaking behind, sinister glow, 2D game VFX sprite, horizontal orientation, black background', size: 128 },
  { name: 'proj_lumin', prompt: 'magical light projectile shooting right, pure white orb with golden ray trail streaking behind, divine radiance, 2D game VFX sprite, horizontal orientation, black background', size: 128 },

  // Combo effects
  { name: 'combo_inferno', prompt: 'massive fire explosion spell effect, hellfire burst with flames everywhere, orange red, game magic VFX, transparent', size: 256 },
  { name: 'combo_blizzard', prompt: 'ice storm spell effect, frozen cyclone with ice shards, cyan blue white, game magic VFX, transparent', size: 256 },
  { name: 'combo_thunderstorm', prompt: 'lightning storm spell effect, multiple electric bolts raining down, yellow white, game magic VFX, transparent', size: 256 },
  { name: 'combo_earthquake', prompt: 'earthquake spell effect, ground cracking with rocks flying, brown dust, game magic VFX, transparent', size: 256 },
  { name: 'combo_void', prompt: 'void rift spell effect, dark portal with purple tendrils, black hole, game magic VFX, transparent', size: 256 },
  { name: 'combo_sanctuary', prompt: 'holy sanctuary spell effect, divine light dome with runes, white gold green, game magic VFX, transparent', size: 256 },
  { name: 'combo_blood_nova', prompt: 'blood explosion spell effect, crimson wave with dark energy, red black, game magic VFX, transparent', size: 256 },
  { name: 'combo_chaos', prompt: 'chaos magic spell effect, reality warping with multiple colors clashing, prismatic distortion, game VFX, transparent', size: 256 },

  // Area effects
  { name: 'area_fire', prompt: 'fire ground effect, burning floor with flames, top-down view, orange red, game spell effect, seamless tile', size: 256 },
  { name: 'area_ice', prompt: 'ice ground effect, frozen floor with frost patterns, top-down view, cyan blue, game spell effect, seamless tile', size: 256 },
  { name: 'area_lightning', prompt: 'electric ground effect, crackling energy floor, top-down view, yellow sparks, game spell effect, seamless tile', size: 256 },
  { name: 'area_earth', prompt: 'earth ground effect, cracked stone floor with rocks, top-down view, brown, game spell effect, seamless tile', size: 256 },
  { name: 'area_black', prompt: 'void ground effect, dark shadow pool with tendrils, top-down view, purple black, game spell effect, seamless tile', size: 256 },
  { name: 'area_cure', prompt: 'healing ground effect, glowing holy circle with runes, top-down view, green white, game spell effect, seamless tile', size: 256 },
  { name: 'area_blood', prompt: 'blood ground effect, crimson pool with veins, top-down view, dark red, game spell effect, seamless tile', size: 256 },
  { name: 'area_lumin', prompt: 'light ground effect, radiant floor with rays, top-down view, white gold, game spell effect, seamless tile', size: 256 },

  // Wall/shield effects
  { name: 'wall_fire', prompt: 'fire wall barrier, vertical flame wall, side view, orange red, game defense effect, transparent', size: 128 },
  { name: 'wall_ice', prompt: 'ice wall barrier, frozen crystal wall, side view, cyan blue, game defense effect, transparent', size: 128 },
  { name: 'wall_earth', prompt: 'earth wall barrier, stone rock wall, side view, brown grey, game defense effect, transparent', size: 128 },
  { name: 'wall_black', prompt: 'void wall barrier, dark shadow barrier, side view, purple black, game defense effect, transparent', size: 128 },

  // Tower summons
  { name: 'tower_fire', prompt: 'fire magic tower, flaming pillar with flame tip, medieval fantasy, game building sprite, transparent', size: 128 },
  { name: 'tower_ice', prompt: 'ice magic tower, frozen crystal spire, medieval fantasy, game building sprite, transparent', size: 128 },
  { name: 'tower_lightning', prompt: 'lightning magic tower, electric conductor tower with sparks, medieval fantasy, game building sprite, transparent', size: 128 },
  { name: 'tower_earth', prompt: 'earth magic tower, stone golem pillar, medieval fantasy, game building sprite, transparent', size: 128 },

  // Wheel UI elements
  { name: 'wheel_frame', prompt: 'magic wheel UI frame, octagonal arcane circle with runes, dark mystical, game UI element, transparent center', size: 256 },
  { name: 'wheel_selector', prompt: 'magic wheel selector arrow, glowing pointer indicator, golden mystical, game UI element, transparent', size: 64 },
  { name: 'wheel_center', prompt: 'magic wheel center orb, pulsing arcane core, purple mystical energy, game UI element, transparent', size: 64 },

  // Tome/scroll items
  { name: 'tome_fire', prompt: 'fire magic tome book, red leather with flame emblem, glowing, game item sprite, transparent', size: 64 },
  { name: 'tome_ice', prompt: 'ice magic tome book, blue leather with frost emblem, glowing, game item sprite, transparent', size: 64 },
  { name: 'tome_lightning', prompt: 'lightning magic tome book, yellow leather with bolt emblem, glowing, game item sprite, transparent', size: 64 },
  { name: 'tome_black', prompt: 'void magic tome book, black leather with void emblem, glowing purple, game item sprite, transparent', size: 64 },
  { name: 'scroll_combo', prompt: 'ancient magic scroll, glowing parchment with arcane symbols, game item sprite, transparent', size: 64 },
];

async function generateWithFal(prompt: string, size: number): Promise<Buffer | null> {
  try {
    const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_size: { width: size, height: size },
        num_images: 1,
        num_inference_steps: 4,
      }),
    });

    if (!res.ok) {
      console.error(`FAL error: ${res.status}`);
      return null;
    }

    const data = await res.json() as { images?: { url: string }[] };
    const url = data.images?.[0]?.url;
    if (!url) return null;

    const imgRes = await fetch(url);
    return Buffer.from(await imgRes.arrayBuffer());
  } catch (e) {
    console.error('Gen error:', e);
    return null;
  }
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`Generating ${MAGIC_ASSETS.length} magic assets...`);

  const sharp = (await import('sharp')).default;

  for (const asset of MAGIC_ASSETS) {
    const webpPath = join(OUTPUT_DIR, `${asset.name}.webp`);
    if (existsSync(webpPath)) {
      console.log(`Skip: ${asset.name} (exists)`);
      continue;
    }

    console.log(`Gen: ${asset.name}`);
    const buf = await generateWithFal(asset.prompt, asset.size);
    if (buf) {
      await sharp(buf).webp({ quality: 85 }).toFile(webpPath);
      console.log(`  OK: ${asset.name}.webp`);
    } else {
      console.log(`  FAIL: ${asset.name}`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('Done!');
}

main();
