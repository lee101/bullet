import { Biome, Vec2 } from '../types';
import { proceduralTerrain } from './ProceduralTerrain';
import { assetPerf } from './perf';

// Multi-layer terrain rendering with procedural generation
export class TerrainRenderer {
  private patternCache: Map<string, CanvasPattern | null> = new Map();
  private textureCache: Map<string, HTMLCanvasElement> = new Map();
  private loaded = false;
  private loading = false;
  private loadPromise: Promise<void> | null = null;
  private worker: Worker | null = null;
  private workerFailed = false;
  private workerJobs: Map<number, { resolve: () => void; reject: (err: Error) => void; biome: Biome; size: number }> = new Map();
  private workerJobId = 0;

  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loading && this.loadPromise) return this.loadPromise;

    this.loading = true;
    this.loadPromise = this._generateTextures();
    await this.loadPromise;
    this.loaded = true;
    this.loading = false;
  }

  private getWorker(): Worker | null {
    if (this.workerFailed) return null;
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined') return null;
    try {
      this.worker = new Worker(new URL('./workers/terrainWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event) => this.handleWorkerMessage(event as MessageEvent);
      this.worker.onerror = (event) => {
        const error = new Error((event as ErrorEvent).message || 'Terrain worker error');
        this.failWorker(error);
      };
      return this.worker;
    } catch {
      this.workerFailed = true;
      this.worker = null;
      return null;
    }
  }

  private failWorker(error: Error) {
    this.workerFailed = true;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    const pending = Array.from(this.workerJobs.values());
    this.workerJobs.clear();
    pending.forEach(job => job.reject(error));
  }

  private handleWorkerMessage(event: MessageEvent) {
    const { id, biome, size, pixels } = event.data as { id: number; biome: Biome; size: number; pixels: Uint8ClampedArray | ArrayBuffer };
    const job = this.workerJobs.get(id);
    if (!job) return;
    this.workerJobs.delete(id);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Unable to create terrain canvas context');
      const pixelArray = pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(pixels);
      const imageData = new ImageData(pixelArray, size, size);
      ctx.putImageData(imageData, 0, 0);
      this.textureCache.set(biome, canvas);
      job.resolve();
    } catch (err) {
      job.reject(err instanceof Error ? err : new Error('Failed to apply terrain pixels'));
    }
  }

  private async generateBiomeMainThread(biome: Biome, size: number): Promise<void> {
    const texture = proceduralTerrain.generateBiomeTexture(biome, size);
    this.textureCache.set(biome, texture);
  }

  private async generateBiomeInWorker(biome: Biome, size: number): Promise<void> {
    const worker = this.getWorker();
    if (!worker) throw new Error('Terrain worker unavailable');
    const id = ++this.workerJobId;
    return new Promise((resolve, reject) => {
      this.workerJobs.set(id, { resolve, reject, biome, size });
      worker.postMessage({ id, biome, size });
    });
  }

  private async generateBiome(biome: Biome, size: number): Promise<void> {
    const worker = this.getWorker();
    if (!worker) {
      await this.generateBiomeMainThread(biome, size);
      return;
    }
    try {
      await this.generateBiomeInWorker(biome, size);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Terrain worker failed');
      this.failWorker(error);
      await this.generateBiomeMainThread(biome, size);
    }
  }

  private async yieldToMain(): Promise<void> {
    await new Promise(resolve => {
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => resolve(undefined));
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  private async _generateTextures(): Promise<void> {
    const start = assetPerf.start('terrain:generate');
    // Pre-generate procedural textures for all biomes
    // Generate in two batches to allow UI updates between
    const criticalBiomes: Biome[] = ['GRASS', 'FOREST', 'MOUNTAIN', 'SEA', 'RIVER'];
    const secondaryBiomes: Biome[] = ['SNOW', 'SHORE', 'SWAMP', 'LOWLAND', 'TOWN'];

    // Generate critical biomes first (smaller size for faster initial load)
    await Promise.all(criticalBiomes.map(biome => this.generateBiome(biome, 128)));

    // Yield to allow other tasks
    await this.yieldToMain();

    // Generate secondary biomes
    await Promise.all(secondaryBiomes.map(biome => this.generateBiome(biome, 128)));

    console.log('TerrainRenderer: procedural textures generated');
    assetPerf.end('terrain:generate', start, { force: true });
  }

  private getPattern(ctx: CanvasRenderingContext2D, biome: string): CanvasPattern | null {
    const cacheKey = `pattern_${biome}`;

    if (!this.patternCache.has(cacheKey)) {
      const texture = this.textureCache.get(biome as Biome);
      if (texture) {
        this.patternCache.set(cacheKey, ctx.createPattern(texture, 'repeat'));
      } else {
        this.patternCache.set(cacheKey, null);
      }
    }

    return this.patternCache.get(cacheKey) || null;
  }

  // Main render method for a terrain tile
  renderTile(
    ctx: CanvasRenderingContext2D,
    biome: Biome,
    screenX: number,
    screenY: number,
    size: number,
    neighbors: { n: Biome; e: Biome; s: Biome; w: Biome },
    worldX: number,
    worldY: number
  ): void {
    const pattern = this.getPattern(ctx, biome);

    if (pattern) {
      ctx.save();

      // Apply UV offset based on world position to break up repetition
      const uvScale = 1.0;
      const uvOffsetX = (worldX % 256) * uvScale;
      const uvOffsetY = (worldY % 256) * uvScale;

      ctx.fillStyle = pattern;
      ctx.translate(screenX - uvOffsetX, screenY - uvOffsetY);
      ctx.fillRect(uvOffsetX, uvOffsetY, size, size);

      ctx.restore();

      // Render edge transitions
      this.renderEdgeBlends(ctx, biome, screenX, screenY, size, neighbors, worldX, worldY);
    }
  }

  // Smooth edge blending between different biomes
  private renderEdgeBlends(
    ctx: CanvasRenderingContext2D,
    biome: Biome,
    screenX: number,
    screenY: number,
    size: number,
    neighbors: { n: Biome; e: Biome; s: Biome; w: Biome },
    worldX: number,
    worldY: number
  ): void {
    const blendSize = size * 0.35;

    ctx.save();

    // North edge
    if (neighbors.n !== biome && neighbors.n !== 'SEA') {
      this.blendEdge(ctx, neighbors.n, screenX, screenY, size, blendSize, 'north', worldX, worldY);
    }

    // South edge
    if (neighbors.s !== biome && neighbors.s !== 'SEA') {
      this.blendEdge(ctx, neighbors.s, screenX, screenY + size - blendSize, size, blendSize, 'south', worldX, worldY);
    }

    // East edge
    if (neighbors.e !== biome && neighbors.e !== 'SEA') {
      this.blendEdge(ctx, neighbors.e, screenX + size - blendSize, screenY, blendSize, size, 'east', worldX, worldY);
    }

    // West edge
    if (neighbors.w !== biome && neighbors.w !== 'SEA') {
      this.blendEdge(ctx, neighbors.w, screenX, screenY, blendSize, size, 'west', worldX, worldY);
    }

    ctx.restore();
  }

  private blendEdge(
    ctx: CanvasRenderingContext2D,
    neighborBiome: Biome,
    x: number,
    y: number,
    width: number,
    height: number,
    direction: 'north' | 'south' | 'east' | 'west',
    worldX: number,
    worldY: number
  ): void {
    const pattern = this.getPattern(ctx, neighborBiome);
    if (!pattern) return;

    ctx.save();

    // Create gradient mask for smooth blend
    let grad: CanvasGradient;
    switch (direction) {
      case 'north':
        grad = ctx.createLinearGradient(x, y, x, y + height);
        break;
      case 'south':
        grad = ctx.createLinearGradient(x, y + height, x, y);
        break;
      case 'east':
        grad = ctx.createLinearGradient(x + width, y, x, y);
        break;
      case 'west':
        grad = ctx.createLinearGradient(x, y, x + width, y);
        break;
    }

    // Add noise-based variation to the gradient
    const noise = this.getBlendNoise(worldX, worldY, direction);
    grad.addColorStop(0, `rgba(255,255,255,${0.7 + noise * 0.2})`);
    grad.addColorStop(0.4, `rgba(255,255,255,${0.3 + noise * 0.1})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');

    // Draw neighbor texture
    const uvOffsetX = (worldX % 256);
    const uvOffsetY = (worldY % 256);

    ctx.fillStyle = pattern;
    ctx.globalAlpha = 0.8;
    ctx.translate(-uvOffsetX, -uvOffsetY);
    ctx.fillRect(x + uvOffsetX, y + uvOffsetY, width, height);
    ctx.translate(uvOffsetX, uvOffsetY);

    // Apply gradient mask
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, width, height);

    ctx.restore();
  }

  private getBlendNoise(worldX: number, worldY: number, direction: string): number {
    // Simple pseudo-random based on position
    const seed = direction === 'north' || direction === 'south' ? worldX : worldY;
    return (Math.sin(seed * 0.03) * 0.5 + 0.5) * 0.3;
  }

  // Animated water rendering
  renderWater(
    ctx: CanvasRenderingContext2D,
    screenX: number,
    screenY: number,
    size: number,
    time: number,
    isDeep: boolean
  ): void {
    const biome: Biome = isDeep ? 'SEA' : 'RIVER';
    const pattern = this.getPattern(ctx, biome);

    if (pattern) {
      ctx.save();

      // Animated UV offset for flowing effect
      const flowSpeed = isDeep ? 0.0005 : 0.001;
      const flowX = Math.sin(time * flowSpeed) * 15;
      const flowY = Math.cos(time * flowSpeed * 0.7) * 10;

      ctx.fillStyle = pattern;
      ctx.translate(screenX + flowX, screenY + flowY);
      ctx.fillRect(-flowX, -flowY, size, size);

      ctx.restore();

      // Add caustic highlights for shallow water
      if (!isDeep) {
        ctx.save();
        ctx.globalAlpha = 0.15 + Math.sin(time * 0.002) * 0.1;
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = '#80c0ff';

        // Animated highlight spots
        const spotTime = time * 0.001;
        for (let i = 0; i < 3; i++) {
          const sx = screenX + (Math.sin(spotTime + i * 2) * 0.5 + 0.5) * size;
          const sy = screenY + (Math.cos(spotTime * 1.3 + i * 2) * 0.5 + 0.5) * size;
          const sr = 10 + Math.sin(spotTime * 2 + i) * 5;

          ctx.beginPath();
          ctx.arc(sx, sy, sr, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    }
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  // Regenerate textures (call if you want different variation)
  regenerate(seed?: number): void {
    this.patternCache.clear();
    this.textureCache.clear();
    proceduralTerrain.clearCache();
    this.loaded = false;
    this.load();
  }
}

export const terrainRenderer = new TerrainRenderer();
