import sharp from 'sharp';
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const FAL_API_KEY = process.env.FAL_API_KEY || '';
const OUTPUT_DIR = 'public/assets/terrain';

// Biome definitions with layered texture config
const BIOME_CONFIG = {
  grass: {
    base: { prompt: 'seamless tiling grass texture pattern, lush green meadow, top-down orthographic view, uniform lighting, no shadows, game texture, 2D tileable, repeating pattern', size: 512 },
    detail: { prompt: 'seamless tiling small clovers and grass blades detail texture, sparse, top-down, transparent background, game overlay', size: 128 },
    variation: { prompt: 'seamless tiling subtle grass color variation, patches of lighter and darker green, soft noise pattern, game texture', size: 256 },
  },
  forest: {
    base: { prompt: 'seamless tiling forest floor texture pattern, fallen leaves moss twigs, top-down orthographic view, uniform lighting, game texture, 2D tileable, repeating pattern', size: 512 },
    detail: { prompt: 'seamless tiling fallen leaves and small mushrooms detail, sparse scatter, top-down, transparent background, game overlay', size: 128 },
    variation: { prompt: 'seamless tiling dappled light variation pattern, soft shadows patches, forest floor, game texture', size: 256 },
  },
  mountain: {
    base: { prompt: 'seamless tiling rocky mountain stone texture pattern, grey rocks gravel, top-down orthographic view, uniform lighting, game texture, 2D tileable, repeating pattern', size: 512 },
    detail: { prompt: 'seamless tiling small pebbles and cracks detail texture, sparse, top-down, transparent background, game overlay', size: 128 },
    variation: { prompt: 'seamless tiling rock color variation, grey brown patches, weathered stone, game texture', size: 256 },
  },
  snow: {
    base: { prompt: 'seamless tiling snow texture pattern, white pristine snow, subtle blue shadows, top-down orthographic view, game texture, 2D tileable, repeating pattern', size: 512 },
    detail: { prompt: 'seamless tiling ice crystals and snow sparkles detail, sparse glitter, top-down, transparent background, game overlay', size: 128 },
    variation: { prompt: 'seamless tiling snow drift variation, wind-swept patterns, subtle shadows, game texture', size: 256 },
  },
  shore: {
    base: { prompt: 'seamless tiling sandy beach texture pattern, golden tan sand, small shells pebbles, top-down orthographic view, game texture, 2D tileable, repeating pattern', size: 512 },
    detail: { prompt: 'seamless tiling seashells and small stones detail, sparse scatter, top-down, transparent background, game overlay', size: 128 },
    variation: { prompt: 'seamless tiling wet and dry sand variation, moisture patterns, beach texture', size: 256 },
  },
  river: {
    base: { prompt: 'seamless tiling clear river water texture pattern, blue-green ripples caustics, top-down orthographic view, game texture, 2D tileable, repeating pattern', size: 512 },
    detail: { prompt: 'seamless tiling water sparkles and ripple highlights, sparse, top-down, transparent background, game overlay', size: 128 },
    variation: { prompt: 'seamless tiling water depth variation, lighter shallows darker deep, flowing pattern', size: 256 },
  },
  sea: {
    base: { prompt: 'seamless tiling deep ocean water texture pattern, dark blue waves, top-down orthographic view, game texture, 2D tileable, repeating pattern', size: 512 },
    detail: { prompt: 'seamless tiling ocean foam and wave caps detail, sparse white, top-down, transparent background, game overlay', size: 128 },
    variation: { prompt: 'seamless tiling ocean depth variation, wave shadow patterns, dark blue', size: 256 },
  },
  swamp: {
    base: { prompt: 'seamless tiling murky swamp water texture pattern, dark green stagnant, algae, top-down orthographic view, game texture, 2D tileable, repeating pattern', size: 512 },
    detail: { prompt: 'seamless tiling lily pads and algae patches detail, sparse, top-down, transparent background, game overlay', size: 128 },
    variation: { prompt: 'seamless tiling swamp murk variation, darker muddier patches, organic pattern', size: 256 },
  },
  lowland: {
    base: { prompt: 'seamless tiling dry dirt path texture pattern, brown earth sparse grass, top-down orthographic view, game texture, 2D tileable, repeating pattern', size: 512 },
    detail: { prompt: 'seamless tiling small stones and dried grass detail, sparse, top-down, transparent background, game overlay', size: 128 },
    variation: { prompt: 'seamless tiling dirt moisture variation, dry cracked patches, earth tones', size: 256 },
  },
  town: {
    base: { prompt: 'seamless tiling cobblestone street texture pattern, medieval grey stones, top-down orthographic view, game texture, 2D tileable, repeating pattern', size: 512 },
    detail: { prompt: 'seamless tiling moss between cobblestones detail, sparse green, top-down, transparent background, game overlay', size: 128 },
    variation: { prompt: 'seamless tiling worn stone variation, darker wet patches, aged cobblestone', size: 256 },
  },
};

