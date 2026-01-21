#!/usr/bin/env bun
/**
 * Character Asset Generation using FAL AI (Flux Schnell)
 * Generates game character sprites, portraits, and icons
 */

import { fal } from '@fal-ai/client';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = 'public/assets/characters';

interface CharacterAsset {
  name: string;
  prompt: string;
  type: 'portrait' | 'sprite' | 'icon';
  size: { width: number; height: number };
}

const CHARACTER_ASSETS: CharacterAsset[] = [
  // SAMURAI
  { name: 'samurai_portrait', type: 'portrait', size: { width: 512, height: 512 },
    prompt: 'portrait of a noble samurai warrior, stoic expression, traditional topknot hair, ornate red and gold armor with dragon motifs, cherry blossoms floating, dramatic lighting, high detail anime art style, game character art, dark background' },
  { name: 'samurai_sprite', type: 'sprite', size: { width: 128, height: 128 },
    prompt: 'pixel art samurai warrior sprite, red armor, katana drawn, action pose, top-down RPG style, clean lines, transparent background, game asset' },
  { name: 'samurai_icon', type: 'icon', size: { width: 64, height: 64 },
    prompt: 'samurai helmet icon, menpo mask, red and gold, minimalist game UI icon, clean edges, dark background' },

  // WITCH
  { name: 'witch_portrait', type: 'portrait', size: { width: 512, height: 512 },
    prompt: 'portrait of a powerful witch, glowing purple eyes, flowing dark hair with magical sparks, ornate black and purple robes, arcane symbols floating around, mysterious smile, high detail anime art style, game character art, dark mystical background' },
  { name: 'witch_sprite', type: 'sprite', size: { width: 128, height: 128 },
    prompt: 'pixel art witch sprite, purple robes, holding glowing staff, magical aura, top-down RPG style, clean lines, transparent background, game asset' },
  { name: 'witch_icon', type: 'icon', size: { width: 64, height: 64 },
    prompt: 'witch hat icon with magical stars, purple and black, minimalist game UI icon, clean edges, dark background' },

  // KNIGHT
  { name: 'knight_portrait', type: 'portrait', size: { width: 512, height: 512 },
    prompt: 'portrait of a noble knight, determined gaze, silver plate armor with blue cape, glowing holy sword, divine light rays, battle-worn but heroic, high detail anime art style, game character art, dramatic lighting' },
  { name: 'knight_sprite', type: 'sprite', size: { width: 128, height: 128 },
    prompt: 'pixel art knight sprite, silver armor, blue cape, sword and shield, heroic stance, top-down RPG style, clean lines, transparent background, game asset' },
  { name: 'knight_icon', type: 'icon', size: { width: 64, height: 64 },
    prompt: 'knight helmet icon with blue plume, silver metal, minimalist game UI icon, clean edges, dark background' },

  // NECROMANCER
  { name: 'necro_portrait', type: 'portrait', size: { width: 512, height: 512 },
    prompt: 'portrait of a dark necromancer, pale skin, glowing green eyes, skull staff, tattered black robes with bone decorations, green soul flames floating, sinister expression, high detail anime art style, game character art, dark foggy background' },
  { name: 'necro_sprite', type: 'sprite', size: { width: 128, height: 128 },
    prompt: 'pixel art necromancer sprite, black robes, skull staff, green magic glow, floating slightly, top-down RPG style, clean lines, transparent background, game asset' },
  { name: 'necro_icon', type: 'icon', size: { width: 64, height: 64 },
    prompt: 'skull icon with glowing green eyes, dark magic aura, minimalist game UI icon, clean edges, dark background' },

  // BERSERKER
  { name: 'berserker_portrait', type: 'portrait', size: { width: 512, height: 512 },
    prompt: 'portrait of a fierce berserker warrior, wild red hair, battle scars, fur armor with iron spikes, massive battle axe, rage in eyes, blood splatter effects, high detail anime art style, game character art, fiery background' },
  { name: 'berserker_sprite', type: 'sprite', size: { width: 128, height: 128 },
    prompt: 'pixel art berserker sprite, fur armor, giant axe, aggressive pose, red aura, top-down RPG style, clean lines, transparent background, game asset' },
  { name: 'berserker_icon', type: 'icon', size: { width: 64, height: 64 },
    prompt: 'crossed battle axes icon, blood red and iron, minimalist game UI icon, clean edges, dark background' },

  // ARCHER
  { name: 'archer_portrait', type: 'portrait', size: { width: 512, height: 512 },
    prompt: 'portrait of an elven archer, sharp features, long silver hair, green forest cloak, ornate wooden bow with glowing runes, focused eyes, leaves floating, high detail anime art style, game character art, forest background' },
  { name: 'archer_sprite', type: 'sprite', size: { width: 128, height: 128 },
    prompt: 'pixel art elf archer sprite, green cloak, wooden bow drawn, nimble pose, top-down RPG style, clean lines, transparent background, game asset' },
  { name: 'archer_icon', type: 'icon', size: { width: 64, height: 64 },
    prompt: 'bow and arrow icon, wooden with green glow, minimalist game UI icon, clean edges, dark background' },

  // PYROMANCER
  { name: 'pyro_portrait', type: 'portrait', size: { width: 512, height: 512 },
    prompt: 'portrait of a pyromancer fire mage, fiery orange hair that looks like flames, ember eyes, red and orange robes with flame patterns, fire swirling around hands, confident smirk, high detail anime art style, game character art, inferno background' },
  { name: 'pyro_sprite', type: 'sprite', size: { width: 128, height: 128 },
    prompt: 'pixel art pyromancer sprite, flame robes, fire in hands, casting pose, orange glow, top-down RPG style, clean lines, transparent background, game asset' },
  { name: 'pyro_icon', type: 'icon', size: { width: 64, height: 64 },
    prompt: 'flame icon, orange and red fire, minimalist game UI icon, clean edges, dark background' },

  // FROST MAGE
  { name: 'frost_portrait', type: 'portrait', size: { width: 512, height: 512 },
    prompt: 'portrait of an ice mage, pale blue skin, white frost hair, icy blue eyes, crystalline robes with snowflake patterns, ice crystals floating, serene cold expression, high detail anime art style, game character art, blizzard background' },
  { name: 'frost_sprite', type: 'sprite', size: { width: 128, height: 128 },
    prompt: 'pixel art ice mage sprite, crystal robes, ice shard in hand, elegant pose, blue glow, top-down RPG style, clean lines, transparent background, game asset' },
  { name: 'frost_icon', type: 'icon', size: { width: 64, height: 64 },
    prompt: 'snowflake crystal icon, ice blue and white, minimalist game UI icon, clean edges, dark background' },

  // NINJA
  { name: 'ninja_portrait', type: 'portrait', size: { width: 512, height: 512 },
    prompt: 'portrait of a shadow ninja, masked face with only piercing eyes visible, black and dark purple outfit, kunai in hand, smoke and shadows swirling, mysterious and deadly, high detail anime art style, game character art, moonlit night background' },
  { name: 'ninja_sprite', type: 'sprite', size: { width: 128, height: 128 },
    prompt: 'pixel art ninja sprite, black outfit, kunai drawn, stealth pose, shadow wisps, top-down RPG style, clean lines, transparent background, game asset' },
  { name: 'ninja_icon', type: 'icon', size: { width: 64, height: 64 },
    prompt: 'shuriken throwing star icon, dark metal, minimalist game UI icon, clean edges, dark background' },

  // PALADIN
  { name: 'paladin_portrait', type: 'portrait', size: { width: 512, height: 512 },
    prompt: 'portrait of a holy paladin, radiant golden armor, white cape with holy symbol, glowing hammer weapon, divine halo light, righteous determined expression, high detail anime art style, game character art, heavenly light background' },
  { name: 'paladin_sprite', type: 'sprite', size: { width: 128, height: 128 },
    prompt: 'pixel art paladin sprite, golden armor, holy hammer raised, divine glow, top-down RPG style, clean lines, transparent background, game asset' },
  { name: 'paladin_icon', type: 'icon', size: { width: 64, height: 64 },
    prompt: 'holy hammer icon with divine glow, gold and white, minimalist game UI icon, clean edges, dark background' },
];

