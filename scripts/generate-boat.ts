#!/usr/bin/env bun
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import sharp from 'sharp';

const FAL_KEY = process.env.FAL_API_KEY ||
  Bun.spawnSync(['bash', '-c', 'source ~/.secretbashrc && echo $FAL_API_KEY']).stdout.toString().trim();

async function main() {
  const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: 'wooden rowing boat sprite, medieval fantasy, top-down view, game asset, transparent background, clean edges, 2D pixel art style',
      image_size: { width: 128, height: 128 },
      num_images: 1,
      num_inference_steps: 4
    })
  });

  const data = await res.json() as { images?: { url: string }[] };
  const url = data.images?.[0]?.url;
  if (!url) { console.error('No URL'); process.exit(1); }

  const imgRes = await fetch(url);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  await sharp(buf).webp({ quality: 85 }).toFile('public/assets/game/mounts/boat.webp');
  console.log('Generated boat.webp');
}

main();
