import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const FAL_API_KEY = process.env.FAL_API_KEY || '';
const OUTPUT_DIR = './public/assets/generated';

interface TexturePrompt {
  name: string;
  prompt: string;
  size: number;
}

const TEXTURE_PROMPTS: TexturePrompt[] = [
  // Fire effects
  { name: 'fire_base', prompt: 'seamless tileable fire texture, orange flames, game asset, transparent background, 2D sprite', size: 256 },
  { name: 'fire_ember', prompt: 'seamless glowing ember particles texture, red orange sparks, game VFX, transparent background', size: 128 },
  { name: 'fire_explosion', prompt: 'explosion fire burst sprite sheet, radial flames, game effect, transparent background', size: 512 },

  // Ice effects
  { name: 'ice_crystal', prompt: 'seamless ice crystal texture, cyan blue frost, game asset, transparent edges, 2D', size: 256 },
  { name: 'ice_shard', prompt: 'ice shard particles, frozen shatter effect, blue white, game VFX sprite', size: 128 },
  { name: 'frost_aura', prompt: 'circular frost aura effect, icy mist, cyan glow, game magic effect, transparent', size: 256 },

  // Lightning
  { name: 'lightning_bolt', prompt: 'electric lightning bolt sprite, yellow white energy, game effect, transparent background', size: 256 },
  { name: 'lightning_arc', prompt: 'electric arc chain lightning, branching electricity, game VFX, transparent', size: 512 },
  { name: 'spark_burst', prompt: 'electric spark burst particles, yellow energy sparks, game effect sprite', size: 128 },

  // Magic/arcane
  { name: 'magic_rune', prompt: 'glowing magic rune circle, purple arcane symbols, game spell effect, transparent', size: 256 },
  { name: 'magic_orb', prompt: 'glowing magic orb sphere, purple pink energy, game projectile sprite, transparent', size: 128 },
  { name: 'nova_ring', prompt: 'expanding magic ring nova, purple shockwave, game AOE effect, transparent', size: 512 },

  // Poison
  { name: 'poison_cloud', prompt: 'toxic poison cloud gas, green purple mist, game effect, transparent background', size: 256 },
  { name: 'poison_drip', prompt: 'dripping poison slime drops, green toxic liquid, game VFX sprite', size: 128 },

  // Misc effects
  { name: 'heal_sparkle', prompt: 'healing magic sparkles, green white particles, game heal effect, transparent', size: 128 },
  { name: 'shield_bubble', prompt: 'magic shield barrier bubble, blue energy dome, game defense effect, transparent', size: 256 },
  { name: 'teleport_swirl', prompt: 'teleport portal swirl effect, purple vortex, game magic effect, transparent', size: 256 },
  { name: 'meteor_rock', prompt: 'flaming meteor rock, fire trail, game projectile sprite, transparent background', size: 256 },

  // City styles - varied architecture
  { name: 'city_medieval', prompt: 'medieval stone castle fortress, towers and walls, fantasy game art, top-down isometric view, detailed pixel art style', size: 512 },
  { name: 'city_desert', prompt: 'desert oasis city with sandstone domes and minarets, palm trees, golden sand, fantasy game art, top-down isometric', size: 512 },
  { name: 'city_asian', prompt: 'asian pagoda temple complex, red roofs, cherry blossoms, zen garden, fantasy game art, top-down isometric view', size: 512 },
  { name: 'city_nordic', prompt: 'viking nordic village with wooden longhouses, snowy mountains, fjord, fantasy game art, top-down isometric', size: 512 },
  { name: 'city_elven', prompt: 'elven forest city with treehouse structures, glowing mushrooms, magical vines, fantasy game art, top-down isometric', size: 512 },
  { name: 'city_dwarven', prompt: 'dwarven mountain hold, stone carved halls, forge fires, underground city entrance, fantasy game art, top-down isometric', size: 512 },

  // Campfire
  { name: 'campfire', prompt: 'cozy campfire with logs and flames, warm orange glow, fantasy game asset, top-down view, transparent background', size: 256 },
  { name: 'campfire_glow', prompt: 'circular warm light glow effect, orange yellow gradient, game lighting effect, transparent background', size: 256 },
];

async function generateTexture(prompt: TexturePrompt): Promise<Buffer | null> {
  try {
    // Using FAL Klein 4B for fast, high-quality generation
    const res = await fetch('https://fal.run/fal-ai/flux-pro/v1.1-ultra', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt.prompt,
        image_size: { width: prompt.size, height: prompt.size },
        num_images: 1,
        enable_safety_checker: false,
      }),
    });

    if (!res.ok) {
      console.error(`Failed ${prompt.name}: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const imageUrl = data.images?.[0]?.url;
    if (!imageUrl) return null;

    const imgRes = await fetch(imageUrl);
    return Buffer.from(await imgRes.arrayBuffer());
  } catch (e) {
    console.error(`Error ${prompt.name}:`, e);
    return null;
  }
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`Generating ${TEXTURE_PROMPTS.length} textures...`);

  for (const prompt of TEXTURE_PROMPTS) {
    console.log(`Generating: ${prompt.name}`);
    const buffer = await generateTexture(prompt);
    if (buffer) {
      writeFileSync(join(OUTPUT_DIR, `${prompt.name}.png`), buffer);
      console.log(`  Saved: ${prompt.name}.png`);
    }
  }

  console.log('Done!');
}

main();
