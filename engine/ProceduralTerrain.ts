// Procedural terrain texture generation - no external dependencies
// Creates tileable textures at runtime using noise algorithms

export interface BiomeColors {
  primary: string;
  secondary: string;
  accent: string;
  detail: string;
}

export const BIOME_PALETTES: Record<string, BiomeColors> = {
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

// Simplex-like noise implementation
class NoiseGenerator {
  private perm: number[] = [];

  constructor(seed: number = 12345) {
    // Initialize permutation table
    for (let i = 0; i < 256; i++) this.perm[i] = i;

    // Shuffle with seed
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const j = s % (i + 1);
      [this.perm[i], this.perm[j]] = [this.perm[j], this.perm[i]];
    }

    // Duplicate for overflow
    for (let i = 0; i < 256; i++) this.perm[256 + i] = this.perm[i];
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
  }

  noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);

    const u = this.fade(x);
    const v = this.fade(y);

    const A = this.perm[X] + Y;
    const B = this.perm[X + 1] + Y;

    return this.lerp(
      this.lerp(this.grad(this.perm[A], x, y), this.grad(this.perm[B], x - 1, y), u),
      this.lerp(this.grad(this.perm[A + 1], x, y - 1), this.grad(this.perm[B + 1], x - 1, y - 1), u),
      v
    );
  }

  // Multi-octave fractal noise
  fbm(x: number, y: number, octaves: number = 4, lacunarity: number = 2, persistence: number = 0.5): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise2D(x * frequency, y * frequency);
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return value / maxValue;
  }

  // Ridged noise for mountains/rocks
  ridged(x: number, y: number, octaves: number = 4): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.noise2D(x * frequency, y * frequency));
      value += amplitude * n * n;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return value / maxValue;
  }

  // Turbulence for organic patterns
  turbulence(x: number, y: number, octaves: number = 4): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * Math.abs(this.noise2D(x * frequency, y * frequency));
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }

    return value / maxValue;
  }
}

// Parse hex color to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

// Blend two colors
function blendColors(c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }, t: number): { r: number; g: number; b: number } {
  return {
    r: Math.floor(c1.r + (c2.r - c1.r) * t),
    g: Math.floor(c1.g + (c2.g - c1.g) * t),
    b: Math.floor(c1.b + (c2.b - c1.b) * t)
  };
}

export class ProceduralTerrainGenerator {
  private noise: NoiseGenerator;
  private textureCache: Map<string, HTMLCanvasElement> = new Map();

  constructor(seed: number = 42) {
    this.noise = new NoiseGenerator(seed);
  }

  // Generate a tileable terrain texture
  generateBiomeTexture(biome: string, size: number = 256): HTMLCanvasElement {
    const cacheKey = `${biome}_${size}`;
    if (this.textureCache.has(cacheKey)) {
      return this.textureCache.get(cacheKey)!;
    }

    const pixels = this.generateBiomePixels(biome, size);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const imageData = new ImageData(pixels, size, size);
    ctx.putImageData(imageData, 0, 0);

    this.textureCache.set(cacheKey, canvas);
    return canvas;
  }

