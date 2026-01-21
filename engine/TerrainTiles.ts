
import { Biome, Vec2 } from '../types';

// Tile edge encoding: NESW (North, East, South, West)
// Each edge is either same-biome (0) or different-biome (1)
// Creates 16 possible edge combinations per biome pair
export type TileEdge = 0 | 1;
export type TileEdgeCode = number; // 0-15 based on NESW binary

// Biome compatibility - which biomes can naturally border each other
export const BIOME_ADJACENCY: Record<Biome, Biome[]> = {
  SEA: ['SHORE', 'RIVER'],
  SHORE: ['SEA', 'GRASS', 'LOWLAND', 'SWAMP'],
  RIVER: ['SEA', 'GRASS', 'FOREST', 'SWAMP', 'LOWLAND', 'SHORE'],
  LOWLAND: ['GRASS', 'SHORE', 'SWAMP', 'RIVER'],
  GRASS: ['LOWLAND', 'FOREST', 'SHORE', 'SWAMP', 'MOUNTAIN', 'RIVER'],
  SWAMP: ['GRASS', 'FOREST', 'LOWLAND', 'RIVER', 'SHORE'],
  FOREST: ['GRASS', 'MOUNTAIN', 'SWAMP', 'RIVER', 'SNOW'],
  MOUNTAIN: ['GRASS', 'FOREST', 'SNOW'],
  SNOW: ['MOUNTAIN', 'FOREST'],
  TOWN: ['GRASS', 'LOWLAND', 'FOREST'], // towns can be anywhere valid
};

// Terrain detail features that spawn based on biome
export type TerrainFeature =
  | 'NONE'
  | 'ROCKS_SMALL' | 'ROCKS_LARGE' | 'BOULDER'
  | 'TREE_DECIDUOUS' | 'TREE_PINE' | 'TREE_DEAD' | 'TREE_PALM'
  | 'BUSH' | 'FLOWERS' | 'MUSHROOMS' | 'TALL_GRASS'
  | 'RUINS_PILLAR' | 'RUINS_WALL' | 'RUINS_FLOOR'
  | 'BONES' | 'SKULL'
  | 'CAMP_TENT' | 'CAMP_FIRE'
  | 'PATH_STONE' | 'PATH_DIRT'
  | 'WATER_LILY' | 'REEDS'
  | 'SNOW_DRIFT' | 'ICE_PATCH' | 'FROZEN_TREE';

// Feature spawn rules per biome - kept sparse for performance
export const BIOME_FEATURES: Record<Biome, { feature: TerrainFeature; weight: number; density: number }[]> = {
  SEA: [],
  SHORE: [
    { feature: 'ROCKS_SMALL', weight: 0.5, density: 0.02 },
    { feature: 'TREE_PALM', weight: 0.5, density: 0.01 },
  ],
  RIVER: [
    { feature: 'REEDS', weight: 1, density: 0.02 },
  ],
  LOWLAND: [
    { feature: 'ROCKS_SMALL', weight: 0.3, density: 0.01 },
    { feature: 'BUSH', weight: 0.7, density: 0.02 },
  ],
  GRASS: [
    { feature: 'TREE_DECIDUOUS', weight: 0.4, density: 0.02 },
    { feature: 'BUSH', weight: 0.4, density: 0.02 },
    { feature: 'ROCKS_SMALL', weight: 0.2, density: 0.01 },
  ],
  SWAMP: [
    { feature: 'TREE_DEAD', weight: 0.5, density: 0.02 },
    { feature: 'REEDS', weight: 0.5, density: 0.02 },
  ],
  FOREST: [
    { feature: 'TREE_DECIDUOUS', weight: 0.5, density: 0.04 },
    { feature: 'TREE_PINE', weight: 0.4, density: 0.03 },
    { feature: 'BUSH', weight: 0.1, density: 0.01 },
  ],
  MOUNTAIN: [
    { feature: 'ROCKS_LARGE', weight: 0.6, density: 0.03 },
    { feature: 'BOULDER', weight: 0.4, density: 0.02 },
  ],
  SNOW: [
    { feature: 'FROZEN_TREE', weight: 0.4, density: 0.02 },
    { feature: 'ROCKS_LARGE', weight: 0.6, density: 0.02 },
  ],
  TOWN: [
    { feature: 'PATH_STONE', weight: 0.7, density: 0.05 },
    { feature: 'FLOWERS', weight: 0.3, density: 0.02 },
    { feature: 'BUSH', weight: 0.15, density: 0.04 },
  ],
};

