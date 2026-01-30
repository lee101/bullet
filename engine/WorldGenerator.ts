
import { Biome, Vec2, CityStyle, Campfire, Torch } from '../types';
import { worldPerf } from './perf';

// Chunk-based procedural world with lazy generation
const CHUNK_SIZE = 16; // tiles per chunk
const TILE_SIZE = 40;
const CHUNK_WORLD_SIZE = CHUNK_SIZE * TILE_SIZE; // 640 world units
const UNLOAD_DISTANCE = 3; // chunks beyond view to keep loaded

class SeededRandom {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
}

class PerlinNoise {
  private perm: number[] = [];

  constructor(seed: number) {
    const rng = new SeededRandom(seed);
    const p = Array.from({ length: 256 }, (_, i) => i);
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

  fbm(x: number, y: number, octaves: number = 3): number {
    let value = this.noise2D(x, y);
    if (octaves < 2) return value;
    value += 0.5 * this.noise2D(x * 2, y * 2);
    if (octaves < 3) return value / 1.5;
    value += 0.25 * this.noise2D(x * 4, y * 4);
    return value / 1.75;
  }
}

interface Chunk {
  cx: number;
  cy: number;
  heightMap: Float32Array;
  moistureMap: Float32Array;
  biomes: Biome[];
  lastAccess: number;
}

export interface Town {
  id: number;
  name: string;
  pos: Vec2;
  radius: number;
  style: CityStyle;
}

export interface TerrainTile {
  biome: Biome;
  edgeCode: number;
  variant: number;
  features: unknown[];
  neighbors: { n: Biome; e: Biome; s: Biome; w: Biome };
}

export class WorldGenerator {
  private seed: number;
  private noise: PerlinNoise;
  private moistureNoise: PerlinNoise;
  private spawnRng: SeededRandom;
  private shoreRng: SeededRandom;
  public readonly gridSize = TILE_SIZE;
  public towns: Town[] = [];
  public campfires: Campfire[] = [];
  public torches: Torch[] = [];
  private chunks: Map<string, Chunk> = new Map();
  private nextId = 0;
  private frameCount = 0;
  private spawnableCache: Vec2[] = [];
  private spawnableFillInProgress = false;
  private spawnableTarget = 0;

  constructor(seed = Math.random() * 10000) {
    this.seed = seed;
    this.noise = new PerlinNoise(seed);
    this.moistureNoise = new PerlinNoise(seed + 1000);
    this.spawnRng = new SeededRandom(seed + 1337);
    this.shoreRng = new SeededRandom(seed + 9000);
    this.placeTowns();
    this.placeCampfires();
    this.placeTorches();
  }

  private chunkKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private getChunk(cx: number, cy: number): Chunk {
    const key = this.chunkKey(cx, cy);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = this.generateChunk(cx, cy);
      this.chunks.set(key, chunk);
    }
    chunk.lastAccess = this.frameCount;
    return chunk;
  }

