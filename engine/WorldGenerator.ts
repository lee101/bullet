
import { Biome, Vec2 } from '../types';
import { WORLD_WIDTH, WORLD_HEIGHT, TOWN_RADIUS } from '../constants';

export class WorldGenerator {
  private seed: number;
  private noiseMap: number[][] = [];
  public readonly gridSize = 40;
  private cols = Math.floor(WORLD_WIDTH / this.gridSize);
  private rows = Math.floor(WORLD_HEIGHT / this.gridSize);

  constructor(seed = Math.random()) {
    this.seed = seed;
    this.generate();
  }

  private generate() {
    const tempNoise = Array.from({ length: this.cols }, () => new Float32Array(this.rows));
    
    for (let x = 0; x < this.cols; x++) {
      for (let y = 0; y < this.rows; y++) {
        const dx = (x - this.cols / 2) / (this.cols / 2);
        const dy = (y - this.rows / 2) / (this.rows / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        let val = (
          Math.sin(x * 0.1) * Math.cos(y * 0.1) * 0.5 +
          Math.sin(x * 0.03 + this.seed) * Math.sin(y * 0.05) * 0.3 +
          Math.cos(x * 0.01) * Math.sin(y * 0.02) * 0.2
        );
        
        val = (val + 0.5) * (1 - dist * dist);
        
        tempNoise[x][y] = Math.max(0, val);
      }
    }
    this.noiseMap = tempNoise as unknown as number[][];
  }

  public getBiomeAt(worldX: number, worldY: number): Biome {
    // Check for town in center
    const centerX = WORLD_WIDTH / 2;
    const centerY = WORLD_HEIGHT / 2;
    const distToCenter = Math.sqrt((worldX - centerX)**2 + (worldY - centerY)**2);
    if (distToCenter < TOWN_RADIUS) return 'TOWN';

    const x = Math.floor(worldX / this.gridSize);
    const y = Math.floor(worldY / this.gridSize);
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return 'SEA';
    
    const h = this.noiseMap[x][y];
    if (h < 0.1) return 'SEA';
    if (h < 0.25) return 'LOWLAND';
    if (h < 0.5) return 'GRASS';
    if (h < 0.75) return 'SWAMP';
    return 'MOUNTAIN';
  }

  public getSpawnablePosition(): Vec2 {
    let attempts = 0;
    while (attempts < 100) {
      const x = Math.random() * WORLD_WIDTH;
      const y = Math.random() * WORLD_HEIGHT;
      const biome = this.getBiomeAt(x, y);
      if (biome !== 'SEA' && biome !== 'MOUNTAIN' && biome !== 'TOWN') {
        return { x, y };
      }
      attempts++;
    }
    return { x: WORLD_WIDTH / 2 + 500, y: WORLD_HEIGHT / 2 + 500 };
  }
}