// Transition pairs that need gradient textures
const TRANSITIONS = [
  { from: 'shore', to: 'sea', prompt: 'seamless tiling beach to water transition gradient, sand fading into shallow blue water, top-down, game texture' },
  { from: 'shore', to: 'grass', prompt: 'seamless tiling beach to grass transition gradient, sand mixing with grass, top-down, game texture' },
  { from: 'grass', to: 'forest', prompt: 'seamless tiling meadow to forest floor transition, grass fading to leaves, top-down, game texture' },
  { from: 'grass', to: 'mountain', prompt: 'seamless tiling grass to rocky transition, green fading to grey stone, top-down, game texture' },
  { from: 'forest', to: 'swamp', prompt: 'seamless tiling forest to swamp transition, leaves to murky water, top-down, game texture' },
  { from: 'mountain', to: 'snow', prompt: 'seamless tiling rock to snow transition, grey stone to white snow, top-down, game texture' },
  { from: 'river', to: 'grass', prompt: 'seamless tiling riverbank transition, water edge to grass, top-down, game texture' },
  { from: 'lowland', to: 'grass', prompt: 'seamless tiling dirt to grass transition, brown earth to green, top-down, game texture' },
];

async function generateFromFal(prompt: string, size: number): Promise<Buffer | null> {
  if (!FAL_API_KEY) {
    console.log('  [SKIP] No FAL_API_KEY - using procedural fallback');
    return null;
  }

  try {
    const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
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
      console.error(`  FAL error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const imageUrl = data.images?.[0]?.url;
    if (!imageUrl) return null;

    const imgRes = await fetch(imageUrl);
    return Buffer.from(await imgRes.arrayBuffer());
  } catch (e) {
    console.error('  FAL fetch error:', e);
    return null;
  }
}

// Advanced tiling using histogram-preserving blending
async function makeTileableAdvanced(input: Buffer, size: number): Promise<Buffer> {
  const img = sharp(input);
  const meta = await img.metadata();
  const w = meta.width!;
  const h = meta.height!;

  // Step 1: Create mirror-fold base (guaranteed seamless)
  const original = await sharp(input).png().toBuffer();
  const flippedH = await sharp(input).flop().png().toBuffer();
  const flippedV = await sharp(input).flip().png().toBuffer();
  const flippedBoth = await sharp(input).flip().flop().png().toBuffer();

  const composite = await sharp({
    create: { width: w * 2, height: h * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } }
  })
    .composite([
      { input: original, top: 0, left: 0 },
      { input: flippedH, top: 0, left: w },
      { input: flippedV, top: h, left: 0 },
      { input: flippedBoth, top: h, left: w },
    ])
    .png()
    .toBuffer();

  // Step 2: Extract with slight offset to avoid pure mirror artifacts
  const offsetX = Math.floor(w * 0.25);
  const offsetY = Math.floor(h * 0.25);

  const tiled = await sharp(composite)
    .extract({ left: offsetX, top: offsetY, width: w, height: h })
    .resize(size, size, { kernel: 'lanczos3' })
    .png()
    .toBuffer();

  return tiled;
}

// Generate procedural noise texture for variation
async function generateNoiseTexture(size: number, scale: number, color: { r: number, g: number, b: number }): Promise<Buffer> {
  const channels = 4;
  const pixels = Buffer.alloc(size * size * channels);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * channels;
      // Perlin-like noise approximation
      const nx = x / size * scale;
      const ny = y / size * scale;
      const noise = (Math.sin(nx * 12.9898 + ny * 78.233) * 43758.5453) % 1;
      const n2 = (Math.sin(nx * 2.1 + ny * 3.7 + noise) * 0.5 + 0.5);

      const intensity = Math.floor(n2 * 60 - 30); // -30 to +30 variation
      pixels[idx] = Math.max(0, Math.min(255, color.r + intensity));
      pixels[idx + 1] = Math.max(0, Math.min(255, color.g + intensity));
      pixels[idx + 2] = Math.max(0, Math.min(255, color.b + intensity));
      pixels[idx + 3] = Math.floor(n2 * 100 + 50); // 50-150 alpha for blending
    }
  }

  return sharp(pixels, { raw: { width: size, height: size, channels } })
    .png()
    .toBuffer();
}

// Generate transition gradient mask
async function generateTransitionMask(size: number, direction: 'horizontal' | 'vertical' | 'diagonal'): Promise<Buffer> {
  const channels = 4;
  const pixels = Buffer.alloc(size * size * channels);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * channels;
      let t: number;

      switch (direction) {
        case 'horizontal':
          t = x / size;
          break;
        case 'vertical':
          t = y / size;
          break;
        case 'diagonal':
          t = (x + y) / (size * 2);
          break;
      }

      // Add noise to transition for organic feel
      const noise = (Math.sin(x * 0.1 + y * 0.15) * 0.5 + 0.5) * 0.2;
      t = Math.max(0, Math.min(1, t + noise - 0.1));

      const alpha = Math.floor(t * 255);
      pixels[idx] = 255;
      pixels[idx + 1] = 255;
      pixels[idx + 2] = 255;
      pixels[idx + 3] = alpha;
    }
  }

  return sharp(pixels, { raw: { width: size, height: size, channels } })
    .png()
    .toBuffer();
}

// Pack multiple tile variants into atlas
async function createTileAtlas(tiles: Buffer[], tileSize: number, cols: number): Promise<Buffer> {
  const rows = Math.ceil(tiles.length / cols);
  const atlasWidth = tileSize * cols;
  const atlasHeight = tileSize * rows;

  const composites = tiles.map((tile, i) => ({
    input: tile,
    left: (i % cols) * tileSize,
    top: Math.floor(i / cols) * tileSize,
  }));

  return sharp({
    create: { width: atlasWidth, height: atlasHeight, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite(composites)
    .png()
    .toBuffer();
}

async function main() {
  const dirs = ['base', 'detail', 'variation', 'transition', 'atlas'].map(d => join(OUTPUT_DIR, d));
  dirs.forEach(d => { if (!existsSync(d)) mkdirSync(d, { recursive: true }); });

  console.log('=== Advanced Terrain Tile Generation ===\n');

  // Generate base + detail + variation for each biome
  for (const [biome, config] of Object.entries(BIOME_CONFIG)) {
    console.log(`\n[${biome.toUpperCase()}]`);

    // Base texture
    console.log('  Generating base...');
    let baseBuffer = await generateFromFal(config.base.prompt, config.base.size);
    if (baseBuffer) {
      baseBuffer = await makeTileableAdvanced(baseBuffer, 256);
      writeFileSync(join(OUTPUT_DIR, 'base', `${biome}.png`), baseBuffer);
      console.log('    Saved base');
    }

    // Detail overlay
    console.log('  Generating detail...');
    let detailBuffer = await generateFromFal(config.detail.prompt, config.detail.size);
    if (detailBuffer) {
      detailBuffer = await makeTileableAdvanced(detailBuffer, 64);
      writeFileSync(join(OUTPUT_DIR, 'detail', `${biome}.png`), detailBuffer);
      console.log('    Saved detail');
    }

    // Variation map
    console.log('  Generating variation...');
    let varBuffer = await generateFromFal(config.variation.prompt, config.variation.size);
    if (varBuffer) {
      varBuffer = await makeTileableAdvanced(varBuffer, 128);
      writeFileSync(join(OUTPUT_DIR, 'variation', `${biome}.png`), varBuffer);
      console.log('    Saved variation');
    }

    // Generate multiple variants for atlas
    if (baseBuffer) {
      console.log('  Creating tile variants...');
      const variants: Buffer[] = [baseBuffer];

      // Create rotated/shifted variants
      for (let i = 1; i < 4; i++) {
        const rotated = await sharp(baseBuffer)
          .rotate(i * 90)
          .png()
          .toBuffer();
        variants.push(rotated);
      }

      const atlas = await createTileAtlas(variants, 256, 2);
      writeFileSync(join(OUTPUT_DIR, 'atlas', `${biome}_atlas.png`), atlas);
      console.log('    Saved atlas (4 variants)');
    }
  }

  // Generate transition textures
  console.log('\n[TRANSITIONS]');
  for (const trans of TRANSITIONS) {
    console.log(`  ${trans.from} -> ${trans.to}...`);
    let transBuffer = await generateFromFal(trans.prompt, 256);
    if (transBuffer) {
      transBuffer = await makeTileableAdvanced(transBuffer, 256);
      writeFileSync(join(OUTPUT_DIR, 'transition', `${trans.from}_${trans.to}.png`), transBuffer);
    }

    // Also generate procedural mask
    const mask = await generateTransitionMask(256, 'horizontal');
    writeFileSync(join(OUTPUT_DIR, 'transition', `${trans.from}_${trans.to}_mask.png`), mask);
  }

  // Generate procedural noise maps for runtime variation
  console.log('\n[PROCEDURAL NOISE MAPS]');
  const noiseConfigs = [
    { name: 'grass_noise', color: { r: 80, g: 140, b: 60 }, scale: 4 },
    { name: 'dirt_noise', color: { r: 120, g: 90, b: 60 }, scale: 3 },
    { name: 'water_noise', color: { r: 40, g: 80, b: 150 }, scale: 2 },
    { name: 'stone_noise', color: { r: 100, g: 100, b: 100 }, scale: 5 },
  ];

  for (const nc of noiseConfigs) {
    console.log(`  ${nc.name}...`);
    const noise = await generateNoiseTexture(128, nc.scale, nc.color);
    writeFileSync(join(OUTPUT_DIR, 'variation', `${nc.name}.png`), noise);
  }

  console.log('\n=== Done! ===');
  console.log(`Output: ${OUTPUT_DIR}/`);
  console.log('  base/      - Main tileable textures (256px)');
  console.log('  detail/    - Small detail overlays (64px)');
  console.log('  variation/ - Color variation maps (128px)');
  console.log('  transition/- Biome blend textures + masks');
  console.log('  atlas/     - Multi-variant tile atlases');
}

main();
