/**
 * Asset Manager - Loads and caches game images
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

const CHARACTER_IDS = ['samurai', 'witch', 'ninja', 'paladin', 'necromancer', 'bard', 'druid',
  'fire_samurai', 'ice_witch', 'storm_ninja', 'shadow_paladin', 'earth_druid', 'light_bard', 'water_necro', 'wind_ninja',
  'dragon_knight', 'vampire', 'werewolf', 'slime', 'angel', 'demon', 'skeleton', 'ghost_player', 'minotaur', 'harpy_player', 'golem', 'lich',
  'dark_paladin', 'blood_necro', 'war_bard', 'shadow_ninja', 'holy_druid', 'plague_witch', 'arcane_samurai', 'wild_druid', 'stone_paladin', 'blade_dancer',
  'chef', 'mime', 'merchant', 'scarecrow', 'chicken',
  'phoenix', 'titan', 'void_walker', 'time_keeper', 'world_eater'];

const ASSET_MANIFEST: Record<string, string[]> = {
  enemies: ['swarm', 'shooter', 'tank', 'elite', 'ghost', 'stalker', 'serpent', 'deer', 'sentry', 'patrol', 'guard', 'wolf', 'boss-drake'],
  mounts: ['horse', 'chariot', 'dragon', 'boat'],
  players: ['player-blue', 'player-pink', 'player-green', 'player-yellow'],
  npcs: ['trader', 'town'],
  projectiles: ['bullet-physical', 'bullet-fire', 'bullet-ice', 'bullet-magic', 'bullet-lightning', 'bullet-poison'],
  items: ['coin', 'health-potion', 'mana-potion'],
  effects: ['explosion', 'heal', 'nova'],
  terrain: ['grass', 'forest', 'mountain', 'snow', 'shore', 'river', 'sea', 'swamp', 'lowland', 'town'],
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
          resolve(img);
        };
        img.src = src;
      });
    };

    const promises: Promise<void>[] = [];

    for (const [category, names] of Object.entries(ASSET_MANIFEST)) {
      if (category === 'characters') {
        for (const charId of names) {
          promises.push(
            loadImage(`${GENERATED_PATH}/char_${charId}_portrait.png`).then(img => {
              this.assets.characters.portraits[charId] = img;
            })
          );
          promises.push(
            loadImage(`${GENERATED_PATH}/char_${charId}_sprite.png`).then(img => {
              this.assets.characters.sprites[charId] = img;
            })
          );
          promises.push(
            loadImage(`${GENERATED_PATH}/char_${charId}_icon.png`).then(img => {
              this.assets.characters.icons[charId] = img;
            })
          );
        }
      } else {
        for (const name of names) {
          const isGenerated = category === 'terrain' || category === 'decor' || category === 'cities';
          if (isGenerated) {
            let prefix = category;
            if (category === 'cities') prefix = 'city';
            else if (category === 'terrain') prefix = 'terrain';
            else prefix = 'decor';
            // Try tiled version first for terrain, fall back to generated
            const tiledSrc = `${TILED_PATH}/${prefix}_${name}.png`;
            const genSrc = `${GENERATED_PATH}/${prefix}_${name}.png`;
            promises.push(
              loadImage(category === 'terrain' ? tiledSrc : genSrc).then(img => {
                if (img.width === 0 && category === 'terrain') {
                  return loadImage(genSrc);
                }
                return img;
              }).then(img => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (this.assets as any)[category][name] = img;
              })
            );
          } else {
            const src = `${ASSET_PATH}/${category}/${name}.webp`;
            promises.push(
              loadImage(src).then(img => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (this.assets as any)[category][name] = img;
              })
            );
          }
        }
      }
    }

    // Load magic assets
    const MAGIC_PATH = '/assets/magic';
    const magicElements = ['fire', 'ice', 'lightning', 'earth', 'black', 'cure', 'blood', 'lumin'];
    for (const el of magicElements) {
      promises.push(
        loadImage(`${MAGIC_PATH}/orb_${el}.png`).then(img => {
          this.assets.magic[`orb_${el}`] = img;
        })
      );
      promises.push(
        loadImage(`${MAGIC_PATH}/proj_${el}.png`).then(img => {
          this.assets.magic[`proj_${el}`] = img;
        })
      );
    }

    await Promise.all(promises);
    console.log('Assets loaded');
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
