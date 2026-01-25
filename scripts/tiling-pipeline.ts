import sharp from 'sharp';
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const FAL_API_KEY = process.env.FAL_API_KEY || '';
const OUTPUT_DIR = 'public/assets/tiled';
const GEN_SIZE = 512; // generate larger, extract best subset

// Correct LoRA URL (note: /blob/ for web, /resolve/ for direct download)
const SEAMLESS_LORA = 'https://huggingface.co/gokaygokay/Flux-Seamless-Texture-LoRA/resolve/main/seamless_texture.safetensors';

interface TileConfig {
  name: string;
  prompt: string;
  flipH?: boolean; // can flip horizontal (most textures)
  flipV?: boolean; // can flip vertical (symmetric textures)
  size: number;
}

const TERRAIN_TILES: TileConfig[] = [
  { name: 'grass', prompt: 'lush green grass meadow, small clovers, tiny wildflowers, hand-painted fantasy game, top-down', flipH: true, flipV: true, size: 256 },
  { name: 'sea', prompt: 'deep blue ocean water, wave patterns, foam highlights, hand-painted fantasy game, top-down', flipH: true, flipV: false, size: 256 },
  { name: 'shore', prompt: 'golden sand beach, small shells, pebbles, hand-painted fantasy game, top-down', flipH: true, flipV: true, size: 256 },
  { name: 'forest', prompt: 'dark forest floor, fallen leaves, moss, twigs, dappled shadows, hand-painted fantasy game, top-down', flipH: true, flipV: true, size: 256 },
  { name: 'mountain', prompt: 'grey rocky mountain terrain, cracks, small pebbles, rugged stone, hand-painted fantasy game, top-down', flipH: true, flipV: true, size: 256 },
  { name: 'snow', prompt: 'pristine white snow, blue shadows, ice crystals, hand-painted fantasy game, top-down', flipH: true, flipV: true, size: 256 },
  { name: 'swamp', prompt: 'murky green swamp water, algae, lily pads, stagnant, hand-painted fantasy game, top-down', flipH: true, flipV: false, size: 256 },
  { name: 'river', prompt: 'clear shallow river water, ripples, caustics, pebble bed visible, hand-painted fantasy game, top-down', flipH: true, flipV: false, size: 256 },
  { name: 'dirt', prompt: 'brown dirt path, dried grass patches, small stones, worn trail, hand-painted fantasy game, top-down', flipH: true, flipV: true, size: 256 },
  { name: 'cobble', prompt: 'grey cobblestone street, moss between stones, medieval, hand-painted fantasy game, top-down', flipH: true, flipV: true, size: 256 },
];

// Analyze seam quality - lower is better
async function measureSeamCost(img: Buffer, w: number, h: number): Promise<number> {
  const { data, info } = await sharp(img).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let cost = 0;
  const channels = info.channels;

  // horizontal seam (left edge vs right edge)
  for (let y = 0; y < h; y++) {
    const left = y * w * channels;
    const right = (y * w + w - 1) * channels;
    for (let c = 0; c < 3; c++) {
      cost += Math.abs(data[left + c] - data[right + c]);
    }
  }

  // vertical seam (top edge vs bottom edge)
  for (let x = 0; x < w; x++) {
    const top = x * channels;
    const bottom = ((h - 1) * w + x) * channels;
    for (let c = 0; c < 3; c++) {
      cost += Math.abs(data[top + c] - data[bottom + c]);
    }
  }

  return cost / (w + h) / 3; // normalize
}

// Find best tileable subset by sliding window
async function findBestSubset(srcBuffer: Buffer, targetSize: number): Promise<Buffer> {
  const meta = await sharp(srcBuffer).metadata();
  const srcW = meta.width!;
  const srcH = meta.height!;

  if (srcW <= targetSize && srcH <= targetSize) {
    return srcBuffer;
  }

  const step = 16;
  let bestCost = Infinity;
  let bestX = 0, bestY = 0;

  for (let y = 0; y <= srcH - targetSize; y += step) {
    for (let x = 0; x <= srcW - targetSize; x += step) {
      const subset = await sharp(srcBuffer)
        .extract({ left: x, top: y, width: targetSize, height: targetSize })
        .toBuffer();
      const cost = await measureSeamCost(subset, targetSize, targetSize);
      if (cost < bestCost) {
        bestCost = cost;
        bestX = x;
        bestY = y;
      }
    }
  }

  console.log(`  best subset at (${bestX},${bestY}) cost=${bestCost.toFixed(1)}`);
  return sharp(srcBuffer)
    .extract({ left: bestX, top: bestY, width: targetSize, height: targetSize })
    .toBuffer();
}