  // Generate raw pixel data for a biome texture (worker-safe)
  generateBiomePixels(biome: string, size: number = 256): Uint8ClampedArray {
    const data = new Uint8ClampedArray(size * size * 4);

    const palette = BIOME_PALETTES[biome] || BIOME_PALETTES.GRASS;
    const primary = hexToRgb(palette.primary);
    const secondary = hexToRgb(palette.secondary);
    const accent = hexToRgb(palette.accent);
    const detail = hexToRgb(palette.detail);

    const scale = 8; // Base noise scale for tiling

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Use tileable coordinates (wrap around)
        const tx = x / size * scale;
        const ty = y / size * scale;

        // Simplified tileable noise
        const nx = tx;
        const ny = ty;

        let color: { r: number; g: number; b: number };

        switch (biome) {
          case 'GRASS':
            color = this.generateGrass(nx, ny, primary, secondary, accent, detail);
            break;
          case 'FOREST':
            color = this.generateForest(nx, ny, primary, secondary, accent, detail);
            break;
          case 'MOUNTAIN':
            color = this.generateMountain(nx, ny, primary, secondary, accent, detail);
            break;
          case 'SNOW':
            color = this.generateSnow(nx, ny, primary, secondary, accent, detail);
            break;
          case 'SHORE':
            color = this.generateShore(nx, ny, primary, secondary, accent, detail);
            break;
          case 'RIVER':
          case 'SEA':
            color = this.generateWater(nx, ny, primary, secondary, accent, detail, biome === 'SEA');
            break;
          case 'SWAMP':
            color = this.generateSwamp(nx, ny, primary, secondary, accent, detail);
            break;
          case 'LOWLAND':
            color = this.generateLowland(nx, ny, primary, secondary, accent, detail);
            break;
          case 'TOWN':
            color = this.generateTown(nx, ny, primary, secondary, accent, detail, x, y, size);
            break;
          default:
            color = primary;
        }

        data[idx] = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;
        data[idx + 3] = 255;
      }
    }

    // Make truly tileable by blending edges
    this.blendEdgesForTilingData(data, size);
    return data;
  }

  private generateGrass(x: number, y: number, p: any, s: any, a: any, d: any): { r: number; g: number; b: number } {
    const n1 = this.noise.fbm(x, y, 4, 2, 0.5) * 0.5 + 0.5;
    const n2 = this.noise.fbm(x * 3, y * 3, 2, 2, 0.5) * 0.5 + 0.5;

    // Blend between colors based on noise
    let color = blendColors(p, s, n1);

    // Add darker patches
    if (n2 < 0.3) {
      color = blendColors(color, d, 0.3);
    }
    // Add lighter highlights
    if (n2 > 0.7) {
      color = blendColors(color, a, 0.2);
    }

    // Small detail variation
    const detail = this.noise.noise2D(x * 20, y * 20) * 0.5 + 0.5;
    color.r = Math.max(0, Math.min(255, color.r + (detail - 0.5) * 15));
    color.g = Math.max(0, Math.min(255, color.g + (detail - 0.5) * 20));
    color.b = Math.max(0, Math.min(255, color.b + (detail - 0.5) * 10));

    return color;
  }

  private generateForest(x: number, y: number, p: any, s: any, a: any, d: any): { r: number; g: number; b: number } {
    const n1 = this.noise.fbm(x, y, 5, 2, 0.6) * 0.5 + 0.5;
    const n2 = this.noise.turbulence(x * 2, y * 2, 3);

    let color = blendColors(p, s, n1);

    // Darker dappled shadows
    if (n2 < 0.4) {
      color = blendColors(color, d, 0.5);
    }

    // Leaf litter spots
    const spots = this.noise.noise2D(x * 15, y * 15);
    if (spots > 0.6) {
      color = blendColors(color, a, 0.3);
    }

    return color;
  }

  private generateMountain(x: number, y: number, p: any, s: any, a: any, d: any): { r: number; g: number; b: number } {
    const n1 = this.noise.ridged(x, y, 4);
    const n2 = this.noise.fbm(x * 2, y * 2, 3, 2, 0.5) * 0.5 + 0.5;

    let color = blendColors(p, s, n1);

    // Cracks and crevices
    if (n2 < 0.25) {
      color = blendColors(color, d, 0.6);
    }
    // Highlights
    if (n1 > 0.7) {
      color = blendColors(color, a, 0.3);
    }

    return color;
  }

  private generateSnow(x: number, y: number, p: any, s: any, a: any, d: any): { r: number; g: number; b: number } {
    const n1 = this.noise.fbm(x, y, 3, 2, 0.4) * 0.5 + 0.5;
    const n2 = this.noise.noise2D(x * 10, y * 10) * 0.5 + 0.5;

    let color = blendColors(p, s, n1 * 0.5);

    // Subtle blue shadows in drifts
    if (n1 < 0.4) {
      color = blendColors(color, d, 0.2);
    }

    // Sparkle highlights
    if (n2 > 0.85) {
      color = blendColors(color, a, 0.5);
    }

    return color;
  }

  private generateShore(x: number, y: number, p: any, s: any, a: any, d: any): { r: number; g: number; b: number } {
    const n1 = this.noise.fbm(x, y, 4, 2, 0.5) * 0.5 + 0.5;
    const n2 = this.noise.noise2D(x * 8, y * 8) * 0.5 + 0.5;

    let color = blendColors(p, s, n1);

    // Darker wet sand areas
    if (n2 < 0.3) {
      color = blendColors(color, d, 0.3);
    }
    // Lighter dry sand
    if (n2 > 0.7) {
      color = blendColors(color, a, 0.2);
    }

    // Small pebbles/shells
    const pebbles = this.noise.noise2D(x * 30, y * 30);
    if (pebbles > 0.8) {
      color.r = Math.min(255, color.r + 20);
      color.g = Math.min(255, color.g + 15);
      color.b = Math.min(255, color.b + 10);
    }

    return color;
  }

  private generateWater(x: number, y: number, p: any, s: any, a: any, d: any, deep: boolean): { r: number; g: number; b: number } {
    const n1 = this.noise.fbm(x, y, 3, 2, 0.5) * 0.5 + 0.5;
    const n2 = this.noise.noise2D(x * 6, y * 6) * 0.5 + 0.5;

    let color = blendColors(p, s, n1 * 0.6);

    // Deeper areas
    if (deep && n1 < 0.4) {
      color = blendColors(color, d, 0.4);
    }

    // Wave highlights
    if (n2 > 0.75) {
      color = blendColors(color, a, 0.3);
    }

    // Caustics pattern
    const caustics = this.noise.noise2D(x * 12, y * 12);
    if (caustics > 0.7 && !deep) {
      color.r = Math.min(255, color.r + 15);
      color.g = Math.min(255, color.g + 20);
      color.b = Math.min(255, color.b + 25);
    }

    return color;
  }

  private generateSwamp(x: number, y: number, p: any, s: any, a: any, d: any): { r: number; g: number; b: number } {
    const n1 = this.noise.turbulence(x, y, 4);
    const n2 = this.noise.fbm(x * 2, y * 2, 3, 2, 0.5) * 0.5 + 0.5;

    let color = blendColors(p, s, n1);

    // Murky patches
    if (n2 < 0.35) {
      color = blendColors(color, d, 0.5);
    }

    // Algae spots
    if (n2 > 0.65) {
      color.g = Math.min(255, color.g + 15);
    }

    return color;
  }

  private generateLowland(x: number, y: number, p: any, s: any, a: any, d: any): { r: number; g: number; b: number } {
    const n1 = this.noise.fbm(x, y, 4, 2, 0.5) * 0.5 + 0.5;
    const n2 = this.noise.noise2D(x * 5, y * 5) * 0.5 + 0.5;

    let color = blendColors(p, s, n1);

    // Dry cracked areas
    if (n2 < 0.3) {
      color = blendColors(color, d, 0.4);
    }

    // Sparse grass patches
    if (n2 > 0.8) {
      color.g = Math.min(255, color.g + 20);
    }

    return color;
  }

  private generateTown(x: number, y: number, p: any, s: any, a: any, d: any, px: number, py: number, size: number): { r: number; g: number; b: number } {
    // Cobblestone pattern
    const stoneSize = size / 16;
    const stoneX = Math.floor(px / stoneSize);
    const stoneY = Math.floor(py / stoneSize);

    // Offset every other row
    const offsetX = (stoneY % 2) * (stoneSize / 2);
    const localX = (px + offsetX) % stoneSize;
    const localY = py % stoneSize;

    // Distance from stone center
    const centerDist = Math.sqrt(
      Math.pow(localX - stoneSize / 2, 2) +
      Math.pow(localY - stoneSize / 2, 2)
    ) / (stoneSize / 2);

    // Stone variation based on position
    const stoneNoise = this.noise.noise2D(stoneX * 0.5, stoneY * 0.5) * 0.5 + 0.5;

    let color = blendColors(p, s, stoneNoise);

    // Grout/gaps between stones
    if (centerDist > 0.8) {
      color = blendColors(color, d, 0.6);
    }

    // Moss in gaps
    if (centerDist > 0.85 && stoneNoise > 0.6) {
      color.g = Math.min(255, color.g + 25);
    }

    return color;
  }

  // Blend edges to ensure perfect tiling
  private blendEdgesForTilingData(data: Uint8ClampedArray, size: number): void {
    const blendWidth = Math.floor(size * 0.1); // 10% edge blend

    // Horizontal edge blend
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < blendWidth; x++) {
        const t = x / blendWidth;
        const leftIdx = (y * size + x) * 4;
        const rightIdx = (y * size + (size - blendWidth + x)) * 4;

        for (let c = 0; c < 3; c++) {
          const avg = (data[leftIdx + c] + data[rightIdx + c]) / 2;
          data[leftIdx + c] = Math.floor(data[leftIdx + c] * t + avg * (1 - t));
          data[rightIdx + c] = Math.floor(data[rightIdx + c] * (1 - t) + avg * t);
        }
      }
    }

    // Vertical edge blend
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < blendWidth; y++) {
        const t = y / blendWidth;
        const topIdx = (y * size + x) * 4;
        const bottomIdx = ((size - blendWidth + y) * size + x) * 4;

        for (let c = 0; c < 3; c++) {
          const avg = (data[topIdx + c] + data[bottomIdx + c]) / 2;
          data[topIdx + c] = Math.floor(data[topIdx + c] * t + avg * (1 - t));
          data[bottomIdx + c] = Math.floor(data[bottomIdx + c] * (1 - t) + avg * t);
        }
      }
    }
  }

  // Clear cache if needed
  clearCache(): void {
    this.textureCache.clear();
  }
}

// Singleton instance
export const proceduralTerrain = new ProceduralTerrainGenerator();
