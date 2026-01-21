
import { Biome, Vec2, TownState, CityStyle, Campfire } from '../types';
import { WORLD_WIDTH, WORLD_HEIGHT, TOWN_RADIUS } from '../constants';
import { TerrainTile, TerrainFeature, generateTileFeatures, getEdgeCode, getTileVariant, BIOME_FEATURES } from './TerrainTiles';

// Simple seeded random for reproducible noise
class SeededRandom {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
}

// Perlin-style noise implementation
class PerlinNoise {
  private perm: number[] = [];

  constructor(seed: number) {
    const rng = new SeededRandom(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);
    // Shuffle
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = [...p, ...p];
  }

  private fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
  private lerp(a: number, b: number, t: number): number { return a + t * (b - a); }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }

  noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = this.fade(xf);
    const v = this.fade(yf);
    const aa = this.perm[this.perm[X] + Y];
    const ab = this.perm[this.perm[X] + Y + 1];
    const ba = this.perm[this.perm[X + 1] + Y];
    const bb = this.perm[this.perm[X + 1] + Y + 1];
    return this.lerp(
      this.lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u),
      this.lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u),
      v
    );
  }

  // Fractal Brownian Motion - multiple octaves for natural terrain
  fbm(x: number, y: number, octaves: number = 6, lacunarity: number = 2, persistence: number = 0.5): number {
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
}

export interface Town {
  id: number;
  name: string;
  pos: Vec2;
  radius: number;
  style: CityStyle;
}

export class WorldGenerator {
  private seed: number;
  private noise: PerlinNoise;
  private moistureNoise: PerlinNoise;
  private temperatureNoise: PerlinNoise;
  private heightMap: Float32Array;
  private moistureMap: Float32Array;
  public readonly gridSize = 40;
  private cols: number;
  private rows: number;
  public towns: Town[] = [];
  public campfires: Campfire[] = [];
  private riverMap: Set<number> = new Set();
  private nextId: number = 0;

  constructor(seed = Math.random() * 10000) {
    this.seed = seed;
    this.noise = new PerlinNoise(seed);
    this.moistureNoise = new PerlinNoise(seed + 1000);
    this.temperatureNoise = new PerlinNoise(seed + 2000);
    this.cols = Math.ceil(WORLD_WIDTH / this.gridSize);
    this.rows = Math.ceil(WORLD_HEIGHT / this.gridSize);
    this.heightMap = new Float32Array(this.cols * this.rows);
    this.moistureMap = new Float32Array(this.cols * this.rows);
    this.generate();
  }

  private generate() {
    // Generate base terrain with FBM
    for (let x = 0; x < this.cols; x++) {
      for (let y = 0; y < this.rows; y++) {
        const nx = x / this.cols;
        const ny = y / this.rows;

        // Distance from center for island falloff
        const dx = (nx - 0.5) * 2;
        const dy = (ny - 0.5) * 2;
        const distFromCenter = Math.sqrt(dx * dx + dy * dy);

        // Multi-octave noise for terrain
        let height = this.noise.fbm(nx * 4, ny * 4, 6, 2, 0.5);
        height = (height + 1) * 0.5; // Normalize to 0-1

        // Island falloff - creates oceans around edges
        const falloff = 1 - Math.pow(distFromCenter, 1.5);
        height = height * falloff;

        // Add some continental ridges
        const ridgeNoise = Math.abs(this.noise.fbm(nx * 2, ny * 2, 4));
        height += ridgeNoise * 0.15;

        // Moisture for biome determination
        const moisture = (this.moistureNoise.fbm(nx * 3, ny * 3, 4) + 1) * 0.5;

        const idx = y * this.cols + x;
        this.heightMap[idx] = Math.max(0, Math.min(1, height));
        this.moistureMap[idx] = moisture;
      }
    }

    // Place towns in suitable locations (grass/lowland, not too close together)
    this.placeTowns();

    // Carve mountain ranges around towns
    this.carveMountainRanges();

    // Generate rivers from mountains to sea
    this.generateRivers();

    // Place campfires throughout the world
    this.placeCampfires();
  }

