#!/usr/bin/env bun
// Convert PNG to WebP with 85% quality
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error('Usage: bun convert-to-webp.js <input.png> <output.webp>');
  process.exit(1);
}

try {
  const buffer = await sharp(inputPath)
    .webp({ quality: 85 })
    .toBuffer();

  writeFileSync(outputPath, buffer);
  console.log(`Converted: ${outputPath}`);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
