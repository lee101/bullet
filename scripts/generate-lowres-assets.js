#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';

const inputRoot = process.argv[2] || 'public/assets';
const outputRoot = process.argv[3] || 'public/assets-low';
const scale = Number(process.argv[4] || '0.5');

if (!Number.isFinite(scale) || scale <= 0 || scale > 1) {
  console.error('Scale must be a number between 0 and 1. Example: 0.5');
  process.exit(1);
}

const exts = new Set(['.webp', '.png', '.jpg', '.jpeg']);
let processed = 0;
let skipped = 0;

const shouldProcess = (filePath) => exts.has(path.extname(filePath).toLowerCase());

async function processFile(filePath) {
  const rel = path.relative(inputRoot, filePath);
  const outPath = path.join(outputRoot, rel);
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  try {
    const inStat = await fs.stat(filePath);
    const outStat = await fs.stat(outPath).catch(() => null);
    if (outStat && outStat.mtimeMs >= inStat.mtimeMs) {
      skipped++;
      return;
    }
  } catch {
    // continue
  }

  const img = sharp(filePath);
  const meta = await img.metadata();
  const width = meta.width ? Math.max(1, Math.round(meta.width * scale)) : undefined;
  const height = meta.height ? Math.max(1, Math.round(meta.height * scale)) : undefined;
  let pipeline = img.resize({ width, height, fit: 'inside' });

  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') pipeline = pipeline.png({ compressionLevel: 9 });
  else if (ext === '.jpg' || ext === '.jpeg') pipeline = pipeline.jpeg({ quality: 70 });
  else pipeline = pipeline.webp({ quality: 70 });

  await pipeline.toFile(outPath);
  processed++;
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
    } else if (entry.isFile() && shouldProcess(fullPath)) {
      await processFile(fullPath);
    }
  }
}

(async () => {
  try {
    await walk(inputRoot);
    console.log(`Low-res assets written to ${outputRoot}`);
    console.log(`Processed: ${processed}, skipped: ${skipped}`);
  } catch (err) {
    console.error('Low-res generation failed:', err?.message || err);
    process.exit(1);
  }
})();