  private generateChunk(cx: number, cy: number): Chunk {
    const start = worldPerf.start('world:generateChunk');
    const size = CHUNK_SIZE * CHUNK_SIZE;
    const heightMap = new Float32Array(size);
    const moistureMap = new Float32Array(size);
    const biomes: Biome[] = new Array(size);

    const worldStartX = cx * CHUNK_WORLD_SIZE;
    const worldStartY = cy * CHUNK_WORLD_SIZE;

    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const worldX = worldStartX + lx * TILE_SIZE;
        const worldY = worldStartY + ly * TILE_SIZE;
        const idx = ly * CHUNK_SIZE + lx;

        // Normalized coords for noise (scale to ~16k world)
        const nx = worldX / 16000;
        const ny = worldY / 16000;

        // Height with falloff from center
        const dx = (nx - 0.5) * 2;
        const dy = (ny - 0.5) * 2;
        const distSq = dx * dx + dy * dy;

        let height = (this.noise.fbm(nx * 4, ny * 4, 3) + 1) * 0.5;
        height *= Math.max(0, 1 - distSq * distSq);
        height += Math.abs(this.noise.fbm(nx * 2, ny * 2, 2)) * 0.15;
        height = Math.max(0, Math.min(1, height));

        const moisture = (this.moistureNoise.fbm(nx * 3, ny * 3, 2) + 1) * 0.5;

        heightMap[idx] = height;
        moistureMap[idx] = moisture;
        biomes[idx] = this.computeBiome(worldX, worldY, height, moisture);
      }
    }

    const chunk = { cx, cy, heightMap, moistureMap, biomes, lastAccess: this.frameCount };
    worldPerf.end('world:generateChunk', start, { force: true });
    return chunk;
  }

  private computeBiome(worldX: number, worldY: number, height: number, moisture: number): Biome {
    // Check towns
    for (const town of this.towns) {
      const dist = Math.sqrt((worldX - town.pos.x) ** 2 + (worldY - town.pos.y) ** 2);
      if (dist < town.radius) return 'TOWN';
    }

    if (height < 0.12) return 'SEA';
    if (height < 0.18) return 'SHORE';
    if (height > 0.75) return 'SNOW';
    if (height > 0.6) return 'MOUNTAIN';
    if (moisture > 0.65 && height < 0.4) return 'SWAMP';
    if (moisture > 0.5 && height > 0.35) return 'FOREST';
    if (height < 0.3) return 'LOWLAND';
    return 'GRASS';
  }

  private placeTowns() {
    const rng = new SeededRandom(this.seed + 5000);
    const configs: { name: string; style: CityStyle }[] = [
      { name: 'Citadel Bazaar', style: 'MEDIEVAL' },
      { name: 'Sun Spire', style: 'DESERT' },
      { name: 'Jade Temple', style: 'ASIAN' },
      { name: 'Frostheim', style: 'NORDIC' },
      { name: 'Silverleaf', style: 'ELVEN' },
      { name: 'Irondeep', style: 'DWARVEN' },
    ];

    // Center town
    this.towns.push({
      id: 0,
      name: configs[0].name,
      pos: { x: 8000, y: 8000 },
      radius: 400,
      style: configs[0].style
    });

    // Other towns at fixed angles from center
    for (let i = 1; i < configs.length; i++) {
      const angle = (i / (configs.length - 1)) * Math.PI * 2 + rng.next() * 0.3;
      const dist = 2500 + rng.next() * 2000;
      this.towns.push({
        id: i,
        name: configs[i].name,
        pos: { x: 8000 + Math.cos(angle) * dist, y: 8000 + Math.sin(angle) * dist },
        radius: 300 + rng.next() * 100,
        style: configs[i].style
      });
    }
  }

  private placeCampfires() {
    const rng = new SeededRandom(this.seed + 3000);
    for (let i = 0; i < 15; i++) {
      const angle = rng.next() * Math.PI * 2;
      const dist = 1000 + rng.next() * 5000;
      this.campfires.push({
        id: this.nextId++,
        pos: { x: 8000 + Math.cos(angle) * dist, y: 8000 + Math.sin(angle) * dist },
        radius: 60
      });
    }
  }

  private placeTorches() {
    for (const town of this.towns) {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        this.torches.push({
          id: this.nextId++,
          pos: {
            x: town.pos.x + Math.cos(angle) * (town.radius - 20),
            y: town.pos.y + Math.sin(angle) * (town.radius - 20)
          },
          flicker: Math.random()
        });
      }
    }
  }

  private generateSpawnablePosition(): Vec2 {
    const rng = this.spawnRng;
    for (let i = 0; i < 50; i++) {
      const angle = rng.next() * Math.PI * 2;
      const dist = 500 + rng.next() * 1500;
      const x = 8000 + Math.cos(angle) * dist;
      const y = 8000 + Math.sin(angle) * dist;
      const biome = this.getBiomeAt(x, y);
      if (biome !== 'SEA' && biome !== 'MOUNTAIN' && biome !== 'SNOW' && biome !== 'RIVER' && biome !== 'TOWN') {
        return { x, y };
      }
    }
    return { x: 8600, y: 8600 };
  }

  public prefillSpawnablePositions(count: number = 40): void {
    this.spawnableTarget = Math.max(this.spawnableTarget, count);
    if (this.spawnableFillInProgress) return;
    if (typeof performance === 'undefined') {
      while (this.spawnableCache.length < this.spawnableTarget) {
        this.spawnableCache.push(this.generateSpawnablePosition());
      }
      this.spawnableFillInProgress = false;
      return;
    }

    const schedule = (cb: (deadline?: IdleDeadline) => void) => {
      const ric = (globalThis as typeof globalThis & { requestIdleCallback?: (cb: IdleRequestCallback, opts?: IdleRequestOptions) => number }).requestIdleCallback;
      if (ric) {
        ric(cb, { timeout: 120 });
      } else {
        setTimeout(() => cb(undefined), 0);
      }
    };

    this.spawnableFillInProgress = true;
    const fill = (deadline?: IdleDeadline) => {
      const start = performance.now();
      const budget = deadline ? Math.max(4, deadline.timeRemaining()) : 8;
      while (this.spawnableCache.length < this.spawnableTarget) {
        this.spawnableCache.push(this.generateSpawnablePosition());
        if (deadline) {
          if (deadline.timeRemaining() < 3) break;
        } else if (performance.now() - start > budget) {
          break;
        }
      }

      if (this.spawnableCache.length < this.spawnableTarget) {
        schedule(fill);
      } else {
        this.spawnableFillInProgress = false;
      }
    };

    schedule(fill);
  }

  public getBiomeAt(worldX: number, worldY: number): Biome {
    const cx = Math.floor(worldX / CHUNK_WORLD_SIZE);
    const cy = Math.floor(worldY / CHUNK_WORLD_SIZE);
    const chunk = this.getChunk(cx, cy);

    const lx = Math.floor((worldX - cx * CHUNK_WORLD_SIZE) / TILE_SIZE);
    const ly = Math.floor((worldY - cy * CHUNK_WORLD_SIZE) / TILE_SIZE);
    const idx = Math.max(0, Math.min(CHUNK_SIZE - 1, ly)) * CHUNK_SIZE + Math.max(0, Math.min(CHUNK_SIZE - 1, lx));

    return chunk.biomes[idx] || 'GRASS';
  }

  public getBiomeAtFast(worldX: number, worldY: number): Biome {
    return this.getBiomeAt(worldX, worldY);
  }

  public getSpawnablePosition(): Vec2 {
    if (this.spawnableCache.length > 0) {
      const pos = this.spawnableCache.pop()!;
      if (this.spawnableCache.length < 10) this.prefillSpawnablePositions(40);
      return pos;
    }
    const pos = this.generateSpawnablePosition();
    if (this.spawnableCache.length < 10) this.prefillSpawnablePositions(40);
    return pos;
  }

  public getRandomShorePosition(maxAttempts: number = 8): Vec2 | null {
    for (let i = 0; i < maxAttempts; i++) {
      const x = 500 + this.shoreRng.next() * 15000;
      const y = 500 + this.shoreRng.next() * 15000;
      if (this.getBiomeAt(x, y) === 'SHORE') return { x, y };
    }
    return null;
  }

  public getShorePositions(count: number): Vec2[] {
    const positions: Vec2[] = [];
    for (let i = 0; i < count * 20 && positions.length < count; i++) {
      const x = 500 + this.shoreRng.next() * 15000;
      const y = 500 + this.shoreRng.next() * 15000;
      if (this.getBiomeAt(x, y) === 'SHORE') positions.push({ x, y });
    }
    return positions;
  }

  public getTowns(): Town[] { return this.towns; }
  public getCampfires(): Campfire[] { return this.campfires; }
  public getTorches(): Torch[] { return this.torches; }

  public getTileAt(worldX: number, worldY: number): TerrainTile {
    const biome = this.getBiomeAt(worldX, worldY);
    return {
      biome,
      edgeCode: 0,
      variant: 0,
      features: [],
      neighbors: { n: biome, e: biome, s: biome, w: biome }
    };
  }

  public getInterpolatedHeight(worldX: number, worldY: number): number {
    const cx = Math.floor(worldX / CHUNK_WORLD_SIZE);
    const cy = Math.floor(worldY / CHUNK_WORLD_SIZE);
    const chunk = this.getChunk(cx, cy);
    const lx = Math.floor((worldX - cx * CHUNK_WORLD_SIZE) / TILE_SIZE);
    const ly = Math.floor((worldY - cy * CHUNK_WORLD_SIZE) / TILE_SIZE);
    const idx = Math.max(0, Math.min(CHUNK_SIZE * CHUNK_SIZE - 1, ly * CHUNK_SIZE + lx));
    return chunk.heightMap[idx] || 0.3;
  }

  public getTransitionBlend(worldX: number, worldY: number): { primary: Biome; secondary: Biome | null; blend: number } {
    const biome = this.getBiomeAt(worldX, worldY);
    const localX = ((worldX % TILE_SIZE) + TILE_SIZE) % TILE_SIZE / TILE_SIZE;
    const localY = ((worldY % TILE_SIZE) + TILE_SIZE) % TILE_SIZE / TILE_SIZE;
    const edgeThresh = 0.25;
    let secondary: Biome | null = null;
    let blend = 0;

    if (localX < edgeThresh) {
      const n = this.getBiomeAt(worldX - TILE_SIZE, worldY);
      if (n !== biome) { secondary = n; blend = 1 - localX / edgeThresh; }
    } else if (localX > 1 - edgeThresh) {
      const n = this.getBiomeAt(worldX + TILE_SIZE, worldY);
      if (n !== biome) { secondary = n; blend = (localX - (1 - edgeThresh)) / edgeThresh; }
    }
    if (!secondary && localY < edgeThresh) {
      const n = this.getBiomeAt(worldX, worldY - TILE_SIZE);
      if (n !== biome) { secondary = n; blend = 1 - localY / edgeThresh; }
    } else if (!secondary && localY > 1 - edgeThresh) {
      const n = this.getBiomeAt(worldX, worldY + TILE_SIZE);
      if (n !== biome) { secondary = n; blend = (localY - (1 - edgeThresh)) / edgeThresh; }
    }

    return { primary: biome, secondary, blend: Math.min(1, blend * 0.5) };
  }

  public getVisibleTiles(camX: number, camY: number, viewWidth: number, viewHeight: number): { x: number; y: number; tile: TerrainTile }[] {
    const tiles: { x: number; y: number; tile: TerrainTile }[] = [];
    const startX = Math.floor(camX / TILE_SIZE);
    const startY = Math.floor(camY / TILE_SIZE);
    const endX = Math.ceil((camX + viewWidth) / TILE_SIZE) + 1;
    const endY = Math.ceil((camY + viewHeight) / TILE_SIZE) + 1;

    for (let tx = startX; tx < endX; tx++) {
      for (let ty = startY; ty < endY; ty++) {
        const worldX = tx * TILE_SIZE;
        const worldY = ty * TILE_SIZE;
        tiles.push({ x: worldX, y: worldY, tile: this.getTileAt(worldX, worldY) });
      }
    }
    return tiles;
  }

  public getDetailNoise(worldX: number, worldY: number, scale: number = 0.1): number {
    return this.noise.fbm(worldX * scale, worldY * scale, 2);
  }

  // Call each frame to track chunk access and unload old chunks
  public update(camX: number, camY: number, viewWidth: number, viewHeight: number) {
    this.frameCount++;
    if (this.frameCount % 60 !== 0) return; // Check every second

    const centerCx = Math.floor((camX + viewWidth / 2) / CHUNK_WORLD_SIZE);
    const centerCy = Math.floor((camY + viewHeight / 2) / CHUNK_WORLD_SIZE);

    // Unload chunks far from camera
    for (const [key, chunk] of this.chunks) {
      const dist = Math.max(Math.abs(chunk.cx - centerCx), Math.abs(chunk.cy - centerCy));
      if (dist > UNLOAD_DISTANCE) {
        this.chunks.delete(key);
      }
    }
  }
}
