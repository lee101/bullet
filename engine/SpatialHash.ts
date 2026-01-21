
import { Vec2 } from '../types';

interface SpatialEntity {
  id: number;
  pos: Vec2;
  radius?: number;
}

export class SpatialHash<T extends SpatialEntity> {
  private cellSize: number;
  private cells: Map<string, T[]> = new Map();
  private entityCells: Map<number, string[]> = new Map();

  constructor(cellSize: number = 200) {
    this.cellSize = cellSize;
  }

  private getKey(x: number, y: number): string {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }

  clear() {
    this.cells.clear();
    this.entityCells.clear();
  }

  insert(entity: T) {
    const key = this.getKey(entity.pos.x, entity.pos.y);
    if (!this.cells.has(key)) this.cells.set(key, []);
    this.cells.get(key)!.push(entity);

    if (!this.entityCells.has(entity.id)) this.entityCells.set(entity.id, []);
    this.entityCells.get(entity.id)!.push(key);
  }

  insertAll(entities: T[]) {
    for (const e of entities) this.insert(e);
  }

  // Get entities near a position within radius
  getNearby(x: number, y: number, radius: number): T[] {
    const results: T[] = [];
    const seen = new Set<number>();

    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = `${cx},${cy}`;
        const cell = this.cells.get(key);
        if (!cell) continue;

        for (const entity of cell) {
          if (seen.has(entity.id)) continue;
          seen.add(entity.id);

          const dx = entity.pos.x - x;
          const dy = entity.pos.y - y;
          const distSq = dx * dx + dy * dy;
          const r = radius + (entity.radius || 0);
          if (distSq <= r * r) {
            results.push(entity);
          }
        }
      }
    }
    return results;
  }

  // Get nearest entity to position
  getNearest(x: number, y: number, maxRadius: number = 1000): T | null {
    let nearest: T | null = null;
    let nearestDistSq = maxRadius * maxRadius;

    const nearby = this.getNearby(x, y, maxRadius);
    for (const entity of nearby) {
      const dx = entity.pos.x - x;
      const dy = entity.pos.y - y;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearest = entity;
      }
    }
    return nearest;
  }
}