// Wang tile edge codes: binary NESW
// 0000 = isolated, 1111 = all edges different
export function getEdgeCode(n: boolean, e: boolean, s: boolean, w: boolean): TileEdgeCode {
  return (n ? 8 : 0) + (e ? 4 : 0) + (s ? 2 : 0) + (w ? 1 : 0);
}

// Procedural tile variation based on position
export function getTileVariant(x: number, y: number, maxVariants: number): number {
  const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  return hash % maxVariants;
}

// Asset path generators for FLUX tiles
export const TERRAIN_ASSET_PATHS = {
  // Base biome tiles (solid fills, multiple variants)
  base: (biome: Biome, variant: number) =>
    `/assets/terrain/base/${biome.toLowerCase()}_${variant}.webp`,

  // Edge transition tiles (biome A to biome B, edge code)
  transition: (from: Biome, to: Biome, edgeCode: TileEdgeCode) =>
    `/assets/terrain/transition/${from.toLowerCase()}_${to.toLowerCase()}_${edgeCode}.webp`,

  // Feature overlays
  feature: (feature: TerrainFeature, variant: number) =>
    `/assets/terrain/features/${feature.toLowerCase()}_${variant}.webp`,

  // Special tiles (rivers, roads, ruins)
  special: (type: string, variant: number) =>
    `/assets/terrain/special/${type}_${variant}.webp`,
};

// FLUX prompt templates for generating tiles
export const FLUX_PROMPTS = {
  base: {
    SEA: 'deep ocean water tile, dark blue, subtle waves, top-down game tile, seamless, 64x64',
    SHORE: 'sandy beach tile, tan sand with small pebbles, top-down game tile, seamless, 64x64',
    RIVER: 'flowing river water tile, blue-green, ripples, top-down game tile, seamless, 64x64',
    LOWLAND: 'dry dirt terrain tile, brown earth, sparse grass, top-down game tile, seamless, 64x64',
    GRASS: 'lush green grass tile, meadow, top-down game tile, seamless, 64x64',
    SWAMP: 'murky swamp tile, dark green, muddy water patches, top-down game tile, seamless, 64x64',
    FOREST: 'forest floor tile, fallen leaves, moss, dappled light, top-down game tile, seamless, 64x64',
    MOUNTAIN: 'rocky mountain terrain tile, gray stone, gravel, top-down game tile, seamless, 64x64',
    SNOW: 'snowy terrain tile, white snow, ice patches, top-down game tile, seamless, 64x64',
    TOWN: 'cobblestone street tile, medieval, worn stones, top-down game tile, seamless, 64x64',
  },
  features: {
    TREE_DECIDUOUS: 'single oak tree, green canopy, top-down view, game sprite, transparent bg, 64x64',
    TREE_PINE: 'single pine tree, conifer, top-down view, game sprite, transparent bg, 64x64',
    TREE_DEAD: 'dead tree, bare branches, spooky, top-down view, game sprite, transparent bg, 64x64',
    ROCKS_SMALL: 'small rocks cluster, gray stones, top-down view, game sprite, transparent bg, 32x32',
    ROCKS_LARGE: 'large rock formation, boulders, top-down view, game sprite, transparent bg, 64x64',
    RUINS_PILLAR: 'ancient stone pillar, crumbling, top-down view, game sprite, transparent bg, 48x48',
    RUINS_WALL: 'ruined stone wall segment, overgrown, top-down view, game sprite, transparent bg, 64x32',
    MUSHROOMS: 'cluster of fantasy mushrooms, glowing, top-down view, game sprite, transparent bg, 32x32',
    FLOWERS: 'wildflower patch, colorful, top-down view, game sprite, transparent bg, 32x32',
  },
};

