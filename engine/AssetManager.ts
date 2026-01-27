/**
 * Asset Manager - Loads and caches game images with progressive loading
 * Critical assets load first for faster game start
 */

const ASSET_PATH = '/assets/game';
const GENERATED_PATH = '/assets/generated';
const TILED_PATH = '/assets/tiled';

export type AssetCategory = 'enemies' | 'mounts' | 'players' | 'npcs' | 'projectiles' | 'items' | 'effects' | 'terrain' | 'decor' | 'characters';

export interface LoadedAssets {
  enemies: Record<string, HTMLImageElement>;
  mounts: Record<string, HTMLImageElement>;
  players: Record<string, HTMLImageElement>;
  npcs: Record<string, HTMLImageElement>;
  projectiles: Record<string, HTMLImageElement>;
  items: Record<string, HTMLImageElement>;
  effects: Record<string, HTMLImageElement>;
  terrain: Record<string, HTMLImageElement>;
  decor: Record<string, HTMLImageElement>;
  cities: Record<string, HTMLImageElement>;
  magic: Record<string, HTMLImageElement>;
  characters: {
    portraits: Record<string, HTMLImageElement>;
    sprites: Record<string, HTMLImageElement>;
    icons: Record<string, HTMLImageElement>;
  };
}

export interface LoadProgress {
  loaded: number;
  total: number;
  phase: 'critical' | 'gameplay' | 'ui' | 'complete';
  percent: number;
}

const CHARACTER_IDS = ['samurai', 'witch', 'ninja', 'paladin', 'necromancer', 'bard', 'druid',
  'fire_samurai', 'ice_witch', 'storm_ninja', 'shadow_paladin', 'earth_druid', 'light_bard', 'water_necro', 'wind_ninja',
  'dragon_knight', 'vampire', 'werewolf', 'slime', 'angel', 'demon', 'skeleton', 'ghost_player', 'minotaur', 'harpy_player', 'golem', 'lich',
  'dark_paladin', 'blood_necro', 'war_bard', 'shadow_ninja', 'holy_druid', 'plague_witch', 'arcane_samurai', 'wild_druid', 'stone_paladin', 'blade_dancer',
  'chef', 'mime', 'merchant', 'scarecrow', 'chicken',
  'phoenix', 'titan', 'void_walker', 'time_keeper', 'world_eater'];

// Critical assets needed immediately for gameplay
const CRITICAL_ASSETS = {
  players: ['player-blue', 'player-pink', 'player-green', 'player-yellow'],
  enemies: ['swarm', 'shooter', 'tank'],
  projectiles: ['bullet-physical', 'bullet-fire', 'bullet-ice'],
  items: ['coin'],
  terrain: ['grass', 'forest', 'mountain'],
};

// Gameplay assets loaded second (needed for full game experience)
const GAMEPLAY_ASSETS = {
  enemies: ['elite', 'ghost', 'stalker', 'serpent', 'deer', 'sentry', 'patrol', 'guard', 'wolf', 'boss-drake'],
  mounts: ['horse', 'chariot', 'dragon', 'boat'],
  npcs: ['trader', 'town'],
  projectiles: ['bullet-magic', 'bullet-lightning', 'bullet-poison'],
  items: ['health-potion', 'mana-potion'],
  effects: ['explosion', 'heal', 'nova'],
  terrain: ['snow', 'shore', 'river', 'sea', 'swamp', 'lowland', 'town'],
};