// Mirror-fold technique for guaranteed tiling
async function mirrorFold(srcBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(srcBuffer).metadata();
  const w = meta.width!;
  const h = meta.height!;

  const original = await sharp(srcBuffer).webp().toBuffer();
  const flippedH = await sharp(srcBuffer).flop().webp().toBuffer();
  const flippedV = await sharp(srcBuffer).flip().webp().toBuffer();
  const flippedBoth = await sharp(srcBuffer).flip().flop().webp().toBuffer();

  const composite = await sharp({
    create: { width: w * 2, height: h * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 255 } }
  })
    .composite([
      { input: original, top: 0, left: 0 },
      { input: flippedH, top: 0, left: w },
      { input: flippedV, top: h, left: 0 },
      { input: flippedBoth, top: h, left: w },
    ])
    .webp()
    .toBuffer();

  return sharp(composite)
    .extract({ left: w / 2, top: h / 2, width: w, height: h })
    .toBuffer();
}

// Edge blend for smoother transitions
async function edgeBlend(srcBuffer: Buffer, blendPx: number = 16): Promise<Buffer> {
  const meta = await sharp(srcBuffer).metadata();
  const w = meta.width!;
  const h = meta.height!;
  // ensure 4 channels
  const { data, info } = await sharp(srcBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  const ch = info.channels;

  // blend left<->right edges
  for (let y = 0; y < h; y++) {
    for (let b = 0; b < blendPx; b++) {
      const alpha = b / blendPx;
      const leftIdx = (y * w + b) * ch;
      const rightIdx = (y * w + w - blendPx + b) * ch;
      for (let c = 0; c < 3; c++) {
        const avg = (data[leftIdx + c] + data[rightIdx + c]) / 2;
        out[leftIdx + c] = Math.round(data[leftIdx + c] * alpha + avg * (1 - alpha));
        out[rightIdx + c] = Math.round(data[rightIdx + c] * (1 - alpha) + avg * alpha);
      }
    }
  }

  // blend top<->bottom edges
  for (let x = 0; x < w; x++) {
    for (let b = 0; b < blendPx; b++) {
      const alpha = b / blendPx;
      const topIdx = (b * w + x) * ch;
      const botIdx = ((h - blendPx + b) * w + x) * ch;
      for (let c = 0; c < 3; c++) {
        const avg = (out[topIdx + c] + out[botIdx + c]) / 2;
        out[topIdx + c] = Math.round(out[topIdx + c] * alpha + avg * (1 - alpha));
        out[botIdx + c] = Math.round(out[botIdx + c] * (1 - alpha) + avg * alpha);
      }
    }
  }

  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).webp().toBuffer();
}

// Generate with seamless LoRA
async function generateSeamless(prompt: string, size: number): Promise<Buffer | null> {
  if (!FAL_API_KEY) {
    console.error('FAL_API_KEY not set');
    return null;
  }

  const fullPrompt = `smlstxtr, ${prompt}, seamless texture`;

  try {
    const res = await fetch('https://fal.run/fal-ai/flux-lora', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: fullPrompt,
        image_size: { width: size, height: size },
        num_images: 1,
        num_inference_steps: 28,
        guidance_scale: 3.5,
        loras: [{ path: SEAMLESS_LORA, scale: 1.0 }],
      }),
    });

    if (!res.ok) {
      console.error(`fal error: ${res.status} ${await res.text()}`);
      return null;
    }

    const data = await res.json();
    const url = data.images?.[0]?.url;
    if (!url) return null;

    const imgRes = await fetch(url);
    return Buffer.from(await imgRes.arrayBuffer());
  } catch (e) {
    console.error('gen error:', e);
    return null;
  }
}

