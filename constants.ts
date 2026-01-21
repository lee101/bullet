
import { ElementType, MountType, ShopItem, SpellData } from './types';

export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

export const WORLD_WIDTH = 16000;
export const WORLD_HEIGHT = 16000;

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
  equippedSpells: ['spell_dash', 'spell_nova', 'spell_heal', 'spell_laser'] as (string | null)[],
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
  BOAT: { speedMult: 1.8, color: '#654321', label: 'BOAT' },
};

export const SKILL_COOLDOWNS = [180, 480, 600, 900]; // X, Y, B, A

export const ENEMY_TYPES = {
  SWARM: { hp: 30, speed: 2.2, radius: 10, damage: 4, color: '#ff3333', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0 },
  SHOOTER: { hp: 70, speed: 1.4, radius: 16, damage: 10, color: '#33ff33', movement: 'SNIPE', isAggressive: true, visionCone: 0, visionRange: 0 },
  TANK: { hp: 300, speed: 0.9, radius: 28, damage: 20, color: '#3333ff', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0 },
  ELITE: { hp: 700, speed: 1.6, radius: 22, damage: 15, color: '#ffff33', movement: 'ORBIT', isAggressive: true, visionCone: 0, visionRange: 0 },
  GHOST: { hp: 120, speed: 3.5, radius: 14, damage: 12, color: '#a020f0', movement: 'WANDER', isAggressive: true, visionCone: 0, visionRange: 0 },
  STALKER: { hp: 200, speed: 2.5, radius: 18, damage: 25, color: '#ff8800', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0 },
  SERPENT: { hp: 150, speed: 1.2, radius: 20, damage: 12, color: '#9933ff', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0 },
  DEER: { hp: 400, speed: 3.0, radius: 25, damage: 10, color: '#ccaa88', movement: 'WANDER', isAggressive: false, visionCone: 0, visionRange: 0 },
  // Idle enemies with vision cones - patrol/guard and attack on sight
  SENTRY: { hp: 180, speed: 2.0, radius: 18, damage: 18, color: '#888888', movement: 'STILL', isAggressive: false, visionCone: 0.7, visionRange: 400 },
  PATROL: { hp: 120, speed: 1.8, radius: 14, damage: 12, color: '#667788', movement: 'PATROL', isAggressive: false, visionCone: 0.5, visionRange: 350 },
  GUARD: { hp: 250, speed: 1.5, radius: 22, damage: 22, color: '#556677', movement: 'STILL', isAggressive: false, visionCone: 0.9, visionRange: 500 },
  WOLF: { hp: 80, speed: 3.5, radius: 12, damage: 15, color: '#554433', movement: 'PATROL', isAggressive: false, visionCone: 0.6, visionRange: 300 },
  BOSS_DRAKE: { hp: 5000, speed: 1.2, radius: 60, damage: 30, color: '#ff0000', movement: 'BOSS_PATTERN', isAggressive: true, visionCone: 0, visionRange: 0 },
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

// Spell definitions for reference
export const SPELL_DATA: Record<string, SpellData> = {
  spell_dash: { type: 'DASH', element: ElementType.PHYSICAL, damage: 0, manaCost: 0, cooldown: 180, range: 380, duration: 10 },
  spell_nova: { type: 'NOVA', element: ElementType.MAGIC, damage: 350, manaCost: 30, cooldown: 480, range: 380, radius: 380 },
  spell_heal: { type: 'HEAL', element: ElementType.MAGIC, damage: -60, manaCost: 40, cooldown: 600, range: 0 },
  spell_laser: { type: 'LASER', element: ElementType.MAGIC, damage: 80, manaCost: 25, cooldown: 900, range: 800, projectileCount: 6 },
  spell_fireball: { type: 'FIREBALL', element: ElementType.FIRE, damage: 120, manaCost: 20, cooldown: 300, range: 600, radius: 80 },
  spell_ice_storm: { type: 'ICE_STORM', element: ElementType.ICE, damage: 60, manaCost: 35, cooldown: 420, range: 400, radius: 200, duration: 180 },
  spell_lightning: { type: 'LIGHTNING_BOLT', element: ElementType.LIGHTNING, damage: 200, manaCost: 25, cooldown: 360, range: 500 },
  spell_meteor: { type: 'METEOR', element: ElementType.FIRE, damage: 500, manaCost: 60, cooldown: 1200, range: 600, radius: 150 },
  spell_poison: { type: 'POISON_CLOUD', element: ElementType.POISON, damage: 30, manaCost: 30, cooldown: 540, range: 350, radius: 120, duration: 300 },
  spell_teleport: { type: 'TELEPORT', element: ElementType.MAGIC, damage: 0, manaCost: 45, cooldown: 720, range: 500 },
  spell_shield: { type: 'SHIELD', element: ElementType.PHYSICAL, damage: 0, manaCost: 50, cooldown: 900, range: 0, duration: 300 },
  spell_earthquake: { type: 'EARTHQUAKE', element: ElementType.PHYSICAL, damage: 150, manaCost: 55, cooldown: 780, range: 0, radius: 300 },
  spell_chain: { type: 'CHAIN_LIGHTNING', element: ElementType.LIGHTNING, damage: 100, manaCost: 40, cooldown: 600, range: 400, projectileCount: 5 },
  spell_drain: { type: 'BLOOD_DRAIN', element: ElementType.POISON, damage: 80, manaCost: 35, cooldown: 480, range: 200 },
  spell_slow: { type: 'TIME_SLOW', element: ElementType.MAGIC, damage: 0, manaCost: 60, cooldown: 1500, range: 0, radius: 500, duration: 180 },
  spell_summon: { type: 'SUMMON', element: ElementType.MAGIC, damage: 50, manaCost: 70, cooldown: 1800, range: 100, duration: 600 },
};

export const SHOP_ITEMS: ShopItem[] = [
  // === WEAPONS ===
  { id: 'dmg_steel', name: 'FORGED STEEL', description: 'Atk +15', price: 250, icon: '⚔️', category: 'WEAPON', tier: 1, mods: { dmg: 15 } },
  { id: 'dmg_blade', name: 'RUNIC BLADE', description: 'Atk +25', price: 450, icon: '🗡️', category: 'WEAPON', tier: 2, mods: { dmg: 25 } },
  { id: 'dmg_axe', name: 'BATTLE AXE', description: 'Atk +40', price: 700, icon: '🪓', category: 'WEAPON', tier: 3, mods: { dmg: 40 } },
  { id: 'proj_bolt', name: 'DUAL CROSSBOW', description: '+1 Projectile', price: 800, icon: '🏹', category: 'WEAPON', tier: 2, mods: { proj: 1 } },
  { id: 'proj_triple', name: 'TRI-SHOT BOW', description: '+2 Projectiles', price: 1500, icon: '🎯', category: 'WEAPON', tier: 3, mods: { proj: 2 } },
  { id: 'fire_infuse', name: 'FIREBRAND', description: 'Infuse Fire DOT', price: 400, icon: '🔥', category: 'WEAPON', tier: 1, mods: { dmg: 10 } },
  { id: 'ice_blade', name: 'FROSTBITE', description: 'Attacks slow enemies', price: 500, icon: '🧊', category: 'WEAPON', tier: 2, mods: { dmg: 12 } },
  { id: 'lightning_spear', name: 'STORM SPEAR', description: 'Chain lightning on hit', price: 900, icon: '⚡', category: 'WEAPON', tier: 3, mods: { dmg: 20 } },

  // === ARMOR ===
  { id: 'hp_armor', name: 'PLATE MAIL', description: 'Max HP +80', price: 300, icon: '🛡️', category: 'ARMOR', tier: 1, mods: { hp: 80 } },
  { id: 'hp_heavy', name: 'DRAGON PLATE', description: 'Max HP +150', price: 600, icon: '🔰', category: 'ARMOR', tier: 2, mods: { hp: 150 } },
  { id: 'hp_titan', name: 'TITAN ARMOR', description: 'Max HP +250', price: 1000, icon: '⛓️', category: 'ARMOR', tier: 3, mods: { hp: 250 } },
  { id: 'spd_boots', name: 'SWIFT BOOTS', description: 'Speed +0.5', price: 200, icon: '👢', category: 'ARMOR', tier: 1, mods: { spd: 0.5 } },
  { id: 'spd_wings', name: 'WIND TREADS', description: 'Speed +1.0', price: 450, icon: '🦋', category: 'ARMOR', tier: 2, mods: { spd: 1.0 } },
  { id: 'spd_flash', name: 'FLASH GREAVES', description: 'Speed +1.5', price: 800, icon: '💨', category: 'ARMOR', tier: 3, mods: { spd: 1.5 } },
  { id: 'balanced', name: 'BATTLE REGALIA', description: 'HP +50, Spd +0.3', price: 400, icon: '👑', category: 'ARMOR', tier: 2, mods: { hp: 50, spd: 0.3 } },

  // === MAGIC ACCESSORIES ===
  { id: 'mp_cloak', name: 'MANA CLOAK', description: 'Max Focus +100', price: 250, icon: '📜', category: 'MAGIC', tier: 1, mods: { mag: 100 } },
  { id: 'mp_orb', name: 'ARCANE ORB', description: 'Max Focus +200', price: 500, icon: '🔮', category: 'MAGIC', tier: 2, mods: { mag: 200 } },
  { id: 'mp_staff', name: 'ELDER STAFF', description: 'Max Focus +350', price: 850, icon: '🪄', category: 'MAGIC', tier: 3, mods: { mag: 350 } },
  { id: 'ice_ring', name: 'FROST RING', description: 'Attacks Slow Enemies', price: 650, icon: '❄️', category: 'MAGIC', tier: 2, mods: { mag: 50 } },
  { id: 'fire_amulet', name: 'EMBER AMULET', description: 'Fire DOT on attacks', price: 550, icon: '🌋', category: 'MAGIC', tier: 2, mods: { dmg: 8 } },

  // === SPELLS (Equippable to skill buttons) ===
  { id: 'spell_dash', name: 'SHADOW DASH', description: 'Quick dash forward', price: 0, icon: '💫', category: 'SPELL', tier: 1, mods: {}, spellData: SPELL_DATA.spell_dash },
  { id: 'spell_nova', name: 'ARCANE NOVA', description: 'AOE magic burst', price: 0, icon: '💥', category: 'SPELL', tier: 1, mods: {}, spellData: SPELL_DATA.spell_nova },
  { id: 'spell_heal', name: 'RESTORATION', description: 'Heal yourself', price: 0, icon: '💚', category: 'SPELL', tier: 1, mods: {}, spellData: SPELL_DATA.spell_heal },
  { id: 'spell_laser', name: 'LASER BARRAGE', description: 'Rapid magic bolts', price: 0, icon: '✨', category: 'SPELL', tier: 1, mods: {}, spellData: SPELL_DATA.spell_laser },
  { id: 'spell_fireball', name: 'FIREBALL', description: 'Explosive fire sphere', price: 400, icon: '🔥', category: 'SPELL', tier: 2, mods: {}, spellData: SPELL_DATA.spell_fireball },
  { id: 'spell_ice_storm', name: 'ICE STORM', description: 'Freezing AOE zone', price: 500, icon: '❄️', category: 'SPELL', tier: 2, mods: {}, spellData: SPELL_DATA.spell_ice_storm },
  { id: 'spell_lightning', name: 'LIGHTNING BOLT', description: 'High damage strike', price: 450, icon: '⚡', category: 'SPELL', tier: 2, mods: {}, spellData: SPELL_DATA.spell_lightning },
  { id: 'spell_meteor', name: 'METEOR STRIKE', description: 'Devastating impact', price: 1200, icon: '☄️', category: 'SPELL', tier: 3, mods: {}, spellData: SPELL_DATA.spell_meteor },
  { id: 'spell_poison', name: 'POISON CLOUD', description: 'Lingering toxic area', price: 550, icon: '☠️', category: 'SPELL', tier: 2, mods: {}, spellData: SPELL_DATA.spell_poison },
  { id: 'spell_teleport', name: 'BLINK', description: 'Teleport to cursor', price: 800, icon: '🌀', category: 'SPELL', tier: 3, mods: {}, spellData: SPELL_DATA.spell_teleport },
  { id: 'spell_shield', name: 'BARRIER', description: 'Temporary invincibility', price: 900, icon: '🛡️', category: 'SPELL', tier: 3, mods: {}, spellData: SPELL_DATA.spell_shield },
  { id: 'spell_earthquake', name: 'EARTHQUAKE', description: 'Ground shatter AOE', price: 750, icon: '🌍', category: 'SPELL', tier: 2, mods: {}, spellData: SPELL_DATA.spell_earthquake },
  { id: 'spell_chain', name: 'CHAIN LIGHTNING', description: 'Bouncing electric arc', price: 650, icon: '🔗', category: 'SPELL', tier: 2, mods: {}, spellData: SPELL_DATA.spell_chain },
  { id: 'spell_drain', name: 'LIFE DRAIN', description: 'Steal enemy HP', price: 700, icon: '🩸', category: 'SPELL', tier: 2, mods: {}, spellData: SPELL_DATA.spell_drain },
  { id: 'spell_slow', name: 'TIME WARP', description: 'Slow all enemies', price: 1500, icon: '⏰', category: 'SPELL', tier: 3, mods: {}, spellData: SPELL_DATA.spell_slow },
  { id: 'spell_summon', name: 'SUMMON FAMILIAR', description: 'Call allied creature', price: 2000, icon: '🐉', category: 'SPELL', tier: 3, mods: {}, spellData: SPELL_DATA.spell_summon },

  // === UTILITY ===
  { id: 'upgrade_town', name: 'ECONOMY BOOST', description: 'Upgrade Citadel Prosperity', price: 500, icon: '🏦', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'build_castle', name: 'STRONGHOLD', description: 'Construct a Sentry Castle', price: 800, icon: '🏰', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'horse_whistle', name: 'STEED WHISTLE', description: 'Summon Horse', price: 300, icon: '🐎', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'dragon_call', name: 'DRAKE CALL', description: 'Summon Dragon', price: 3000, icon: '🐲', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'elixir', name: 'ROYAL ELIXIR', description: 'Full Recovery', price: 100, icon: '🧪', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'xp_tome', name: 'TOME OF WISDOM', description: 'Gain 200 XP', price: 400, icon: '📖', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'gold_charm', name: 'GOLDEN CHARM', description: '+50% gold this wave', price: 250, icon: '💰', category: 'UTILITY', tier: 0, mods: {} },
];

export const TOWN_DIALOGUES = [
  "Welcome, weary traveler. Our town is small, but your gold is always welcome.",
  "Business is booming thanks to you! We've improved our selection.",
  "The Citadel has grown prosperous. We offer only the finest relics now.",
  "You've saved our land. This town is a beacon of hope, and my shop is yours!"
];

export const BIOME_COLORS = {
  SEA: '#0a2a4a',
  SHORE: '#c2b280',
  RIVER: '#1a4a6a',
  LOWLAND: '#3d2b1f',
  GRASS: '#2d4d1f',
  SWAMP: '#1a2f1a',
  FOREST: '#1a3a1a',
  MOUNTAIN: '#4a4a4a',
  SNOW: '#d0d8e0',
  TOWN: '#5a5a60'
};