  private placeTowns() {
    const townConfigs: { name: string; style: CityStyle }[] = [
      { name: 'Citadel Bazaar', style: 'MEDIEVAL' },
      { name: 'Sun Spire', style: 'DESERT' },
      { name: 'Jade Temple', style: 'ASIAN' },
      { name: 'Frostheim', style: 'NORDIC' },
      { name: 'Silverleaf', style: 'ELVEN' },
      { name: 'Irondeep', style: 'DWARVEN' },
      { name: 'Sandwatch', style: 'DESERT' },
      { name: 'Mistpeak', style: 'ASIAN' },
    ];

    const minTownDist = 3000;
    const attempts = 500;
    let townId = 0;

    this.towns.push({
      id: townId++,
      name: townConfigs[0].name,
      pos: { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 },
      radius: TOWN_RADIUS,
      style: townConfigs[0].style
    });

    for (let i = 1; i < townConfigs.length && townId < 6; i++) {
      for (let a = 0; a < attempts; a++) {
        const x = 1500 + Math.random() * (WORLD_WIDTH - 3000);
        const y = 1500 + Math.random() * (WORLD_HEIGHT - 3000);

        const height = this.getHeightAt(x, y);
        if (height < 0.25 || height > 0.65) continue;

        let tooClose = false;
        for (const town of this.towns) {
          const dist = Math.sqrt((x - town.pos.x) ** 2 + (y - town.pos.y) ** 2);
          if (dist < minTownDist) { tooClose = true; break; }
        }
        if (tooClose) continue;

        // Style based on biome/location
        let style = townConfigs[i].style;
        const moisture = this.getMoistureAt(x, y);
        if (height > 0.55) style = 'NORDIC';
        else if (moisture < 0.3) style = 'DESERT';
        else if (moisture > 0.6) style = 'ELVEN';

        this.towns.push({
          id: townId++,
          name: townConfigs[i].name,
          pos: { x, y },
          radius: TOWN_RADIUS * (0.8 + Math.random() * 0.4),
          style
        });
        break;
      }
    }
  }

  private carveMountainRanges() {
    // Create mountain ranges around each town (partial rings)
    for (const town of this.towns) {
      const numPeaks = 8 + Math.floor(Math.random() * 6);
      const baseRadius = town.radius + 400;

      for (let i = 0; i < numPeaks; i++) {
        // Create gaps in the mountain ring
        const gapChance = Math.random();
        if (gapChance < 0.25) continue; // 25% chance of gap

        const angle = (i / numPeaks) * Math.PI * 2 + Math.random() * 0.3;
        const radius = baseRadius + Math.random() * 600;
        const peakX = town.pos.x + Math.cos(angle) * radius;
        const peakY = town.pos.y + Math.sin(angle) * radius;

        // Raise terrain around this peak
        this.raiseMountain(peakX, peakY, 200 + Math.random() * 300);
      }
    }
  }

  private raiseMountain(cx: number, cy: number, radius: number) {
    const tileRadius = Math.ceil(radius / this.gridSize);
    const tcx = Math.floor(cx / this.gridSize);
    const tcy = Math.floor(cy / this.gridSize);

    for (let dx = -tileRadius; dx <= tileRadius; dx++) {
      for (let dy = -tileRadius; dy <= tileRadius; dy++) {
        const tx = tcx + dx;
        const ty = tcy + dy;
        if (tx < 0 || tx >= this.cols || ty < 0 || ty >= this.rows) continue;

        const worldX = tx * this.gridSize;
        const worldY = ty * this.gridSize;
        const dist = Math.sqrt((worldX - cx) ** 2 + (worldY - cy) ** 2);

        if (dist < radius) {
          const idx = ty * this.cols + tx;
          const influence = 1 - (dist / radius);
          const raise = influence * influence * 0.4;
          this.heightMap[idx] = Math.min(1, this.heightMap[idx] + raise);
        }
      }
    }
  }