async function generateImage(asset: CharacterAsset): Promise<string | null> {
  try {
    console.log(`  Generating: ${asset.name}...`);

    const result = await fal.subscribe('fal-ai/flux/schnell', {
      input: {
        prompt: asset.prompt,
        image_size: asset.size,
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: false
      }
    }) as { images: { url: string }[] };

    if (result.images && result.images[0]) {
      return result.images[0].url;
    }
    return null;
  } catch (error) {
    console.error(`  Error generating ${asset.name}:`, error);
    return null;
  }
}

async function downloadAndConvertToWebP(url: string, filepath: string): Promise<void> {
  const sharp = (await import('sharp')).default;
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();

  // Convert to WebP q85
  const webpPath = filepath.replace('.png', '.webp');
  await sharp(Buffer.from(buffer))
    .webp({ quality: 85 })
    .toFile(webpPath);
}

async function main() {
  console.log('=== Character Asset Generation (FAL Flux Schnell) ===\n');

  if (!process.env.FAL_KEY) {
    console.error('Error: FAL_KEY environment variable not set');
    console.log('Set it with: export FAL_KEY=your_key_here');
    process.exit(1);
  }

  // Create output directories
  const dirs = ['portraits', 'sprites', 'icons'];
  for (const dir of dirs) {
    const path = join(OUTPUT_DIR, dir);
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
  }

  console.log(`Output: ${OUTPUT_DIR}/\n`);

  let success = 0;
  let failed = 0;

  for (const asset of CHARACTER_ASSETS) {
    const url = await generateImage(asset);

    if (url) {
      const subdir = asset.type === 'portrait' ? 'portraits' : asset.type === 'sprite' ? 'sprites' : 'icons';
      const filepath = join(OUTPUT_DIR, subdir, `${asset.name}.png`);
      await downloadAndConvertToWebP(url, filepath);
      console.log(`    Saved: ${filepath.replace('.png', '.webp')}`);
      success++;
    } else {
      failed++;
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n=== Generation Complete ===');
  console.log(`Success: ${success}/${CHARACTER_ASSETS.length}`);
  if (failed > 0) console.log(`Failed: ${failed}`);
}

main().catch(console.error);
