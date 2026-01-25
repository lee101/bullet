import sharp from 'sharp';
import { readdirSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const INPUT_DIR = 'public/assets/generated';
const OUTPUT_DIR = 'public/assets/tiled';

// Makes texture tileable using mirror-fold technique
async function makeTileableMirror(inputPath: string, outputPath: string) {
  const meta = await sharp(inputPath).metadata();
  const w = meta.width!;
  const h = meta.height!;

  // Get all 4 orientations
  const original = await sharp(inputPath).webp({ quality: 85 }).toBuffer();
  const flippedH = await sharp(inputPath).flop().webp({ quality: 85 }).toBuffer();
  const flippedV = await sharp(inputPath).flip().webp({ quality: 85 }).toBuffer();
  const flippedBoth = await sharp(inputPath).flip().flop().webp({ quality: 85 }).toBuffer();

  // Composite into 2x2 grid
  const compositeBuffer = await sharp({
    create: {
      width: w * 2,
      height: h * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 255 }
    }
  })
    .composite([
      { input: original, top: 0, left: 0 },
      { input: flippedH, top: 0, left: w },
      { input: flippedV, top: h, left: 0 },
      { input: flippedBoth, top: h, left: w },
    ])
    .webp({ quality: 85 })
    .toBuffer();

  // Extract center region (guaranteed to tile)
  await sharp(compositeBuffer)
    .extract({
      left: Math.floor(w / 2),
      top: Math.floor(h / 2),
      width: w,
      height: h
    })
    .webp({ quality: 85 })
    .toFile(outputPath);

  console.log(`  Tiled: ${outputPath}`);
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const files = readdirSync(INPUT_DIR).filter(f => f.startsWith('terrain_') && f.endsWith('.webp'));

  if (files.length === 0) {
    console.log('No terrain textures found in', INPUT_DIR);
    return;
  }

  console.log(`Processing ${files.length} terrain textures...`);

  for (const file of files) {
    const inputPath = join(INPUT_DIR, file);
    const outputPath = join(OUTPUT_DIR, file);

    try {
      await makeTileableMirror(inputPath, outputPath);
    } catch (e) {
      console.error(`Failed: ${file}`, e);
    }
  }

  console.log('Done! Tiled textures saved to:', OUTPUT_DIR);
}

main();
