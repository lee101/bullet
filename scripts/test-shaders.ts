#!/usr/bin/env bun
/**
 * Shader & Terrain Visual Test Suite
 * Renders all shaders and terrain textures to images for visual evaluation
 * Output: shadertestresults/
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = 'shadertestresults';

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Create canvas for rendering
function createCanvas(width: number, height: number): { canvas: any; ctx: CanvasRenderingContext2D } {
  // Use OffscreenCanvas for Bun/Node
  const { createCanvas } = require('canvas');
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  return { canvas, ctx };
}

// Biome color palettes
const BIOME_PALETTES: Record<string, { primary: string; secondary: string; accent: string; detail: string }> = {
  GRASS: { primary: '#3d6b2a', secondary: '#4a7d32', accent: '#5a9339', detail: '#2d5420' },
  FOREST: { primary: '#2a4a26', secondary: '#1e3a1a', accent: '#3d5a30', detail: '#162812' },
  MOUNTAIN: { primary: '#5a5a5a', secondary: '#6a6a6a', accent: '#4a4a4a', detail: '#7a7a7a' },
  SNOW: { primary: '#e8f0f8', secondary: '#d0e0f0', accent: '#f0f8ff', detail: '#b8d0e8' },
  SHORE: { primary: '#c4a86a', secondary: '#d4b87a', accent: '#b49858', detail: '#e4c88a' },
  RIVER: { primary: '#2a5a7a', secondary: '#3a6a8a', accent: '#1a4a6a', detail: '#4a7a9a' },
  SEA: { primary: '#1a3a5a', secondary: '#0a2a4a', accent: '#2a4a6a', detail: '#0a1a3a' },
  SWAMP: { primary: '#2a3a26', secondary: '#3a4a30', accent: '#1a2a1a', detail: '#4a5a40' },
  LOWLAND: { primary: '#6a5a4a', secondary: '#7a6a5a', accent: '#5a4a3a', detail: '#8a7a6a' },
  TOWN: { primary: '#5a5a5a', secondary: '#6a6a6a', accent: '#4a4a4a', detail: '#7a7060' },
};

// Magic effect colors
const MAGIC_COLORS: Record<string, { primary: string; secondary: string; glow: string }> = {
  fire: { primary: '#ff4400', secondary: '#ff8800', glow: '#ffcc00' },
  ice: { primary: '#00aaff', secondary: '#88ddff', glow: '#ffffff' },
  lightning: { primary: '#ffff00', secondary: '#ffffff', glow: '#ffffaa' },
  magic: { primary: '#aa00ff', secondary: '#dd88ff', glow: '#ff88ff' },
  poison: { primary: '#00ff44', secondary: '#88ff88', glow: '#ccffcc' },
  heal: { primary: '#44ff88', secondary: '#88ffaa', glow: '#ffffff' },
  black: { primary: '#220033', secondary: '#440066', glow: '#8800aa' },
  earth: { primary: '#8b4513', secondary: '#a0522d', glow: '#daa520' },
  blood: { primary: '#8b0000', secondary: '#dc143c', glow: '#ff4444' },
  lumin: { primary: '#ffffcc', secondary: '#ffffff', glow: '#ffffee' },
  inferno: { primary: '#ff2200', secondary: '#ff6600', glow: '#ffaa00' },
  blizzard: { primary: '#4488ff', secondary: '#aaccff', glow: '#ffffff' },
  thunderstorm: { primary: '#8888ff', secondary: '#ffff44', glow: '#ffffff' },
  chaos: { primary: '#ff00ff', secondary: '#00ffff', glow: '#ffff00' },
  sanctuary: { primary: '#88ff88', secondary: '#ffffff', glow: '#ffffcc' },
};

// Noise function for procedural generation
function noise2D(x: number, y: number, seed: number = 12345): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

function fbm(x: number, y: number, octaves: number = 4): number {
  let value = 0;
  let amplitude = 0.5;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2D(x, y, i * 1000);
    x *= 2;
    y *= 2;
    amplitude *= 0.5;
  }
  return value;
}

// Generate a single biome tile texture
function generateBiomeTile(ctx: CanvasRenderingContext2D, biome: string, size: number): void {
  const colors = BIOME_PALETTES[biome];
  if (!colors) return;

  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Tiling coordinates (wrap at edges)
      const tx = x / size;
      const ty = y / size;

      // Multi-octave noise for variation
      const n1 = fbm(tx * 8, ty * 8, 4);
      const n2 = fbm(tx * 16 + 100, ty * 16 + 100, 3);
      const n3 = fbm(tx * 32 + 200, ty * 32 + 200, 2);

      // Parse colors
      const primary = hexToRgb(colors.primary);
      const secondary = hexToRgb(colors.secondary);
      const accent = hexToRgb(colors.accent);
      const detail = hexToRgb(colors.detail);

      // Blend based on noise
      let r = primary.r * (1 - n1) + secondary.r * n1;
      let g = primary.g * (1 - n1) + secondary.g * n1;
      let b = primary.b * (1 - n1) + secondary.b * n1;

      // Add detail noise
      r += (accent.r - r) * n2 * 0.3;
      g += (accent.g - g) * n2 * 0.3;
      b += (accent.b - b) * n2 * 0.3;

      // Fine detail
      const detailAmount = n3 * 0.15;
      r += (detail.r - r) * detailAmount;
      g += (detail.g - g) * detailAmount;
      b += (detail.b - b) * detailAmount;

      data[idx] = Math.min(255, Math.max(0, Math.round(r)));
      data[idx + 1] = Math.min(255, Math.max(0, Math.round(g)));
      data[idx + 2] = Math.min(255, Math.max(0, Math.round(b)));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

// Generate magic effect
function generateMagicEffect(ctx: CanvasRenderingContext2D, type: string, size: number, time: number = 0): void {
  const colors = MAGIC_COLORS[type];
  if (!colors) return;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.4;

  // Clear
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);

  // Outer glow
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.5);
  gradient.addColorStop(0, colors.glow + '88');
  gradient.addColorStop(0.5, colors.primary + '44');
  gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Core effect with noise
  for (let i = 0; i < 50; i++) {
    const angle = (i / 50) * Math.PI * 2 + time;
    const n = noise2D(Math.cos(angle) * 10, Math.sin(angle) * 10 + time);
    const r = radius * (0.5 + n * 0.5);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;

    ctx.fillStyle = i % 2 === 0 ? colors.primary : colors.secondary;
    ctx.beginPath();
    ctx.arc(x, y, 3 + n * 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Center
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.3);
  coreGrad.addColorStop(0, colors.glow);
  coreGrad.addColorStop(1, colors.primary);
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

// Generate 4x4 tiled version to test seamless tiling
function generate4x4Tile(ctx: CanvasRenderingContext2D, tileCanvas: any, size: number): void {
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      ctx.drawImage(tileCanvas, x * size, y * size);
    }
  }
}

// Generate biome blend test (two biomes side by side with gradient)
function generateBlendTest(ctx: CanvasRenderingContext2D, biome1: string, biome2: string, size: number): void {
  const colors1 = BIOME_PALETTES[biome1];
  const colors2 = BIOME_PALETTES[biome2];
  if (!colors1 || !colors2) return;

  const imageData = ctx.createImageData(size, size);
  const data = imageData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Blend factor with noise for organic edge
      const baseBlend = x / size;
      const noiseOffset = fbm(x * 0.05, y * 0.05, 3) * 0.3;
      const blend = Math.min(1, Math.max(0, baseBlend + noiseOffset - 0.15));

      const n = fbm(x * 0.03, y * 0.03, 4);

      const c1 = hexToRgb(n > 0.5 ? colors1.primary : colors1.secondary);
      const c2 = hexToRgb(n > 0.5 ? colors2.primary : colors2.secondary);

      data[idx] = Math.round(c1.r * (1 - blend) + c2.r * blend);
      data[idx + 1] = Math.round(c1.g * (1 - blend) + c2.g * blend);
      data[idx + 2] = Math.round(c1.b * (1 - blend) + c2.b * blend);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

async function saveCanvas(canvas: any, filename: string): Promise<void> {
  const buffer = canvas.toBuffer('image/png');
  writeFileSync(join(OUTPUT_DIR, filename), buffer);
  console.log(`  Saved: ${filename}`);
}

async function runTests(): Promise<void> {
  console.log('=== Shader & Terrain Visual Test Suite ===\n');

  const TILE_SIZE = 128;
  const EFFECT_SIZE = 256;

  // Test 1: Individual biome tiles
  console.log('1. Generating biome tiles (single)...');
  for (const biome of Object.keys(BIOME_PALETTES)) {
    const { canvas, ctx } = createCanvas(TILE_SIZE, TILE_SIZE);
    generateBiomeTile(ctx, biome, TILE_SIZE);
    await saveCanvas(canvas, `biome_${biome.toLowerCase()}_single.png`);
  }

  // Test 2: 4x4 tiled biomes (to check seamless tiling)
  console.log('\n2. Generating 4x4 tiled biomes...');
  for (const biome of Object.keys(BIOME_PALETTES)) {
    const { canvas: tileCanvas, ctx: tileCtx } = createCanvas(TILE_SIZE, TILE_SIZE);
    generateBiomeTile(tileCtx, biome, TILE_SIZE);

    const { canvas: gridCanvas, ctx: gridCtx } = createCanvas(TILE_SIZE * 4, TILE_SIZE * 4);
    generate4x4Tile(gridCtx, tileCanvas, TILE_SIZE);
    await saveCanvas(gridCanvas, `biome_${biome.toLowerCase()}_4x4.png`);
  }

  // Test 3: Magic effects
  console.log('\n3. Generating magic effects...');
  for (const effect of Object.keys(MAGIC_COLORS)) {
    const { canvas, ctx } = createCanvas(EFFECT_SIZE, EFFECT_SIZE);
    generateMagicEffect(ctx, effect, EFFECT_SIZE, 0);
    await saveCanvas(canvas, `magic_${effect}.png`);
  }

  // Test 4: Biome blend tests (common transitions)
  console.log('\n4. Generating biome blend tests...');
  const blendPairs = [
    ['GRASS', 'FOREST'],
    ['GRASS', 'SHORE'],
    ['SHORE', 'SEA'],
    ['FOREST', 'MOUNTAIN'],
    ['MOUNTAIN', 'SNOW'],
    ['GRASS', 'SWAMP'],
    ['LOWLAND', 'GRASS'],
    ['RIVER', 'GRASS'],
  ];

  for (const [b1, b2] of blendPairs) {
    const { canvas, ctx } = createCanvas(256, 256);
    generateBlendTest(ctx, b1, b2, 256);
    await saveCanvas(canvas, `blend_${b1.toLowerCase()}_to_${b2.toLowerCase()}.png`);
  }

  console.log('\n=== Test Complete ===');
  console.log(`Output directory: ${OUTPUT_DIR}/`);
  console.log('\nGenerated files:');
  console.log('  - biome_*_single.png: Individual biome tiles');
  console.log('  - biome_*_4x4.png: 4x4 tiled versions (check seamless)');
  console.log('  - magic_*.png: Magic effect renders');
  console.log('  - blend_*_to_*.png: Biome transition blends');
}

runTests().catch(console.error);
