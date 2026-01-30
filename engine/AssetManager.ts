/**
 * Asset Manager - Loads and caches game images with progressive loading
 * Critical assets load first for faster game start
 */

import { assetPerf } from './perf';

const ASSET_ROOT = '/assets';
const LOW_ASSET_ROOT = '/assets-low';

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
  private coreLoaded = false;
  private uiLoaded = false;
  private loading = false;
  private loadPromise: Promise<void> | null = null;
  private corePromise: Promise<void> | null = null;
  private uiPromise: Promise<void> | null = null;
  private progressCallback: ((progress: LoadProgress) => void) | null = null;
  private loadedCount = 0;
  private totalCount = 0;
  private assetQuality: 'auto' | 'full' | 'low' = 'auto';
  private resolvedAssetRoot: string | null = null;
  private resolvedFallbackRoot: string | null = null;

  setProgressCallback(callback: (progress: LoadProgress) => void) {
    this.progressCallback = callback;
    // Immediately report current progress so late subscribers get the current state
    if (this.loaded) {
      callback({
        loaded: this.loadedCount,
        total: this.totalCount,
        phase: 'complete',
        percent: 100
      });
    } else if (this.loadedCount > 0) {
      // Loading in progress - report current state
      const phase: LoadProgress['phase'] = this.uiLoaded
        ? 'complete'
        : this.coreLoaded
          ? 'ui'
          : this.criticalLoaded
            ? 'gameplay'
            : 'critical';
      callback({
        loaded: this.loadedCount,
        total: this.totalCount,
        phase,
        percent: Math.round((this.loadedCount / Math.max(1, this.totalCount)) * 100)
      });
    }
  }

  setQuality(quality: 'auto' | 'full' | 'low') {
    if (this.loading || this.loaded || this.corePromise || this.loadPromise) {
      console.warn('[AssetManager] Ignoring quality change after load has started.');
      return;
    }
    this.assetQuality = quality;
    this.resolvedAssetRoot = null;
    this.resolvedFallbackRoot = null;
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    if (this.loading && this.loadPromise) return this.loadPromise;
    if (this.corePromise) {
      this.loading = true;
      this.loadPromise = (async () => {
        await this.corePromise;
        await this.ensureUiLoaded();
        this.loaded = true;
      })();
      await this.loadPromise;
      this.loading = false;
      return;
    }

    this.loading = true;
    this.loadPromise = this._loadProgressive();
    await this.loadPromise;
    this.loaded = true;
    this.loading = false;
  }

  async loadCore(): Promise<void> {
    if (this.coreLoaded) return;
    if (this.corePromise) return this.corePromise;

    const coreStart = assetPerf.start('assets:core');
    this.corePromise = (async () => {
      this.ensureTotals();

      if (!this.criticalLoaded) {
        await this._loadPhase(CRITICAL_ASSETS, 'critical');
        this.criticalLoaded = true;
        // Load magic assets in background - don't block startup
        this._loadMagicAssets().catch(() => {});
      }

      await this._loadPhase(GAMEPLAY_ASSETS, 'gameplay');
      this.coreLoaded = true;
      this._reportProgress('ui');
      assetPerf.end('assets:core', coreStart, { force: true });

      // Start UI assets in background after core is ready
      this.startUiLoadDeferred();
    })();

    await this.corePromise;
  }

  private async _loadProgressive(): Promise<void> {
    await this.loadCore();
    await this.ensureUiLoaded();
    this._reportProgress('complete');
    console.log('All assets loaded');
  }

  private ensureTotals() {
    if (this.totalCount > 0) return;
    this.totalCount = this._countAssets(CRITICAL_ASSETS) +
                      this._countAssets(GAMEPLAY_ASSETS) +
                      this._countUIAssets() + 16; // 16 magic assets
  }

  private startUiLoadDeferred() {
    if (this.uiLoaded || this.uiPromise) return;
    const start = () => {
      if (this.uiPromise) return;
      this.uiPromise = this._loadUIAssets().then(() => {
        this.uiLoaded = true;
        this.loaded = this.coreLoaded;
        this._reportProgress('complete');
      });
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      requestIdleCallback(start, { timeout: 1000 });
    } else {
      setTimeout(start, 0);
    }
  }

  private async ensureUiLoaded(): Promise<void> {
    if (this.uiLoaded) return;
    if (!this.uiPromise) {
      this.uiPromise = this._loadUIAssets().then(() => {
        this.uiLoaded = true;
        this.loaded = this.coreLoaded;
        this._reportProgress('complete');
      });
    }
    await this.uiPromise;
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

  private shouldUseLowRes(): boolean {
    if (this.assetQuality === 'low') return true;
    if (this.assetQuality === 'full') return false;
    if (typeof navigator === 'undefined') return false;
    const conn = (navigator as { connection?: { saveData?: boolean } }).connection;
    const saveData = !!conn?.saveData;
    const memory = (navigator as { deviceMemory?: number }).deviceMemory || 0;
    const reducedData = typeof window !== 'undefined' &&
      'matchMedia' in window &&
      window.matchMedia('(prefers-reduced-data: reduce)').matches;
    return saveData || reducedData || (memory > 0 && memory <= 4);
  }

  private resolveAssetRoots(): { root: string; fallback: string | null } {
    if (this.resolvedAssetRoot) {
      return { root: this.resolvedAssetRoot, fallback: this.resolvedFallbackRoot };
    }
    const useLow = this.shouldUseLowRes();
    this.resolvedAssetRoot = useLow ? LOW_ASSET_ROOT : ASSET_ROOT;
    this.resolvedFallbackRoot = useLow ? ASSET_ROOT : null;
    return { root: this.resolvedAssetRoot, fallback: this.resolvedFallbackRoot };
  }

  private getAssetPaths() {
    const { root, fallback } = this.resolveAssetRoots();
    return {
      game: `${root}/game`,
      generated: `${root}/generated`,
      tiled: `${root}/tiled`,
      magic: `${root}/magic`,
      fallbackGame: fallback ? `${fallback}/game` : null,
      fallbackGenerated: fallback ? `${fallback}/generated` : null,
      fallbackTiled: fallback ? `${fallback}/tiled` : null,
      fallbackMagic: fallback ? `${fallback}/magic` : null,
    };
  }

  private async loadWithFallback(src: string, fallback?: string | null): Promise<HTMLImageElement> {
    let img = await this._loadImage(src);
    if (img.width === 0 && fallback && fallback !== src) {
      img = await this._loadImage(fallback);
    }
    return img;
  }

  private _loadImage(src: string, timeoutMs = 5000): Promise<HTMLImageElement> {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      let settled = false;
      const done = () => { if (!settled) { settled = true; this.loadedCount++; resolve(img); } };
      const timer = setTimeout(() => {
        if (!settled) { console.warn(`[AssetManager] Timeout: ${src}`); done(); }
      }, timeoutMs);
      img.onload = () => { clearTimeout(timer); done(); };
      img.onerror = () => { clearTimeout(timer); done(); };
      img.src = src;
    });
  }

  private async _loadPhase(manifest: Record<string, string[]>, phase: LoadProgress['phase']): Promise<void> {
    const phaseStart = assetPerf.start(`assets:${phase}`);
    const batchSize = 20; // Load 20 assets at a time for faster loading
    const tasks: { category: string; name: string; src: string; fallbackSrc?: string | null }[] = [];
    const paths = this.getAssetPaths();

    for (const [category, names] of Object.entries(manifest)) {
      for (const name of names) {
        let src: string;
        let fallbackSrc: string | null = null;
        if (category === 'terrain') {
          src = `${paths.tiled}/terrain_${name}.webp`;
          fallbackSrc = paths.fallbackTiled ? `${paths.fallbackTiled}/terrain_${name}.webp` : null;
        } else if (category === 'decor') {
          src = `${paths.generated}/decor_${name}.webp`;
          fallbackSrc = paths.fallbackGenerated ? `${paths.fallbackGenerated}/decor_${name}.webp` : null;
        } else if (category === 'cities') {
          src = `${paths.generated}/city_${name}.webp`;
          fallbackSrc = paths.fallbackGenerated ? `${paths.fallbackGenerated}/city_${name}.webp` : null;
        } else {
          src = `${paths.game}/${category}/${name}.webp`;
          fallbackSrc = paths.fallbackGame ? `${paths.fallbackGame}/${category}/${name}.webp` : null;
        }
        tasks.push({ category, name, src, fallbackSrc });
      }
    }

    // Process in batches
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      await Promise.all(batch.map(async ({ category, name, src, fallbackSrc }) => {
        let img = await this.loadWithFallback(src, fallbackSrc);

        // Fallback for terrain
        if (img.width === 0 && category === 'terrain') {
          const altSrc = `${paths.generated}/terrain_${name}.webp`;
          const altFallback = paths.fallbackGenerated ? `${paths.fallbackGenerated}/terrain_${name}.webp` : null;
          img = await this.loadWithFallback(altSrc, altFallback);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.assets as any)[category][name] = img;
      }));
      this._reportProgress(phase);
    }
    assetPerf.end(`assets:${phase}`, phaseStart, { force: true });
  }

  private async _loadMagicAssets(): Promise<void> {
    const magicStart = assetPerf.start('assets:magic');
    const magicElements = ['fire', 'ice', 'lightning', 'earth', 'black', 'cure', 'blood', 'lumin'];
    const paths = this.getAssetPaths();
    const magicPath = paths.magic;
    const fallbackMagic = paths.fallbackMagic;

    await Promise.all(magicElements.flatMap(el => [
      this.loadWithFallback(`${magicPath}/orb_${el}.webp`, fallbackMagic ? `${fallbackMagic}/orb_${el}.webp` : null).then(img => {
        this.assets.magic[`orb_${el}`] = img;
      }),
      this.loadWithFallback(`${magicPath}/proj_${el}.webp`, fallbackMagic ? `${fallbackMagic}/proj_${el}.webp` : null).then(img => {
        this.assets.magic[`proj_${el}`] = img;
      })
    ]));
    this._reportProgress('critical');
    assetPerf.end('assets:magic', magicStart, { force: true });
  }

  private async _loadUIAssets(): Promise<void> {
    const uiStart = assetPerf.start('assets:ui');
    // Load decor and cities
    await this._loadPhase({ decor: UI_ASSETS.decor, cities: UI_ASSETS.cities }, 'ui');
    const paths = this.getAssetPaths();
    const basePath = paths.generated;
    const fallbackPath = paths.fallbackGenerated;

    // Load character assets in batches
    const batchSize = 15;
    for (let i = 0; i < UI_ASSETS.characters.length; i += batchSize) {
      const batch = UI_ASSETS.characters.slice(i, i + batchSize);
      await Promise.all(batch.flatMap(charId => [
        this.loadWithFallback(
          `${basePath}/char_${charId}_portrait.webp`,
          fallbackPath ? `${fallbackPath}/char_${charId}_portrait.webp` : null
        ).then(img => {
          this.assets.characters.portraits[charId] = img;
        }),
        this.loadWithFallback(
          `${basePath}/char_${charId}_sprite.webp`,
          fallbackPath ? `${fallbackPath}/char_${charId}_sprite.webp` : null
        ).then(img => {
          this.assets.characters.sprites[charId] = img;
        }),
        this.loadWithFallback(
          `${basePath}/char_${charId}_icon.webp`,
          fallbackPath ? `${fallbackPath}/char_${charId}_icon.webp` : null
        ).then(img => {
          this.assets.characters.icons[charId] = img;
        })
      ]));
      this._reportProgress('ui');
    }
    assetPerf.end('assets:ui', uiStart, { force: true });
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
