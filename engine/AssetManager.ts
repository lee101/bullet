/**
 * Asset Manager - Loads and caches game images
 */

const ASSET_PATH = '/assets/game';

export type AssetCategory = 'enemies' | 'mounts' | 'players' | 'npcs' | 'projectiles' | 'items' | 'effects';

export interface LoadedAssets {
  enemies: Record<string, HTMLImageElement>;
  mounts: Record<string, HTMLImageElement>;
  players: Record<string, HTMLImageElement>;
  npcs: Record<string, HTMLImageElement>;
  projectiles: Record<string, HTMLImageElement>;
  items: Record<string, HTMLImageElement>;
  effects: Record<string, HTMLImageElement>;
}

const ASSET_MANIFEST: Record<AssetCategory, string[]> = {
  enemies: ['swarm', 'shooter', 'tank', 'elite', 'ghost', 'stalker', 'serpent', 'deer', 'sentry', 'patrol', 'guard', 'wolf', 'boss-drake'],
  mounts: ['horse', 'chariot', 'dragon', 'boat'],
  players: ['player-blue', 'player-pink', 'player-green', 'player-yellow'],
  npcs: ['trader', 'town'],
  projectiles: ['bullet-physical', 'bullet-fire', 'bullet-ice', 'bullet-magic', 'bullet-lightning', 'bullet-poison'],
  items: ['coin', 'health-potion', 'mana-potion'],
  effects: ['explosion', 'heal', 'nova'],
};

class AssetManager {
  private assets: LoadedAssets = {
    enemies: {},
    mounts: {},
    players: {},
    npcs: {},
    projectiles: {},
    items: {},
    effects: {},
  };
  private loaded = false;
  private loading = false;
  private loadPromise: Promise<void> | null = null;

  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loading && this.loadPromise) return this.loadPromise;

    this.loading = true;
    this.loadPromise = this._loadAll();
    await this.loadPromise;
    this.loaded = true;
    this.loading = false;
  }

  private async _loadAll(): Promise<void> {
    const loadImage = (src: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => {
          console.warn(`Failed to load: ${src}`);
          // Return placeholder on error
          resolve(img);
        };
        img.src = src;
      });
    };

    const promises: Promise<void>[] = [];

    for (const [category, names] of Object.entries(ASSET_MANIFEST)) {
      for (const name of names) {
        const src = `${ASSET_PATH}/${category}/${name}.webp`;
        promises.push(
          loadImage(src).then(img => {
            this.assets[category as AssetCategory][name] = img;
          })
        );
      }
    }

    await Promise.all(promises);
    console.log('Assets loaded:', Object.keys(this.assets).map(k => `${k}: ${Object.keys(this.assets[k as AssetCategory]).length}`).join(', '));
  }

  getEnemy(type: string): HTMLImageElement | null {
    // Map game enemy types to asset names
    const typeMap: Record<string, string> = {
      SWARM: 'swarm',
      SHOOTER: 'shooter',
      TANK: 'tank',
      ELITE: 'elite',
      GHOST: 'ghost',
      STALKER: 'stalker',
      SERPENT: 'serpent',
      DEER: 'deer',
      SENTRY: 'sentry',
      PATROL: 'patrol',
      GUARD: 'guard',
      WOLF: 'wolf',
      BOSS_DRAKE: 'boss-drake',
    };
    const assetName = typeMap[type];
    return assetName ? this.assets.enemies[assetName] || null : null;
  }

  getMount(type: string): HTMLImageElement | null {
    const typeMap: Record<string, string> = {
      HORSE: 'horse',
      CHARIOT: 'chariot',
      DRAGON: 'dragon',
      BOAT: 'boat',
    };
    const assetName = typeMap[type];
    return assetName ? this.assets.mounts[assetName] || null : null;
  }

  getPlayer(colorIndex: number): HTMLImageElement | null {
    const colors = ['player-blue', 'player-pink', 'player-green', 'player-yellow'];
    const assetName = colors[colorIndex] || colors[0];
    return this.assets.players[assetName] || null;
  }

  getProjectile(element: string): HTMLImageElement | null {
    const typeMap: Record<string, string> = {
      PHYSICAL: 'bullet-physical',
      FIRE: 'bullet-fire',
      ICE: 'bullet-ice',
      MAGIC: 'bullet-magic',
      LIGHTNING: 'bullet-lightning',
      POISON: 'bullet-poison',
    };
    const assetName = typeMap[element];
    return assetName ? this.assets.projectiles[assetName] || null : null;
  }

  getNPC(type: string): HTMLImageElement | null {
    return this.assets.npcs[type] || null;
  }

  getItem(type: string): HTMLImageElement | null {
    return this.assets.items[type] || null;
  }

  getEffect(type: string): HTMLImageElement | null {
    return this.assets.effects[type] || null;
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}

export const assetManager = new AssetManager();