  private generateRivers() {
    // Start rivers from high points and flow to sea
    const numRivers = 12;

    for (let r = 0; r < numRivers; r++) {
      // Find a high starting point
      let startX = 0, startY = 0, maxHeight = 0;
      for (let a = 0; a < 50; a++) {
        const x = Math.floor(Math.random() * this.cols);
        const y = Math.floor(Math.random() * this.rows);
        const h = this.heightMap[y * this.cols + x];
        if (h > 0.6 && h > maxHeight) {
          maxHeight = h;
          startX = x;
          startY = y;
        }
      }

      if (maxHeight < 0.5) continue;

      // Flow downhill
      let x = startX, y = startY;
      const visited = new Set<number>();

      for (let step = 0; step < 500; step++) {
        const idx = y * this.cols + x;
        if (visited.has(idx)) break;
        visited.add(idx);

        const height = this.heightMap[idx];
        if (height < 0.15) break; // Reached sea

        this.riverMap.add(idx);

        // Find lowest neighbor
        let lowestH = height;
        let nextX = x, nextY = y;

        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows) continue;
          const nh = this.heightMap[ny * this.cols + nx];
          if (nh < lowestH) {
            lowestH = nh;
            nextX = nx;
            nextY = ny;
          }
        }

        if (nextX === x && nextY === y) break; // Stuck
        x = nextX;
        y = nextY;
      }
    }
  }

  private getHeightAt(worldX: number, worldY: number): number {
    const x = Math.floor(worldX / this.gridSize);
    const y = Math.floor(worldY / this.gridSize);
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return 0;
    return this.heightMap[y * this.cols + x];
  }

  private getMoistureAt(worldX: number, worldY: number): number {
    const x = Math.floor(worldX / this.gridSize);
    const y = Math.floor(worldY / this.gridSize);
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return 0.5;
    return this.moistureMap[y * this.cols + x];
  }

  public getBiomeAt(worldX: number, worldY: number): Biome {
    // Check towns first
    for (const town of this.towns) {
      const dist = Math.sqrt((worldX - town.pos.x) ** 2 + (worldY - town.pos.y) ** 2);
      if (dist < town.radius) return 'TOWN';
    }

    const x = Math.floor(worldX / this.gridSize);
    const y = Math.floor(worldY / this.gridSize);
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return 'SEA';

    const idx = y * this.cols + x;
    const height = this.heightMap[idx];
    const moisture = this.moistureMap[idx];

    // Check for river
    if (this.riverMap.has(idx)) return 'RIVER';

    // Height-based biomes
    if (height < 0.12) return 'SEA';
    if (height < 0.18) return 'SHORE';
    if (height > 0.75) return 'SNOW';
    if (height > 0.6) return 'MOUNTAIN';

    // Moisture + height based biomes
    if (moisture > 0.65 && height < 0.4) return 'SWAMP';
    if (moisture > 0.5 && height > 0.35) return 'FOREST';
    if (height < 0.3) return 'LOWLAND';

    return 'GRASS';
  }

  public getSpawnablePosition(): Vec2 {
    let attempts = 0;
    while (attempts < 200) {
      const x = 500 + Math.random() * (WORLD_WIDTH - 1000);
      const y = 500 + Math.random() * (WORLD_HEIGHT - 1000);
      const biome = this.getBiomeAt(x, y);
      if (biome !== 'SEA' && biome !== 'MOUNTAIN' && biome !== 'SNOW' && biome !== 'RIVER' && biome !== 'TOWN') {
        return { x, y };
      }
      attempts++;
    }
    // Fallback to near first town
    const town = this.towns[0];
    return { x: town.pos.x + 600, y: town.pos.y + 600 };
  }

  public getShorePositions(count: number): Vec2[] {
    const positions: Vec2[] = [];
    let attempts = 0;

    while (positions.length < count && attempts < count * 20) {
      const x = 500 + Math.random() * (WORLD_WIDTH - 1000);
      const y = 500 + Math.random() * (WORLD_HEIGHT - 1000);
      const biome = this.getBiomeAt(x, y);
      if (biome === 'SHORE') {
        positions.push({ x, y });
      }
      attempts++;
    }

    return positions;
  }

  public getTowns(): Town[] {
    return this.towns;
  }

  private placeCampfires() {
    const numCampfires = 40;
    for (let i = 0; i < numCampfires; i++) {
      const pos = this.getSpawnablePosition();
      const biome = this.getBiomeAt(pos.x, pos.y);
      if (biome === 'TOWN') continue;
      this.campfires.push({
        id: this.nextId++,
        pos,
        radius: 60
      });
    }
  }

  public getCampfires(): Campfire[] {
    return this.campfires;
  }

  // Get full tile data with neighbors, edge code, and features
  public getTileAt(worldX: number, worldY: number): TerrainTile {
    const tileX = Math.floor(worldX / this.gridSize);
    const tileY = Math.floor(worldY / this.gridSize);
    const biome = this.getBiomeAt(worldX, worldY);

    // Get neighbor biomes
    const n = this.getBiomeAt(worldX, worldY - this.gridSize);
    const e = this.getBiomeAt(worldX + this.gridSize, worldY);
    const s = this.getBiomeAt(worldX, worldY + this.gridSize);
    const w = this.getBiomeAt(worldX - this.gridSize, worldY);

    // Calculate edge code (which edges border different biomes)
    const edgeCode = getEdgeCode(n !== biome, e !== biome, s !== biome, w !== biome);
    const variant = getTileVariant(tileX, tileY, 4);

    // Generate features for this tile
    const features = generateTileFeatures(biome, tileX, tileY, this.gridSize, this.seed);

    return {
      biome,
      edgeCode,
      variant,
      features,
      neighbors: { n, e, s, w }
    };
  }

  // Get interpolated height for smooth transitions
  public getInterpolatedHeight(worldX: number, worldY: number): number {
    const x = worldX / this.gridSize;
    const y = worldY / this.gridSize;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;

    const h00 = this.getHeightAtTile(x0, y0);
    const h10 = this.getHeightAtTile(x0 + 1, y0);
    const h01 = this.getHeightAtTile(x0, y0 + 1);
    const h11 = this.getHeightAtTile(x0 + 1, y0 + 1);

    // Bilinear interpolation
    const h0 = h00 + (h10 - h00) * fx;
    const h1 = h01 + (h11 - h01) * fx;
    return h0 + (h1 - h0) * fy;
  }

  private getHeightAtTile(tx: number, ty: number): number {
    if (tx < 0 || tx >= this.cols || ty < 0 || ty >= this.rows) return 0;
    return this.heightMap[ty * this.cols + tx];
  }

  // Get transition blend factor for smooth biome edges
  public getTransitionBlend(worldX: number, worldY: number): { primary: Biome; secondary: Biome | null; blend: number } {
    const biome = this.getBiomeAt(worldX, worldY);
    const tileX = Math.floor(worldX / this.gridSize);
    const tileY = Math.floor(worldY / this.gridSize);

    // Check distance to tile edges
    const localX = (worldX % this.gridSize) / this.gridSize;
    const localY = (worldY % this.gridSize) / this.gridSize;

    // Edge detection threshold
    const edgeThresh = 0.25;
    let secondary: Biome | null = null;
    let blend = 0;

    // Check if near any edge and get neighbor biome
    if (localX < edgeThresh) {
      const neighbor = this.getBiomeAt(worldX - this.gridSize, worldY);
      if (neighbor !== biome) {
        secondary = neighbor;
        blend = 1 - (localX / edgeThresh);
      }
    } else if (localX > 1 - edgeThresh) {
      const neighbor = this.getBiomeAt(worldX + this.gridSize, worldY);
      if (neighbor !== biome) {
        secondary = neighbor;
        blend = (localX - (1 - edgeThresh)) / edgeThresh;
      }
    }

    if (localY < edgeThresh && !secondary) {
      const neighbor = this.getBiomeAt(worldX, worldY - this.gridSize);
      if (neighbor !== biome) {
        secondary = neighbor;
        blend = 1 - (localY / edgeThresh);
      }
    } else if (localY > 1 - edgeThresh && !secondary) {
      const neighbor = this.getBiomeAt(worldX, worldY + this.gridSize);
      if (neighbor !== biome) {
        secondary = neighbor;
        blend = (localY - (1 - edgeThresh)) / edgeThresh;
      }
    }

    return { primary: biome, secondary, blend: Math.min(1, blend * 0.5) };
  }

  // Get all visible tiles in a viewport with their full data
  public getVisibleTiles(camX: number, camY: number, viewWidth: number, viewHeight: number): { x: number; y: number; tile: TerrainTile }[] {
    const tiles: { x: number; y: number; tile: TerrainTile }[] = [];
    const startX = Math.floor(camX / this.gridSize);
    const startY = Math.floor(camY / this.gridSize);
    const endX = Math.ceil((camX + viewWidth) / this.gridSize) + 1;
    const endY = Math.ceil((camY + viewHeight) / this.gridSize) + 1;

    for (let tx = startX; tx < endX; tx++) {
      for (let ty = startY; ty < endY; ty++) {
        const worldX = tx * this.gridSize;
        const worldY = ty * this.gridSize;
        tiles.push({
          x: worldX,
          y: worldY,
          tile: this.getTileAt(worldX, worldY)
        });
      }
    }

    return tiles;
  }

  // Get procedural detail noise for a position (for adding variation within tiles)
  public getDetailNoise(worldX: number, worldY: number, scale: number = 0.1): number {
    return this.noise.fbm(worldX * scale, worldY * scale, 3, 2, 0.5);
  }
}