// UI assets loaded last (character selection, etc.)
const UI_ASSETS = {
  decor: ['tree_oak', 'tree_pine', 'tree_dead', 'tree_palm', 'tree_frozen', 'rock_small', 'rock_large', 'bush', 'flowers', 'mushrooms', 'ruins', 'bones', 'campfire', 'tent', 'waterlily', 'reeds'],
  cities: ['medieval', 'desert', 'asian', 'nordic', 'elven', 'dwarven'],
  characters: CHARACTER_IDS,
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
    terrain: {},
    decor: {},
    cities: {},
    magic: {},
    characters: { portraits: {}, sprites: {}, icons: {} },
  };
  private loaded = false;
  private criticalLoaded = false;
  private loading = false;
  private loadPromise: Promise<void> | null = null;
  private progressCallback: ((progress: LoadProgress) => void) | null = null;
  private loadedCount = 0;
  private totalCount = 0;

  setProgressCallback(callback: (progress: LoadProgress) => void) {
    this.progressCallback = callback;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loading && this.loadPromise) return this.loadPromise;

    this.loading = true;
    this.loadPromise = this._loadProgressive();
    await this.loadPromise;
    this.loaded = true;
    this.loading = false;
  }

  private async _loadProgressive(): Promise<void> {
    // Calculate total count for progress tracking
    this.totalCount = this._countAssets(CRITICAL_ASSETS) +
                      this._countAssets(GAMEPLAY_ASSETS) +
                      this._countUIAssets() + 16; // 16 magic assets

    // Phase 1: Critical assets (players, basic enemies, terrain)
    if (!this.criticalLoaded) {
      await this._loadPhase(CRITICAL_ASSETS, 'critical');
      await this._loadMagicAssets();
      this.criticalLoaded = true;
    }

    // Phase 2: Gameplay assets (rest of enemies, mounts, effects)
    await this._loadPhase(GAMEPLAY_ASSETS, 'gameplay');

    // Phase 3: UI assets (characters, decor, cities) - loaded in background
    await this._loadUIAssets();

    this._reportProgress('complete');
    console.log('All assets loaded');
  }

  private _countAssets(manifest: Record<string, string[]>): number {
    return Object.values(manifest).reduce((sum, arr) => sum + arr.length, 0);
  }

  private _countUIAssets(): number {
    let count = UI_ASSETS.decor.length + UI_ASSETS.cities.length;
    count += UI_ASSETS.characters.length * 3; // portrait, sprite, icon
    return count;
  }

  private _reportProgress(phase: LoadProgress['phase']) {
    if (this.progressCallback) {
      this.progressCallback({
        loaded: this.loadedCount,
        total: this.totalCount,
        phase,
        percent: Math.round((this.loadedCount / Math.max(1, this.totalCount)) * 100)
      });
    }
  }

  private _loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.loadedCount++;
        resolve(img);
      };
      img.onerror = () => {
        console.warn(`[AssetManager] Failed to load: ${src}`);
        this.loadedCount++;
        resolve(img); // Resolve with empty image on error
      };
      img.src = src;
    });
  }

  private async _loadPhase(manifest: Record<string, string[]>, phase: LoadProgress['phase']): Promise<void> {
    const batchSize = 10; // Load 10 assets at a time for better parallelism
    const tasks: { category: string; name: string; src: string }[] = [];

    for (const [category, names] of Object.entries(manifest)) {
      for (const name of names) {
        let src: string;
        if (category === 'terrain') {
          src = `${TILED_PATH}/terrain_${name}.webp`;
        } else if (category === 'decor') {
          src = `${GENERATED_PATH}/decor_${name}.webp`;
        } else if (category === 'cities') {
          src = `${GENERATED_PATH}/city_${name}.webp`;
        } else {
          src = `${ASSET_PATH}/${category}/${name}.webp`;
        }
        tasks.push({ category, name, src });
      }
    }

    // Process in batches
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      await Promise.all(batch.map(async ({ category, name, src }) => {
        let img = await this._loadImage(src);

        // Fallback for terrain
        if (img.width === 0 && category === 'terrain') {
          img = await this._loadImage(`${GENERATED_PATH}/terrain_${name}.webp`);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.assets as any)[category][name] = img;
      }));
      this._reportProgress(phase);
    }
  }

  private async _loadMagicAssets(): Promise<void> {
    const MAGIC_PATH = '/assets/magic';
    const magicElements = ['fire', 'ice', 'lightning', 'earth', 'black', 'cure', 'blood', 'lumin'];

    await Promise.all(magicElements.flatMap(el => [
      this._loadImage(`${MAGIC_PATH}/orb_${el}.webp`).then(img => {
        this.assets.magic[`orb_${el}`] = img;
      }),
      this._loadImage(`${MAGIC_PATH}/proj_${el}.webp`).then(img => {
        this.assets.magic[`proj_${el}`] = img;
      })
    ]));
    this._reportProgress('critical');
  }

  private async _loadUIAssets(): Promise<void> {
    // Load decor and cities
    await this._loadPhase({ decor: UI_ASSETS.decor, cities: UI_ASSETS.cities }, 'ui');

    // Load character assets in batches
    const batchSize = 15;
    for (let i = 0; i < UI_ASSETS.characters.length; i += batchSize) {
      const batch = UI_ASSETS.characters.slice(i, i + batchSize);
      await Promise.all(batch.flatMap(charId => [
        this._loadImage(`${GENERATED_PATH}/char_${charId}_portrait.webp`).then(img => {
          this.assets.characters.portraits[charId] = img;
        }),
        this._loadImage(`${GENERATED_PATH}/char_${charId}_sprite.webp`).then(img => {
          this.assets.characters.sprites[charId] = img;
        }),
        this._loadImage(`${GENERATED_PATH}/char_${charId}_icon.webp`).then(img => {
          this.assets.characters.icons[charId] = img;
        })
      ]));
      this._reportProgress('ui');
    }
  }

  getMagicOrb(element: string): HTMLImageElement | null {
    const el = element.toLowerCase();
    return this.assets.magic[`orb_${el}`] || null;
  }

  getMagicProjectile(element: string): HTMLImageElement | null {
    const el = element.toLowerCase();
    return this.assets.magic[`proj_${el}`] || null;
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

  getTerrain(biome: string): HTMLImageElement | null {
    const biomeMap: Record<string, string> = {
      GRASS: 'grass', FOREST: 'forest', MOUNTAIN: 'mountain', SNOW: 'snow',
      SHORE: 'shore', RIVER: 'river', SEA: 'sea', SWAMP: 'swamp',
      LOWLAND: 'lowland', TOWN: 'town',
    };
    const name = biomeMap[biome];
    return name ? this.assets.terrain[name] || null : null;
  }

  getDecor(type: string): HTMLImageElement | null {
    const decorMap: Record<string, string> = {
      DECIDUOUS_TREE: 'tree_oak', PINE_TREE: 'tree_pine', DEAD_TREE: 'tree_dead',
      PALM_TREE: 'tree_palm', FROZEN_TREE: 'tree_frozen',
      SMALL_ROCK: 'rock_small', LARGE_ROCK: 'rock_large', BOULDER: 'rock_large',
      BUSH: 'bush', FLOWERS: 'flowers', MUSHROOMS: 'mushrooms',
      RUINS: 'ruins', BONES: 'bones', SKULL: 'bones',
      CAMP_TENT: 'tent', CAMPFIRE: 'campfire',
      WATER_LILY: 'waterlily', REEDS: 'reeds', TALL_GRASS: 'bush',
    };
    const name = decorMap[type];
    return name ? this.assets.decor[name] || null : null;
  }

  getCharacterPortrait(characterId: string): HTMLImageElement | null {
    return this.assets.characters.portraits[characterId] || null;
  }

  getCharacterSprite(characterId: string): HTMLImageElement | null {
    return this.assets.characters.sprites[characterId] || null;
  }

  getCharacterIcon(characterId: string): HTMLImageElement | null {
    return this.assets.characters.icons[characterId] || null;
  }

  getCity(style: string): HTMLImageElement | null {
    const styleMap: Record<string, string> = {
      MEDIEVAL: 'medieval', DESERT: 'desert', ASIAN: 'asian',
      NORDIC: 'nordic', ELVEN: 'elven', DWARVEN: 'dwarven',
    };
    const name = styleMap[style];
    return name ? this.assets.cities[name] || null : null;
  }
}

export const assetManager = new AssetManager();
