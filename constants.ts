
import { ElementType, MountType, ShopItem } from './types';

export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

export const WORLD_WIDTH = 4000;
export const WORLD_HEIGHT = 4000;

export const GRID_SIZE = 40; 
export const PLAYER_RADIUS = 15;

export const GRAVITY = 0.5;
export const JUMP_FORCE = 8.5;

export const TOWN_RADIUS = 500;
export const MAX_SLOTS = 3;

// Fix: Added missing Limit Break and Weapon constants used by engine and HUD
export const LIMIT_BREAK_MAX_CHARGE = 1000;
export const LIMIT_BREAK_DURATION = 600;
export const LIMIT_BREAK_REGEN_PER_FRAME = 0.05;
export const WEAPON_AMMO_MAX = 100;

export const INITIAL_PLAYER_STATS = {
  hp: 100,
  maxHp: 100,
  magic: 100,
  maxMagic: 100,
  speed: 3.2, 
  xp: 0,
  level: 1,
  score: 0,
  autoAttackCooldown: 0,
  manualAttackCooldown: 0,
  meleeCooldown: 0,
  skillCooldowns: [0, 0, 0, 0] as [number, number, number, number],
  damage: 15,
  fireRate: 0.1,
  weaponType: 'BASIC' as const,
  weaponAmmo: 0,
  limitBreakCharge: 0,
  isLimitBreakActive: false,
  limitBreakTimer: 0,
  z: 0,
  zVel: 0,
  isBlocking: false,
  isDead: false,
  reviveProgress: 0,
  knockbackVel: { x: 0, y: 0 },
  mount: null as MountType | null,
  weaponSlots: [] as string[],
  armorSlots: [] as string[],
  magicSlots: [] as string[],
  projectileCount: 1,
  statsDetail: {
    baseDamage: 15,
    baseHp: 100,
    baseSpeed: 3.2,
    baseMagic: 100
  }
};

export const MOUNT_CONFIGS = {
  HORSE: { speedMult: 2.0, color: '#8B4513', label: 'STEED' },
  CHARIOT: { speedMult: 2.3, color: '#DAA520', label: 'WAR CHARIOT' },
  DRAGON: { speedMult: 3.0, color: '#DC143C', label: 'DRAKE' },
};

export const SKILL_COOLDOWNS = [180, 480, 600, 900]; // X, Y, B, A

export const ENEMY_TYPES = {
  SWARM: { hp: 30, speed: 2.2, radius: 10, damage: 4, color: '#ff3333', movement: 'CHASE', isAggressive: true },
  SHOOTER: { hp: 70, speed: 1.4, radius: 16, damage: 10, color: '#33ff33', movement: 'SNIPE', isAggressive: true },
  TANK: { hp: 300, speed: 0.9, radius: 28, damage: 20, color: '#3333ff', movement: 'CHASE', isAggressive: true },
  ELITE: { hp: 700, speed: 1.6, radius: 22, damage: 15, color: '#ffff33', movement: 'ORBIT', isAggressive: true },
  GHOST: { hp: 120, speed: 3.5, radius: 14, damage: 12, color: '#a020f0', movement: 'WANDER', isAggressive: true },
  STALKER: { hp: 200, speed: 2.5, radius: 18, damage: 25, color: '#ff8800', movement: 'CHASE', isAggressive: true },
  SERPENT: { hp: 150, speed: 1.2, radius: 20, damage: 12, color: '#9933ff', movement: 'CHASE', isAggressive: true },
  DEER: { hp: 400, speed: 3.0, radius: 25, damage: 10, color: '#ccaa88', movement: 'WANDER', isAggressive: false },
  BOSS_DRAKE: { hp: 5000, speed: 1.2, radius: 60, damage: 30, color: '#ff0000', movement: 'BOSS_PATTERN', isAggressive: true },
};

export const ELEMENT_COLORS = {
  [ElementType.PHYSICAL]: '#ffffff',
  [ElementType.FIRE]: '#ff4d4d',
  [ElementType.ICE]: '#4dffff',
  [ElementType.MAGIC]: '#cc33ff',
  [ElementType.LIGHTNING]: '#ffff33',
  [ElementType.POISON]: '#a020f0',
  [ElementType.MELEE]: '#ffaa00',
};

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'dmg_steel', name: 'FORGED STEEL', description: 'Atk +15', price: 250, icon: '⚔️', category: 'WEAPON', tier: 1, mods: { dmg: 15 } },
  { id: 'hp_armor', name: 'PLATE MAIL', description: 'Max HP +80', price: 300, icon: '🛡️', category: 'ARMOR', tier: 1, mods: { hp: 80 } },
  { id: 'spd_boots', name: 'SWIFT BOOTS', description: 'Speed +0.5', price: 200, icon: '👢', category: 'ARMOR', tier: 1, mods: { spd: 0.5 } },
  { id: 'mp_cloak', name: 'MANA CLOAK', description: 'Max Focus +100', price: 250, icon: '📜', category: 'MAGIC', tier: 1, mods: { mag: 100 } },
  { id: 'proj_bolt', name: 'DUAL CROSSBOW', description: '+1 Projectile', price: 800, icon: '🏹', category: 'WEAPON', tier: 2, mods: { proj: 1 } },
  { id: 'fire_infuse', name: 'FIREBRAND', description: 'Infuse Fire DOT', price: 400, icon: '🔥', category: 'WEAPON', tier: 1, mods: {} },
  { id: 'ice_spell', name: 'FROST RING', description: 'Attacks Slow Enemies', price: 650, icon: '❄️', category: 'MAGIC', tier: 2, mods: {} },
  { id: 'upgrade_town', name: 'ECONOMY BOOST', description: 'Upgrade Citadel Prosperity', price: 500, icon: '🏦', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'build_castle', name: 'STRONGHOLD', description: 'Construct a Sentry Castle', price: 800, icon: '🏰', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'horse_whistle', name: 'STEED WHISTLE', description: 'Summon Horse', price: 300, icon: '🐎', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'dragon_call', name: 'DRAKE CALL', description: 'Summon Dragon', price: 3000, icon: '🐲', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'elixir', name: 'ROYAL ELIXIR', description: 'Full Recovery', price: 100, icon: '🧪', category: 'UTILITY', tier: 0, mods: {} },
];

export const TOWN_DIALOGUES = [
  "Welcome, weary traveler. Our town is small, but your gold is always welcome.",
  "Business is booming thanks to you! We've improved our selection.",
  "The Citadel has grown prosperous. We offer only the finest relics now.",
  "You've saved our land. This town is a beacon of hope, and my shop is yours!"
];

export const BIOME_COLORS = {
  SEA: '#001a33',
  LOWLAND: '#3d2b1f', 
  GRASS: '#2d4d1f',
  SWAMP: '#1a1f1a',
  MOUNTAIN: '#3a3a3a',
  TOWN: '#4a4a50'
};
