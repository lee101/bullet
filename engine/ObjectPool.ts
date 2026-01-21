
// Generic object pool for reusing objects to reduce GC pressure
export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;

  constructor(factory: () => T, reset: (obj: T) => void, initialSize: number = 50) {
    this.factory = factory;
    this.reset = reset;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  get(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory();
  }

  release(obj: T): void {
    this.reset(obj);
    if (this.pool.length < 500) { // Cap pool size
      this.pool.push(obj);
    }
  }

  releaseAll(objs: T[]): void {
    for (const obj of objs) {
      this.release(obj);
    }
  }

  get size(): number {
    return this.pool.length;
  }
}

// Pre-configured pools for common game objects
export const particlePool = new ObjectPool(
  () => ({ pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, life: 0, maxLife: 0, color: '', size: 0 }),
  (p) => { p.life = 0; p.maxLife = 0; }
);

export const bulletPool = new ObjectPool(
  () => ({ id: 0, playerId: 0, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, damage: 0, element: 'PHYSICAL' as any, radius: 0, life: 0, pierce: 0 }),
  (b) => { b.life = 0; b.pierce = 0; }
);

export const damageNumberPool = new ObjectPool(
  () => ({ id: 0, pos: { x: 0, y: 0 }, value: 0, color: '', life: 0, maxLife: 0, isCrit: false, text: undefined, fontSize: undefined }),
  (d) => { d.life = 0; d.text = undefined; }
);

export const coinPool = new ObjectPool(
  () => ({ id: 0, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, value: 0, life: 0 }),
  (c) => { c.life = 0; }
);