// Tile data structure for rendered tiles
export interface TerrainTile {
  biome: Biome;
  edgeCode: TileEdgeCode;
  variant: number;
  features: { type: TerrainFeature; x: number; y: number; variant: number }[];
  neighbors: { n: Biome; e: Biome; s: Biome; w: Biome };
}

// Generate features for a tile based on biome rules
export function generateTileFeatures(
  biome: Biome,
  tileX: number,
  tileY: number,
  tileSize: number,
  seed: number
): TerrainTile['features'] {
  const features: TerrainTile['features'] = [];
  const rules = BIOME_FEATURES[biome];
  if (!rules.length) return features;

  // Seeded random for reproducibility
  const rand = (s: number) => {
    s = ((s * 1103515245 + 12345) & 0x7fffffff);
    return (s / 0x7fffffff);
  };

  let s = seed + tileX * 73856093 + tileY * 19349663;

  // Check each feature rule
  for (const rule of rules) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    if (rand(s) < rule.density) {
      // Spawn feature
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const fx = (rand(s) * 0.8 + 0.1) * tileSize; // Keep away from edges
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const fy = (rand(s) * 0.8 + 0.1) * tileSize;
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const variant = Math.floor(rand(s) * 4); // 4 variants per feature

      features.push({
        type: rule.feature,
        x: fx,
        y: fy,
        variant,
      });
    }
  }

  return features;
}

// Color blending for smooth biome transitions (fallback when no textures)
export const BIOME_BLEND_COLORS: Record<Biome, { r: number; g: number; b: number }> = {
  SEA: { r: 10, g: 42, b: 74 },
  SHORE: { r: 194, g: 178, b: 128 },
  RIVER: { r: 26, g: 74, b: 106 },
  LOWLAND: { r: 61, g: 43, b: 31 },
  GRASS: { r: 45, g: 77, b: 31 },
  SWAMP: { r: 26, g: 47, b: 26 },
  FOREST: { r: 26, g: 58, b: 26 },
  MOUNTAIN: { r: 74, g: 74, b: 74 },
  SNOW: { r: 208, g: 216, b: 224 },
  TOWN: { r: 90, g: 90, b: 96 },
};

// Blend two biome colors based on distance to edge
export function blendBiomeColors(
  biome1: Biome,
  biome2: Biome,
  t: number // 0 = biome1, 1 = biome2
): string {
  const c1 = BIOME_BLEND_COLORS[biome1];
  const c2 = BIOME_BLEND_COLORS[biome2];
  const r = Math.floor(c1.r + (c2.r - c1.r) * t);
  const g = Math.floor(c1.g + (c2.g - c1.g) * t);
  const b = Math.floor(c1.b + (c2.b - c1.b) * t);
  return `rgb(${r},${g},${b})`;
}

// Feature rendering colors (fallback)
export const FEATURE_COLORS: Partial<Record<TerrainFeature, string>> = {
  TREE_DECIDUOUS: '#2d5a1f',
  TREE_PINE: '#1a4a2a',
  TREE_DEAD: '#3a3a3a',
  TREE_PALM: '#4a7a3a',
  ROCKS_SMALL: '#6a6a6a',
  ROCKS_LARGE: '#5a5a5a',
  BOULDER: '#4a4a4a',
  BUSH: '#3a6a2a',
  FLOWERS: '#ff6b9d',
  MUSHROOMS: '#8b4a8b',
  TALL_GRASS: '#4a8a3a',
  RUINS_PILLAR: '#7a7a6a',
  RUINS_WALL: '#6a6a5a',
  RUINS_FLOOR: '#8a8a7a',
  WATER_LILY: '#4a9a4a',
  REEDS: '#6a8a4a',
  SNOW_DRIFT: '#e8f0f8',
  ICE_PATCH: '#a8d8f8',
  FROZEN_TREE: '#8ab8c8',
  BONES: '#d8d8c8',
  SKULL: '#e8e8d8',
  CAMP_TENT: '#8b6b4b',
  CAMP_FIRE: '#ff6b2b',
  PATH_STONE: '#8a8a8a',
  PATH_DIRT: '#6a5a4a',
};