// Full pipeline: generate -> find best subset -> mirror fold -> edge blend
async function processTile(cfg: TileConfig): Promise<void> {
  console.log(`\n[${cfg.name}]`);

  // 1. generate at larger size
  console.log(`  generating ${GEN_SIZE}x${GEN_SIZE}...`);
  const raw = await generateSeamless(cfg.prompt, GEN_SIZE);
  if (!raw) {
    console.log(`  FAILED to generate`);
    return;
  }

  // save raw for debugging
  writeFileSync(join(OUTPUT_DIR, `${cfg.name}_raw.webp`), raw);

  // 2. find best tileable subset
  console.log(`  finding best ${cfg.size}x${cfg.size} subset...`);
  const subset = await findBestSubset(raw, cfg.size);

  // 3. measure initial seam cost
  const initialCost = await measureSeamCost(subset, cfg.size, cfg.size);
  console.log(`  initial seam cost: ${initialCost.toFixed(1)}`);

  // 4. apply mirror fold if seam cost is high
  let processed = subset;
  if (initialCost > 15) {
    console.log(`  applying mirror fold...`);
    processed = await mirrorFold(subset);
    const newCost = await measureSeamCost(processed, cfg.size, cfg.size);
    console.log(`  post-fold seam cost: ${newCost.toFixed(1)}`);
  }

  // 5. edge blend for extra smoothness
  console.log(`  edge blending...`);
  processed = await edgeBlend(processed, 8);

  // 6. save final
  const finalPath = join(OUTPUT_DIR, `terrain_${cfg.name}.webp`);
  writeFileSync(finalPath, processed);
  console.log(`  saved: ${finalPath}`);

  // 7. generate flipped variants if allowed
  if (cfg.flipH) {
    const flipH = await sharp(processed).flop().toBuffer();
    writeFileSync(join(OUTPUT_DIR, `terrain_${cfg.name}_fliph.webp`), flipH);
  }
  if (cfg.flipV) {
    const flipV = await sharp(processed).flip().toBuffer();
    writeFileSync(join(OUTPUT_DIR, `terrain_${cfg.name}_flipv.webp`), flipV);
  }
}

// Generate transition tiles (A -> B gradient)
async function generateTransition(from: string, to: string): Promise<void> {
  const fromPath = join(OUTPUT_DIR, `terrain_${from}.webp`);
  const toPath = join(OUTPUT_DIR, `terrain_${to}.webp`);

  if (!existsSync(fromPath) || !existsSync(toPath)) {
    console.log(`  skip transition ${from}->${to}: missing base tiles`);
    return;
  }

  const fromBuf = await sharp(fromPath).raw().toBuffer({ resolveWithObject: true });
  const toBuf = await sharp(toPath).raw().toBuffer({ resolveWithObject: true });
  const w = fromBuf.info.width;
  const h = fromBuf.info.height;
  const ch = fromBuf.info.channels;
  const out = Buffer.alloc(fromBuf.data.length);

  // horizontal gradient transition
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = x / w;
      const idx = (y * w + x) * ch;
      for (let c = 0; c < ch; c++) {
        out[idx + c] = Math.round(fromBuf.data[idx + c] * (1 - alpha) + toBuf.data[idx + c] * alpha);
      }
    }
  }

  const transPath = join(OUTPUT_DIR, `trans_${from}_${to}_h.webp`);
  await sharp(out, { raw: { width: w, height: h, channels: ch } }).webp().toFile(transPath);
  console.log(`  transition: ${transPath}`);

  // vertical gradient
  const outV = Buffer.alloc(fromBuf.data.length);
  for (let y = 0; y < h; y++) {
    const alpha = y / h;
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * ch;
      for (let c = 0; c < ch; c++) {
        outV[idx + c] = Math.round(fromBuf.data[idx + c] * (1 - alpha) + toBuf.data[idx + c] * alpha);
      }
    }
  }

  const transPathV = join(OUTPUT_DIR, `trans_${from}_${to}_v.webp`);
  await sharp(outV, { raw: { width: w, height: h, channels: ch } }).webp().toFile(transPathV);
  console.log(`  transition: ${transPathV}`);
}

async function main() {
  const args = process.argv.slice(2);
  const only = args.find(a => a.startsWith('--only='))?.split('=')[1];
  const transOnly = args.includes('--transitions-only');
  const skipGen = args.includes('--skip-gen');

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  if (!transOnly && !skipGen) {
    let tiles = TERRAIN_TILES;
    if (only) tiles = tiles.filter(t => t.name === only);

    console.log(`Processing ${tiles.length} tiles...`);
    for (const tile of tiles) {
      await processTile(tile);
      await new Promise(r => setTimeout(r, 500)); // rate limit
    }
  }

  // generate transitions
  console.log('\nGenerating transitions...');
  const transitions: [string, string][] = [
    ['grass', 'forest'],
    ['grass', 'dirt'],
    ['grass', 'shore'],
    ['shore', 'sea'],
    ['shore', 'river'],
    ['grass', 'mountain'],
    ['snow', 'mountain'],
    ['forest', 'swamp'],
    ['dirt', 'cobble'],
  ];

  for (const [from, to] of transitions) {
    await generateTransition(from, to);
  }

  console.log('\nDone!');
}

main();
