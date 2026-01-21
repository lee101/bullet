
import { ElementType, MountType, ShopItem, SpellData, CharacterDef, Challenge } from './types';

export let CANVAS_WIDTH = window.innerWidth;
export let CANVAS_HEIGHT = window.innerHeight;

export const updateCanvasSize = () => {
  CANVAS_WIDTH = window.innerWidth;
  CANVAS_HEIGHT = window.innerHeight;
};

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

export const getXpForLevel = (level: number): number => Math.floor(80 + level * 40 + Math.pow(level, 1.8) * 10);

export const STAT_POINTS_PER_LEVEL = 3;

export const STAT_POINT_VALUES = {
  hp: { cost: 1, gain: 20 },
  damage: { cost: 1, gain: 4 },
  magic: { cost: 1, gain: 15 },
  speed: { cost: 2, gain: 0.15 },
};

export const INITIAL_PLAYER_STATS = {
  characterId: 'samurai',
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
  mountId: null as number | null,
  weaponSlots: [] as string[],
  armorSlots: [] as string[],
  magicSlots: [] as string[],
  equippedSpells: ['spell_dash', 'spell_nova', 'spell_heal', 'spell_laser'] as (string | null)[],
  projectileCount: 1,
  statPoints: 0,
  lastAimAngle: 0,
  statsDetail: {
    baseDamage: 15,
    baseHp: 100,
    baseSpeed: 3.2,
    baseMagic: 100
  }
};

export const MOUNT_CONFIGS = {
  HORSE: { speedMult: 2.0, color: '#8B4513', label: 'STEED', hp: 150, maxRiders: 1 },
  CHARIOT: { speedMult: 2.3, color: '#DAA520', label: 'WAR CHARIOT', hp: 250, maxRiders: 4 },
  DRAGON: { speedMult: 3.0, color: '#DC143C', label: 'DRAKE', hp: 500, maxRiders: 4 },
  BOAT: { speedMult: 1.8, color: '#654321', label: 'BOAT', hp: 200, maxRiders: 4 },
};

export const SKILL_COOLDOWNS = [180, 480, 600, 900]; // X, Y, B, A

export const ENEMY_TYPES = {
  SWARM: { hp: 30, speed: 2.2, radius: 10, damage: 4, color: '#cc0000', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 2 },
  SHOOTER: { hp: 70, speed: 1.4, radius: 16, damage: 10, color: '#8b0000', movement: 'SNIPE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 5 },
  TANK: { hp: 300, speed: 0.9, radius: 28, damage: 20, color: '#2a0a0a', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 15 },
  ELITE: { hp: 700, speed: 1.6, radius: 22, damage: 15, color: '#ff2222', movement: 'ORBIT', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 10 },
  GHOST: { hp: 120, speed: 3.5, radius: 14, damage: 12, color: '#660022', movement: 'WANDER', isAggressive: true, visionCone: 0, visionRange: 0, canFly: true, wallDamage: 0 },
  STALKER: { hp: 200, speed: 2.5, radius: 18, damage: 25, color: '#aa0000', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 8 },
  SERPENT: { hp: 150, speed: 1.2, radius: 20, damage: 12, color: '#550011', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 6 },
  DEER: { hp: 400, speed: 3.0, radius: 25, damage: 10, color: '#ccaa88', movement: 'WANDER', isAggressive: false, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 0 },
  SENTRY: { hp: 180, speed: 2.0, radius: 18, damage: 18, color: '#440000', movement: 'STILL', isAggressive: false, visionCone: 0.7, visionRange: 400, canFly: false, wallDamage: 5 },
  PATROL: { hp: 120, speed: 1.8, radius: 14, damage: 12, color: '#330000', movement: 'PATROL', isAggressive: false, visionCone: 0.5, visionRange: 350, canFly: false, wallDamage: 4 },
  GUARD: { hp: 250, speed: 1.5, radius: 22, damage: 22, color: '#220000', movement: 'STILL', isAggressive: false, visionCone: 0.9, visionRange: 500, canFly: false, wallDamage: 8 },
  WOLF: { hp: 80, speed: 3.5, radius: 12, damage: 15, color: '#3a1010', movement: 'PATROL', isAggressive: false, visionCone: 0.6, visionRange: 300, canFly: false, wallDamage: 3 },
  BOSS_DRAKE: { hp: 5000, speed: 1.2, radius: 60, damage: 30, color: '#ff0000', movement: 'BOSS_PATTERN', isAggressive: true, visionCone: 0, visionRange: 0, canFly: true, wallDamage: 50 },
  DRAGON_ENEMY: { hp: 800, speed: 2.0, radius: 40, damage: 25, color: '#cc2200', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: true, wallDamage: 20 },
  DRAGON_BOSS: { hp: 4500, speed: 1.8, radius: 80, damage: 250, color: '#ff2200', movement: 'BOSS_PATTERN', isAggressive: true, visionCone: 0, visionRange: 0, canFly: true, wallDamage: 100 },
  HARPY: { hp: 100, speed: 3.8, radius: 16, damage: 15, color: '#881133', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: true, wallDamage: 0 },
  // Melee-only enemies
  BRUTE: { hp: 220, speed: 1.8, radius: 26, damage: 30, color: '#880000', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 18 },
  RAVAGER: { hp: 140, speed: 3.2, radius: 16, damage: 22, color: '#bb0011', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 8 },
  BERSERKER: { hp: 100, speed: 4.0, radius: 14, damage: 28, color: '#ff1100', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 6 },
  JUGGERNAUT: { hp: 500, speed: 0.7, radius: 36, damage: 45, color: '#1a0000', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 25 },
  LURKER: { hp: 60, speed: 2.8, radius: 12, damage: 18, color: '#2a0505', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 3 },
  // Tactical enemies - force player decisions
  BOMBER: { hp: 45, speed: 2.8, radius: 14, damage: 8, color: '#cc2200', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 0, explodeRadius: 120, explodeDamage: 80 },
  SPLITTER: { hp: 160, speed: 1.8, radius: 22, damage: 12, color: '#771122', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 4 },
  SHIELDER: { hp: 200, speed: 1.2, radius: 20, damage: 8, color: '#991111', movement: 'ORBIT', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 3, shieldRadius: 150 },
  HEALER: { hp: 80, speed: 1.5, radius: 16, damage: 5, color: '#661122', movement: 'ORBIT', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 0, healAmount: 8, healRadius: 180 },
  CHARGER: { hp: 180, speed: 1.0, radius: 24, damage: 35, color: '#cc0000', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 12, chargeSpeed: 12, chargeWindup: 60 },
  PHASER: { hp: 90, speed: 2.2, radius: 14, damage: 18, color: '#660033', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: true, wallDamage: 0, phaseInterval: 180 },
  SPINNER: { hp: 250, speed: 0.8, radius: 26, damage: 10, color: '#aa1100', movement: 'WANDER', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 6, spinRate: 0.08, bulletInterval: 12 },
  NECRO: { hp: 300, speed: 1.0, radius: 22, damage: 12, color: '#330011', movement: 'SNIPE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 5, reviveRadius: 300, reviveDelay: 300 },
  SWARM_QUEEN: { hp: 400, speed: 0.9, radius: 32, damage: 15, color: '#bb0022', movement: 'ORBIT', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 8, spawnInterval: 240, spawnCount: 3 },
  MIRROR: { hp: 120, speed: 1.6, radius: 18, damage: 0, color: '#550022', movement: 'ORBIT', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 0, reflectChance: 0.4 },
  MAGE: { hp: 200, speed: 1.8, radius: 16, damage: 25, color: '#660000', movement: 'SNIPE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 5, spellCooldown: 120 },
};

export const ALLY_CONFIGS = {
  SOLDIER: { hp: 150, speed: 2.2, damage: 12, color: '#4d99ff', attackRange: 40, attackCooldown: 45 },
  ARCHER: { hp: 100, speed: 2.0, damage: 18, color: '#00bfff', attackRange: 400, attackCooldown: 60 },
  MAGE: { hp: 80, speed: 1.8, damage: 35, color: '#20b2aa', attackRange: 350, attackCooldown: 90, spellCooldown: 150 },
  KNIGHT: { hp: 300, speed: 1.5, damage: 25, color: '#1e90ff', attackRange: 50, attackCooldown: 60 },
};

export const FACTION_CASTLE_CONFIG = {
  hp: 2000,
  spawnInterval: 600,
  siegeWaves: 5,
  enemiesPerWave: 8,
  captureRadius: 400,
};

export const WALL_CONFIGS = {
  WALL_STRAIGHT: { hp: 500, width: 80, height: 20, cost: 100, color: '#6b5b4f' },
  WALL_CORNER: { hp: 600, width: 40, height: 40, cost: 120, color: '#5a4a3f' },
  WALL_GATE: { hp: 400, width: 100, height: 20, cost: 200, color: '#7a6a5f' },
  TOWER: { hp: 800, width: 60, height: 60, cost: 400, range: 350, damage: 25, cooldown: 45, color: '#4a3a2f' },
};

export const WALL_HEIGHT = 40;
export const BUILD_GRID_SIZE = 40;

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
  // === WEAPONS === (themed, evocative names)
  { id: 'dmg_steel', name: 'OBSIDIAN EDGE', description: 'Volcanic glass blade', price: 250, icon: '⚔️', category: 'WEAPON', tier: 1, mods: { dmg: 15 } },
  { id: 'dmg_blade', name: 'VOID REAVER', description: 'Cuts through dimensions', price: 450, icon: '🗡️', category: 'WEAPON', tier: 2, mods: { dmg: 25 } },
  { id: 'dmg_axe', name: 'WORLDSPLITTER', description: 'Cleaves reality itself', price: 700, icon: '🪓', category: 'WEAPON', tier: 3, mods: { dmg: 40 } },
  { id: 'proj_bolt', name: 'TWIN FANGS', description: 'Serpent-tooth bolts', price: 800, icon: '🏹', category: 'WEAPON', tier: 2, mods: { proj: 1 } },
  { id: 'proj_triple', name: 'HYDRA BOW', description: 'Three heads, three shots', price: 1500, icon: '🎯', category: 'WEAPON', tier: 3, mods: { proj: 2 } },
  { id: 'fire_infuse', name: 'DRAGONMAW', description: 'Burns with ancient fire', price: 400, icon: '🔥', category: 'WEAPON', tier: 1, mods: { dmg: 10 } },
  { id: 'ice_blade', name: 'PERMAFROST', description: 'Freezes on contact', price: 500, icon: '🧊', category: 'WEAPON', tier: 2, mods: { dmg: 12 } },
  { id: 'lightning_spear', name: 'THUNDERGOD LANCE', description: 'Storms follow its path', price: 900, icon: '⚡', category: 'WEAPON', tier: 3, mods: { dmg: 20 } },
  { id: 'poison_dagger', name: 'VIPERFANG', description: 'Venom-coated assassin blade', price: 350, icon: '🗡️', category: 'WEAPON', tier: 1, mods: { dmg: 8 } },
  { id: 'chaos_blade', name: 'ENTROPY', description: 'Randomizes damage wildly', price: 600, icon: '🌀', category: 'WEAPON', tier: 2, mods: { dmg: 18 } },
  { id: 'giant_hammer', name: 'EARTHSHAKER', description: 'Slow but devastating', price: 550, icon: '🔨', category: 'WEAPON', tier: 2, mods: { dmg: 35 } },

  // === ARMOR === (protective themes)
  { id: 'hp_armor', name: 'IRONBARK MAIL', description: 'Ancient tree protection', price: 300, icon: '🛡️', category: 'ARMOR', tier: 1, mods: { hp: 80 } },
  { id: 'hp_heavy', name: 'DRAGONSCALE', description: 'Wyrm-forged plates', price: 600, icon: '🔰', category: 'ARMOR', tier: 2, mods: { hp: 150 } },
  { id: 'hp_titan', name: 'COLOSSUS HEART', description: 'Giant\'s endurance', price: 1000, icon: '⛓️', category: 'ARMOR', tier: 3, mods: { hp: 250 } },
  { id: 'spd_boots', name: 'WINDRUNNER', description: 'Light as morning mist', price: 200, icon: '👢', category: 'ARMOR', tier: 1, mods: { spd: 0.5 } },
  { id: 'spd_wings', name: 'ZEPHYR STRIDE', description: 'Walk on air currents', price: 450, icon: '🦋', category: 'ARMOR', tier: 2, mods: { spd: 1.0 } },
  { id: 'spd_flash', name: 'QUICKSILVER', description: 'Liquid metal boots', price: 800, icon: '💨', category: 'ARMOR', tier: 3, mods: { spd: 1.5 } },
  { id: 'balanced', name: 'KNIGHT ERRANT', description: 'Balanced for quests', price: 400, icon: '👑', category: 'ARMOR', tier: 2, mods: { hp: 50, spd: 0.3 } },
  { id: 'dodge_cloak', name: 'SHADOWMELD', description: 'Phase through danger', price: 700, icon: '🌑', category: 'ARMOR', tier: 2, mods: { spd: 0.4, hp: 30 } },
  { id: 'regen_ring', name: 'PHOENIX PLUME', description: 'Slowly regenerates', price: 900, icon: '🔥', category: 'ARMOR', tier: 3, mods: { hp: 100 } },

  // === MAGIC ACCESSORIES === (arcane themes)
  { id: 'mp_cloak', name: 'STARWEAVE', description: 'Woven from night sky', price: 250, icon: '📜', category: 'MAGIC', tier: 1, mods: { mag: 100 } },
  { id: 'mp_orb', name: 'VOID CRYSTAL', description: 'Contains infinite dark', price: 500, icon: '🔮', category: 'MAGIC', tier: 2, mods: { mag: 200 } },
  { id: 'mp_staff', name: 'WORLDTREE BRANCH', description: 'Channel primal magic', price: 850, icon: '🪄', category: 'MAGIC', tier: 3, mods: { mag: 350 } },
  { id: 'ice_ring', name: 'FROSTBOUND SIGIL', description: 'Winter\'s eternal grip', price: 650, icon: '❄️', category: 'MAGIC', tier: 2, mods: { mag: 50 } },
  { id: 'fire_amulet', name: 'EMBER HEART', description: 'Core of a dying star', price: 550, icon: '🌋', category: 'MAGIC', tier: 2, mods: { dmg: 8 } },
  { id: 'chaos_gem', name: 'PANDEMONIUM STONE', description: 'Warps spell effects', price: 750, icon: '💎', category: 'MAGIC', tier: 3, mods: { mag: 150, dmg: 5 } },
  { id: 'blood_pact', name: 'CRIMSON COVENANT', description: 'Power through sacrifice', price: 400, icon: '🩸', category: 'MAGIC', tier: 2, mods: { dmg: 15 } },

  // === SPELLS (Equippable to skill buttons) ===
  { id: 'spell_dash', name: 'SHADOWSTEP', description: 'Phase through space', price: 0, icon: '💫', category: 'SPELL', tier: 1, mods: {}, spellData: SPELL_DATA.spell_dash },
  { id: 'spell_nova', name: 'VOID BURST', description: 'Reality-rending wave', price: 0, icon: '💥', category: 'SPELL', tier: 1, mods: {}, spellData: SPELL_DATA.spell_nova },
  { id: 'spell_heal', name: 'LIFEBLOOM', description: 'Nature\'s embrace', price: 0, icon: '💚', category: 'SPELL', tier: 1, mods: {}, spellData: SPELL_DATA.spell_heal },
  { id: 'spell_laser', name: 'STARFALL', description: 'Rain of light', price: 0, icon: '✨', category: 'SPELL', tier: 1, mods: {}, spellData: SPELL_DATA.spell_laser },
  { id: 'spell_fireball', name: 'HELLFIRE ORB', description: 'Infernal detonation', price: 400, icon: '🔥', category: 'SPELL', tier: 2, mods: {}, spellData: SPELL_DATA.spell_fireball },
  { id: 'spell_ice_storm', name: 'ABSOLUTE ZERO', description: 'Entropy\'s end', price: 500, icon: '❄️', category: 'SPELL', tier: 2, mods: {}, spellData: SPELL_DATA.spell_ice_storm },
  { id: 'spell_lightning', name: 'GODSTRIKE', description: 'Divine judgment', price: 450, icon: '⚡', category: 'SPELL', tier: 2, mods: {}, spellData: SPELL_DATA.spell_lightning },
  { id: 'spell_meteor', name: 'EXTINCTION', description: 'Apocalyptic impact', price: 1200, icon: '☄️', category: 'SPELL', tier: 3, mods: {}, spellData: SPELL_DATA.spell_meteor },
  { id: 'spell_poison', name: 'MIASMA', description: 'Plague incarnate', price: 550, icon: '☠️', category: 'SPELL', tier: 2, mods: {}, spellData: SPELL_DATA.spell_poison },
  { id: 'spell_teleport', name: 'DIMENSION DOOR', description: 'Fold spacetime', price: 800, icon: '🌀', category: 'SPELL', tier: 3, mods: {}, spellData: SPELL_DATA.spell_teleport },
  { id: 'spell_shield', name: 'AEGIS', description: 'Divine protection', price: 900, icon: '🛡️', category: 'SPELL', tier: 3, mods: {}, spellData: SPELL_DATA.spell_shield },
  { id: 'spell_earthquake', name: 'WORLDBREAKER', description: 'Tectonic fury', price: 750, icon: '🌍', category: 'SPELL', tier: 2, mods: {}, spellData: SPELL_DATA.spell_earthquake },
  { id: 'spell_chain', name: 'ARC STORM', description: 'Lightning cascade', price: 650, icon: '🔗', category: 'SPELL', tier: 2, mods: {}, spellData: SPELL_DATA.spell_chain },
  { id: 'spell_drain', name: 'SOULREAP', description: 'Consume life essence', price: 700, icon: '🩸', category: 'SPELL', tier: 2, mods: {}, spellData: SPELL_DATA.spell_drain },
  { id: 'spell_slow', name: 'TEMPORAL RIFT', description: 'Fracture time', price: 1500, icon: '⏰', category: 'SPELL', tier: 3, mods: {}, spellData: SPELL_DATA.spell_slow },
  { id: 'spell_summon', name: 'ELDRITCH CALL', description: 'Summon the beyond', price: 2000, icon: '🐉', category: 'SPELL', tier: 3, mods: {}, spellData: SPELL_DATA.spell_summon },

  // === UTILITY === (consumables and services)
  { id: 'upgrade_town', name: 'GILDED CHARTER', description: 'Expand citadel influence', price: 500, icon: '🏦', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'build_castle', name: 'WATCHTOWER DEED', description: 'Construct sentry post', price: 800, icon: '🏰', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'build_wall', name: 'RAMPART STONE', description: 'Fortification segment', price: 100, icon: '🧱', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'build_corner', name: 'CORNERSTONE', description: 'Angled fortification', price: 120, icon: '🔲', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'build_gate', name: 'IRONBOUND GATE', description: 'Controlled passage', price: 200, icon: '🚪', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'build_tower', name: 'SENTINEL SPIRE', description: 'Automated defense', price: 400, icon: '🗼', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'horse_whistle', name: 'WARHORSE HORN', description: 'Call loyal steed', price: 300, icon: '🐎', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'dragon_call', name: 'WYRM WHISTLE', description: 'Summon ancient drake', price: 3000, icon: '🐲', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'elixir', name: 'PHOENIX TEARS', description: 'Full restoration', price: 100, icon: '🧪', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'xp_tome', name: 'ANCIENT GRIMOIRE', description: 'Absorb knowledge', price: 400, icon: '📖', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'gold_charm', name: 'MIDAS TOUCH', description: 'Gold attraction aura', price: 250, icon: '💰', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'bomb_kit', name: 'POWDER KEG', description: 'Throwable explosion', price: 150, icon: '💣', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'scout_map', name: 'CARTOGRAPHER\'S EYE', description: 'Reveal nearby area', price: 200, icon: '🗺️', category: 'UTILITY', tier: 0, mods: {} },
  { id: 'speed_potion', name: 'QUICKSTEP DRAUGHT', description: 'Temporary haste', price: 175, icon: '⚗️', category: 'UTILITY', tier: 0, mods: {} },

  // === MAGIC WHEEL UPGRADES === (element mastery and stack powers)
  { id: 'wheel_stack_1', name: 'ARCANE FOCUS', description: '+1 element stack slot', price: 500, icon: 'O', category: 'MAGIC', tier: 2, mods: { mag: 25 } },
  { id: 'wheel_stack_2', name: 'VOID CONDUIT', description: '+2 element stack slots', price: 1200, icon: 'OO', category: 'MAGIC', tier: 3, mods: { mag: 50 } },
  { id: 'wheel_charge', name: 'SPELL AMPLIFIER', description: 'Charged casts deal 2x', price: 800, icon: '++', category: 'MAGIC', tier: 2, mods: { mag: 30 } },
  { id: 'wheel_rapid', name: 'QUICKCAST RUNE', description: 'Halve cast cooldown', price: 600, icon: '>>', category: 'MAGIC', tier: 2, mods: {} },
  { id: 'wheel_split', name: 'BIFURCATION SIGIL', description: 'Projectiles split on hit', price: 900, icon: 'YY', category: 'MAGIC', tier: 3, mods: {} },

  // === ELEMENTAL TOMES === (unlock/boost specific elements)
  { id: 'tome_fire', name: 'PYRONOMICON', description: 'Fire deals +50% damage', price: 450, icon: 'F', category: 'MAGIC', tier: 2, mods: { dmg: 5 } },
  { id: 'tome_ice', name: 'CRYOMANCER CODEX', description: 'Ice slows 2x longer', price: 450, icon: 'I', category: 'MAGIC', tier: 2, mods: {} },
  { id: 'tome_lightning', name: 'STORM SCRIPTURE', description: 'Lightning chains +2 targets', price: 550, icon: 'Z', category: 'MAGIC', tier: 2, mods: {} },
  { id: 'tome_earth', name: 'GEOMANCER TABLET', description: 'Earth walls have 2x HP', price: 500, icon: 'E', category: 'MAGIC', tier: 2, mods: { hp: 30 } },
  { id: 'tome_blood', name: 'HEMOMANCY GRIMOIRE', description: 'Blood heals on damage', price: 650, icon: 'B', category: 'MAGIC', tier: 3, mods: {} },
  { id: 'tome_lumin', name: 'RADIANT TESTAMENT', description: 'Lumin blinds enemies', price: 550, icon: 'L', category: 'MAGIC', tier: 2, mods: {} },
  { id: 'tome_black', name: 'VOID MANUSCRIPT', description: 'Black ignores armor', price: 700, icon: 'V', category: 'MAGIC', tier: 3, mods: { dmg: 10 } },
  { id: 'tome_cure', name: 'VITA LEXICON', description: 'Cure heals allies too', price: 600, icon: '+', category: 'MAGIC', tier: 2, mods: { hp: 50 } },

  // === COMBO SCROLLS === (unlock special combos)
  { id: 'scroll_inferno', name: 'INFERNO SCROLL', description: 'Unlock FFF super combo', price: 800, icon: 'FFF', category: 'MAGIC', tier: 3, mods: {} },
  { id: 'scroll_blizzard', name: 'BLIZZARD SCROLL', description: 'Unlock III super combo', price: 800, icon: 'III', category: 'MAGIC', tier: 3, mods: {} },
  { id: 'scroll_chaos', name: 'CHAOS SCROLL', description: 'Unlock V+L chaos combo', price: 1500, icon: 'VL', category: 'MAGIC', tier: 3, mods: {} },
  { id: 'scroll_harmony', name: 'HARMONY SCROLL', description: 'Unlock 4-element storm', price: 2000, icon: 'FIZE', category: 'MAGIC', tier: 3, mods: {} },
];

export const TOWN_DIALOGUES = [
  "Welcome, weary traveler. Our town is small, but your gold is always welcome.",
  "Business is booming thanks to you! We've improved our selection.",
  "The Citadel has grown prosperous. We offer only the finest relics now.",
  "You've saved our land. This town is a beacon of hope, and my shop is yours!"
];

export const SHOP_TIPS = [
  "Click both sticks together when your power is full to unleash your Limit Break!",
  "Each warrior has a unique Limit Break. Blue warriors teleport and slash!",
  "Pink warriors summon a magic storm during their Limit Break.",
  "Green warriors unleash a rapid barrage of arrows in their Limit Break.",
  "Golden warriors heal and damage all nearby foes with holy light.",
  "Your Limit Break power slowly charges as you fight. Patience pays off.",
  "The Magic Wheel lets you combine elements. Hold LB to open it!",
  "Camps with fires heal you slowly. Rest when you need it.",
  "Towns fully heal you once every two minutes. Use them wisely!",
  "Mounts make travel faster. Press R near one to ride!",
  "Dragons can breathe fire! Your skills become flame breath while riding.",
  "Build walls and towers to defend your territory.",
  "Some enemies only attack when they spot you. Stay out of their sight.",
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

export const CITY_HEAL_COOLDOWN = 7200; // 2 minutes at 60fps

export const CITY_STYLES = {
  MEDIEVAL: { color: '#5a5a60', accent: '#8B4513', name: 'Castle' },
  DESERT: { color: '#c2a060', accent: '#daa520', name: 'Oasis' },
  ASIAN: { color: '#8b0000', accent: '#ffd700', name: 'Pagoda' },
  NORDIC: { color: '#4a6a7a', accent: '#d0d8e0', name: 'Hall' },
  ELVEN: { color: '#2a5a3a', accent: '#98fb98', name: 'Grove' },
  DWARVEN: { color: '#4a3a2a', accent: '#b87333', name: 'Hold' },
};

export const CAMPFIRE_CONFIG = {
  radius: 60,
  healPerSecond: 2,
};

export const PLAYER_TEAM_COLORS = ['#4d99ff', '#87ceeb', '#b0e0e6', '#f0f8ff'];
export const ENEMY_TEAM_COLORS = ['#cc0000', '#8b0000', '#2a0000', '#1a0a0a'];

export const PLAYER_COLORS = ['#4d99ff', '#87ceeb', '#b0e0e6', '#e0ffff'];

export const STARTER_CHARACTERS: CharacterDef[] = [
  { id: 'samurai', name: 'SAMURAI', description: 'Balanced warrior with swift blade', stats: { hp: 120, speed: 3.2, damage: 22, magic: 60 }, passive: { id: 'iaido', name: 'Iaido', description: 'First hit after dash deals 2x damage' }, artPaths: { portrait: '/assets/characters/samurai_portrait.png', sprite: '/assets/characters/samurai_sprite.png', icon: '/assets/characters/samurai_icon.png' } },
  { id: 'witch', name: 'WITCH', description: 'High magic caster with hexes', stats: { hp: 65, speed: 2.9, damage: 10, magic: 180 }, passive: { id: 'hex', name: 'Hex', description: 'Spells apply debuff stack, 3 stacks = bonus damage' }, artPaths: { portrait: '/assets/characters/witch_portrait.png', sprite: '/assets/characters/witch_sprite.png', icon: '/assets/characters/witch_icon.png' } },
  { id: 'ninja', name: 'NINJA', description: 'Fast assassin with shadow powers', stats: { hp: 80, speed: 4.2, damage: 20, magic: 50 }, passive: { id: 'shadow_step', name: 'Shadow Step', description: 'Perfect block grants brief invulnerability' }, artPaths: { portrait: '/assets/characters/ninja_portrait.png', sprite: '/assets/characters/ninja_sprite.png', icon: '/assets/characters/ninja_icon.png' } },
  { id: 'paladin', name: 'PALADIN', description: 'Holy knight with protective aura', stats: { hp: 180, speed: 2.6, damage: 18, magic: 70 }, passive: { id: 'divine_shield', name: 'Divine Shield', description: 'Blocking heals nearby allies' }, artPaths: { portrait: '/assets/characters/paladin_portrait.png', sprite: '/assets/characters/paladin_sprite.png', icon: '/assets/characters/paladin_icon.png' } },
  { id: 'necromancer', name: 'NECROMANCER', description: 'Dark mage who commands the dead', stats: { hp: 60, speed: 2.8, damage: 12, magic: 170 }, passive: { id: 'soul_harvest', name: 'Soul Harvest', description: 'Kills spawn temporary ghost ally' }, artPaths: { portrait: '/assets/characters/necromancer_portrait.png', sprite: '/assets/characters/necromancer_sprite.png', icon: '/assets/characters/necromancer_icon.png' } },
  { id: 'bard', name: 'BARD', description: 'Musical support with buffs', stats: { hp: 90, speed: 3.4, damage: 12, magic: 140 }, passive: { id: 'battle_hymn', name: 'Battle Hymn', description: 'Nearby allies gain 15% speed boost' }, artPaths: { portrait: '/assets/characters/bard_portrait.png', sprite: '/assets/characters/bard_sprite.png', icon: '/assets/characters/bard_icon.png' } },
  { id: 'druid', name: 'DRUID', description: 'Nature mage with regeneration', stats: { hp: 75, speed: 3.0, damage: 10, magic: 160 }, passive: { id: 'natures_gift', name: "Nature's Gift", description: 'Regenerate HP while in forest biome' }, artPaths: { portrait: '/assets/characters/druid_portrait.png', sprite: '/assets/characters/druid_sprite.png', icon: '/assets/characters/druid_icon.png' } },
];

export const UNLOCKABLE_CHARACTERS: CharacterDef[] = [
  // Elemental variants (8)
  { id: 'fire_samurai', name: 'FIRE SAMURAI', description: 'Blade wreathed in flames', stats: { hp: 110, speed: 3.3, damage: 26, magic: 55 }, passive: { id: 'fire_aura', name: 'Fire Aura', description: 'Melee attacks burn enemies' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'burn_100', description: 'Burn 100 enemies' }, artPaths: { portrait: '/assets/characters/fire_samurai_portrait.png', sprite: '/assets/characters/fire_samurai_sprite.png', icon: '/assets/characters/fire_samurai_icon.png' } },
  { id: 'ice_witch', name: 'ICE WITCH', description: 'Mistress of frost magic', stats: { hp: 55, speed: 2.7, damage: 8, magic: 200 }, passive: { id: 'frost_armor', name: 'Frost Armor', description: 'Taking damage slows attacker' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'freeze_50', description: 'Freeze 50 enemies' }, artPaths: { portrait: '/assets/characters/ice_witch_portrait.png', sprite: '/assets/characters/ice_witch_sprite.png', icon: '/assets/characters/ice_witch_icon.png' } },
  { id: 'storm_ninja', name: 'STORM NINJA', description: 'Lightning-fast striker', stats: { hp: 75, speed: 4.8, damage: 24, magic: 45 }, passive: { id: 'storm_call', name: 'Storm Call', description: 'Dash leaves lightning trail' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'shock_75', description: 'Shock 75 enemies' }, artPaths: { portrait: '/assets/characters/storm_ninja_portrait.png', sprite: '/assets/characters/storm_ninja_sprite.png', icon: '/assets/characters/storm_ninja_icon.png' } },
  { id: 'shadow_paladin', name: 'SHADOW PALADIN', description: 'Fallen knight of darkness', stats: { hp: 160, speed: 2.7, damage: 20, magic: 65 }, passive: { id: 'shadow_cloak', name: 'Shadow Cloak', description: 'Blocking absorbs damage as mana' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'block_200', description: 'Block 200 attacks' }, artPaths: { portrait: '/assets/characters/shadow_paladin_portrait.png', sprite: '/assets/characters/shadow_paladin_sprite.png', icon: '/assets/characters/shadow_paladin_icon.png' } },
  { id: 'earth_druid', name: 'EARTH DRUID', description: 'Stone and root master', stats: { hp: 70, speed: 2.6, damage: 10, magic: 175 }, passive: { id: 'earth_shield', name: 'Earth Shield', description: 'Standing still grants damage reduction' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'tank_1000', description: 'Take 1000 damage in one run' }, artPaths: { portrait: '/assets/characters/earth_druid_portrait.png', sprite: '/assets/characters/earth_druid_sprite.png', icon: '/assets/characters/earth_druid_icon.png' } },
  { id: 'light_bard', name: 'LIGHT BARD', description: 'Radiant songweaver', stats: { hp: 80, speed: 3.4, damage: 10, magic: 165 }, passive: { id: 'light_burst', name: 'Light Burst', description: 'Healing spells also deal AOE damage' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'heal_500', description: 'Heal 500 HP total' }, artPaths: { portrait: '/assets/characters/light_bard_portrait.png', sprite: '/assets/characters/light_bard_sprite.png', icon: '/assets/characters/light_bard_icon.png' } },
  { id: 'water_necro', name: 'WATER NECROMANCER', description: 'Drowned soul summoner', stats: { hp: 55, speed: 2.9, damage: 12, magic: 185 }, passive: { id: 'water_flow', name: 'Water Flow', description: 'Ghosts slow enemies they pass through' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'summon_30', description: 'Summon 30 ghosts' }, artPaths: { portrait: '/assets/characters/water_necro_portrait.png', sprite: '/assets/characters/water_necro_sprite.png', icon: '/assets/characters/water_necro_icon.png' } },
  { id: 'wind_ninja', name: 'WIND NINJA', description: 'Swift as the gale', stats: { hp: 70, speed: 5.2, damage: 22, magic: 40 }, passive: { id: 'wind_dash', name: 'Wind Dash', description: 'Dash cooldown reduced by 50%' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'dash_100', description: 'Dash 100 times' }, artPaths: { portrait: '/assets/characters/wind_ninja_portrait.png', sprite: '/assets/characters/wind_ninja_sprite.png', icon: '/assets/characters/wind_ninja_icon.png' } },

  // Monster roster (12)
  { id: 'dragon_knight', name: 'DRAGON KNIGHT', description: 'Warrior bonded with a drake', stats: { hp: 200, speed: 2.4, damage: 32, magic: 45 }, passive: { id: 'dragon_blood', name: 'Dragon Blood', description: 'Fire damage heals instead of hurts' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'kill_dragon', description: 'Defeat Dragon Boss' }, artPaths: { portrait: '/assets/characters/dragon_knight_portrait.png', sprite: '/assets/characters/dragon_knight_sprite.png', icon: '/assets/characters/dragon_knight_icon.png' } },
  { id: 'vampire', name: 'VAMPIRE', description: 'Immortal blood drinker', stats: { hp: 85, speed: 3.6, damage: 24, magic: 90 }, passive: { id: 'vampiric', name: 'Vampiric', description: 'Lifesteal on all attacks' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'drain_300', description: 'Drain 300 HP from enemies' }, artPaths: { portrait: '/assets/characters/vampire_portrait.png', sprite: '/assets/characters/vampire_sprite.png', icon: '/assets/characters/vampire_icon.png' } },
  { id: 'werewolf', name: 'WEREWOLF', description: 'Savage beast warrior', stats: { hp: 130, speed: 4.4, damage: 30, magic: 35 }, passive: { id: 'lycanthropy', name: 'Lycanthropy', description: 'Speed and damage increase at low HP' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'low_hp_kills', description: 'Kill 50 enemies below 30% HP' }, artPaths: { portrait: '/assets/characters/werewolf_portrait.png', sprite: '/assets/characters/werewolf_sprite.png', icon: '/assets/characters/werewolf_icon.png' } },
  { id: 'slime', name: 'SLIME', description: 'Bouncy blob creature', stats: { hp: 250, speed: 2.0, damage: 8, magic: 40 }, passive: { id: 'slime_split', name: 'Slime Split', description: 'Taking fatal damage splits into 2 weaker slimes' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'survive_20', description: 'Survive 20 waves' }, artPaths: { portrait: '/assets/characters/slime_portrait.png', sprite: '/assets/characters/slime_sprite.png', icon: '/assets/characters/slime_icon.png' } },
  { id: 'angel', name: 'ANGEL', description: 'Divine messenger', stats: { hp: 70, speed: 3.6, damage: 10, magic: 180 }, passive: { id: 'angelic', name: 'Angelic', description: 'Revive once per run with 50% HP' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'revive_ally', description: 'Revive allies 10 times' }, artPaths: { portrait: '/assets/characters/angel_portrait.png', sprite: '/assets/characters/angel_sprite.png', icon: '/assets/characters/angel_icon.png' } },
  { id: 'demon', name: 'DEMON', description: 'Infernal destroyer', stats: { hp: 140, speed: 3.2, damage: 35, magic: 55 }, passive: { id: 'demonic', name: 'Demonic', description: 'Damage increases with kill streak' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'streak_20', description: 'Get a 20 kill streak' }, artPaths: { portrait: '/assets/characters/demon_portrait.png', sprite: '/assets/characters/demon_sprite.png', icon: '/assets/characters/demon_icon.png' } },
  { id: 'skeleton', name: 'SKELETON', description: 'Undead warrior', stats: { hp: 90, speed: 3.4, damage: 22, magic: 50 }, passive: { id: 'undead', name: 'Undead', description: 'Immune to poison, healing reduced 50%' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'kill_necro', description: 'Defeat 10 Necromancers' }, artPaths: { portrait: '/assets/characters/skeleton_portrait.png', sprite: '/assets/characters/skeleton_sprite.png', icon: '/assets/characters/skeleton_icon.png' } },
  { id: 'ghost_player', name: 'GHOST', description: 'Ethereal specter', stats: { hp: 50, speed: 4.0, damage: 14, magic: 175 }, passive: { id: 'spectral', name: 'Spectral', description: 'Can phase through enemies and walls briefly' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'kill_ghosts', description: 'Kill 100 ghosts' }, artPaths: { portrait: '/assets/characters/ghost_portrait.png', sprite: '/assets/characters/ghost_sprite.png', icon: '/assets/characters/ghost_icon.png' } },
  { id: 'minotaur', name: 'MINOTAUR', description: 'Brutal beast of the labyrinth', stats: { hp: 220, speed: 2.3, damage: 38, magic: 25 }, passive: { id: 'beastial', name: 'Beastial', description: 'Charge attack deals triple damage' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'kill_tanks', description: 'Kill 50 Tank enemies' }, artPaths: { portrait: '/assets/characters/minotaur_portrait.png', sprite: '/assets/characters/minotaur_sprite.png', icon: '/assets/characters/minotaur_icon.png' } },
  { id: 'harpy_player', name: 'HARPY', description: 'Winged predator', stats: { hp: 65, speed: 4.6, damage: 22, magic: 60 }, passive: { id: 'feral', name: 'Feral', description: 'Attacks from above deal bonus damage' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'jump_kills', description: 'Kill 30 enemies while airborne' }, artPaths: { portrait: '/assets/characters/harpy_portrait.png', sprite: '/assets/characters/harpy_sprite.png', icon: '/assets/characters/harpy_icon.png' } },
  { id: 'golem', name: 'GOLEM', description: 'Animated stone construct', stats: { hp: 320, speed: 1.6, damage: 28, magic: 20 }, passive: { id: 'ancient', name: 'Ancient', description: 'Immune to knockback' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'build_walls', description: 'Build 50 wall segments' }, artPaths: { portrait: '/assets/characters/golem_portrait.png', sprite: '/assets/characters/golem_sprite.png', icon: '/assets/characters/golem_icon.png' } },
  { id: 'lich', name: 'LICH', description: 'Undead archmage', stats: { hp: 50, speed: 2.5, damage: 12, magic: 220 }, passive: { id: 'corrupted', name: 'Corrupted', description: 'Spells cost HP instead of mana' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'cast_200', description: 'Cast 200 spells' }, artPaths: { portrait: '/assets/characters/lich_portrait.png', sprite: '/assets/characters/lich_sprite.png', icon: '/assets/characters/lich_icon.png' } },

  // Class variants (10)
  { id: 'dark_paladin', name: 'DARK PALADIN', description: 'Corrupted holy knight', stats: { hp: 170, speed: 2.8, damage: 24, magic: 60 }, passive: { id: 'dark_pact', name: 'Dark Pact', description: 'Sacrifice HP to boost damage temporarily' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'play_paladin', description: 'Complete 10 runs as Paladin' }, artPaths: { portrait: '/assets/characters/dark_paladin_portrait.png', sprite: '/assets/characters/dark_paladin_sprite.png', icon: '/assets/characters/dark_paladin_icon.png' } },
  { id: 'blood_necro', name: 'BLOOD NECROMANCER', description: 'Life magic corruptor', stats: { hp: 60, speed: 2.9, damage: 14, magic: 190 }, passive: { id: 'blood_magic', name: 'Blood Magic', description: 'Ghosts explode on death dealing AOE' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'play_necro', description: 'Complete 10 runs as Necromancer' }, artPaths: { portrait: '/assets/characters/blood_necro_portrait.png', sprite: '/assets/characters/blood_necro_sprite.png', icon: '/assets/characters/blood_necro_icon.png' } },
  { id: 'war_bard', name: 'WAR BARD', description: 'Battle-hardened musician', stats: { hp: 130, speed: 3.0, damage: 20, magic: 80 }, passive: { id: 'war_cry', name: 'War Cry', description: 'Nearby allies deal 20% more damage' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'play_bard', description: 'Complete 10 runs as Bard' }, artPaths: { portrait: '/assets/characters/war_bard_portrait.png', sprite: '/assets/characters/war_bard_sprite.png', icon: '/assets/characters/war_bard_icon.png' } },
  { id: 'shadow_ninja', name: 'SHADOW NINJA', description: 'Master of stealth', stats: { hp: 70, speed: 4.5, damage: 28, magic: 45 }, passive: { id: 'shadow_dance', name: 'Shadow Dance', description: 'Become invisible briefly after killing' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'play_ninja', description: 'Complete 10 runs as Ninja' }, artPaths: { portrait: '/assets/characters/shadow_ninja_portrait.png', sprite: '/assets/characters/shadow_ninja_sprite.png', icon: '/assets/characters/shadow_ninja_icon.png' } },
  { id: 'holy_druid', name: 'HOLY DRUID', description: 'Light-blessed nature mage', stats: { hp: 65, speed: 3.1, damage: 10, magic: 185 }, passive: { id: 'holy_light', name: 'Holy Light', description: 'Healing creates light damage zone' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'play_druid', description: 'Complete 10 runs as Druid' }, artPaths: { portrait: '/assets/characters/holy_druid_portrait.png', sprite: '/assets/characters/holy_druid_sprite.png', icon: '/assets/characters/holy_druid_icon.png' } },
  { id: 'plague_witch', name: 'PLAGUE WITCH', description: 'Mistress of disease', stats: { hp: 55, speed: 2.8, damage: 10, magic: 195 }, passive: { id: 'plague', name: 'Plague', description: 'Debuffs spread to nearby enemies' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'play_witch', description: 'Complete 10 runs as Witch' }, artPaths: { portrait: '/assets/characters/plague_witch_portrait.png', sprite: '/assets/characters/plague_witch_sprite.png', icon: '/assets/characters/plague_witch_icon.png' } },
  { id: 'arcane_samurai', name: 'ARCANE SAMURAI', description: 'Magic-infused swordmaster', stats: { hp: 100, speed: 3.3, damage: 22, magic: 100 }, passive: { id: 'arcane_surge', name: 'Arcane Surge', description: 'Melee kills restore mana' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'play_samurai', description: 'Complete 10 runs as Samurai' }, artPaths: { portrait: '/assets/characters/arcane_samurai_portrait.png', sprite: '/assets/characters/arcane_samurai_sprite.png', icon: '/assets/characters/arcane_samurai_icon.png' } },
  { id: 'wild_druid', name: 'WILD DRUID', description: 'Feral shapeshifter', stats: { hp: 110, speed: 3.8, damage: 20, magic: 90 }, passive: { id: 'wild_growth', name: 'Wild Growth', description: 'Gain stacking speed in forests' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'forest_time', description: 'Spend 10 minutes in forests' }, artPaths: { portrait: '/assets/characters/wild_druid_portrait.png', sprite: '/assets/characters/wild_druid_sprite.png', icon: '/assets/characters/wild_druid_icon.png' } },
  { id: 'stone_paladin', name: 'STONE PALADIN', description: 'Immovable defender', stats: { hp: 240, speed: 2.0, damage: 22, magic: 50 }, passive: { id: 'stone_skin', name: 'Stone Skin', description: 'Take 25% less damage while blocking' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'perfect_blocks', description: 'Perfect block 100 times' }, artPaths: { portrait: '/assets/characters/stone_paladin_portrait.png', sprite: '/assets/characters/stone_paladin_sprite.png', icon: '/assets/characters/stone_paladin_icon.png' } },
  { id: 'blade_dancer', name: 'BLADE DANCER', description: 'Graceful dual wielder', stats: { hp: 85, speed: 4.0, damage: 30, magic: 45 }, passive: { id: 'blade_dance', name: 'Blade Dance', description: 'Attack speed increases with consecutive hits' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'melee_500', description: 'Kill 500 enemies with melee' }, artPaths: { portrait: '/assets/characters/blade_dancer_portrait.png', sprite: '/assets/characters/blade_dancer_sprite.png', icon: '/assets/characters/blade_dancer_icon.png' } },

  // Joke characters (5)
  { id: 'chef', name: 'CHEF', description: 'Culinary combatant', stats: { hp: 120, speed: 2.9, damage: 18, magic: 70 }, passive: { id: 'chef_special', name: 'Chef Special', description: 'Potions heal 50% more' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'use_potions', description: 'Use 50 potions' }, artPaths: { portrait: '/assets/characters/chef_portrait.png', sprite: '/assets/characters/chef_sprite.png', icon: '/assets/characters/chef_icon.png' } },
  { id: 'mime', name: 'MIME', description: 'Silent performer', stats: { hp: 70, speed: 3.4, damage: 10, magic: 150 }, passive: { id: 'mime_trick', name: 'Mime Trick', description: 'Invisible walls block projectiles briefly' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'dodge_100', description: 'Dodge 100 projectiles' }, artPaths: { portrait: '/assets/characters/mime_portrait.png', sprite: '/assets/characters/mime_sprite.png', icon: '/assets/characters/mime_icon.png' } },
  { id: 'merchant', name: 'MERCHANT', description: 'Gold-obsessed trader', stats: { hp: 100, speed: 3.0, damage: 12, magic: 100 }, passive: { id: 'merchant_luck', name: 'Merchant Luck', description: 'Enemies drop 50% more gold' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'collect_gold', description: 'Collect 10000 gold total' }, artPaths: { portrait: '/assets/characters/merchant_portrait.png', sprite: '/assets/characters/merchant_sprite.png', icon: '/assets/characters/merchant_icon.png' } },
  { id: 'scarecrow', name: 'SCARECROW', description: 'Animated field guardian', stats: { hp: 80, speed: 2.7, damage: 16, magic: 110 }, passive: { id: 'scarecrow_fear', name: 'Scarecrow Fear', description: 'Weak enemies flee from you' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'scare_enemies', description: 'Make 200 enemies flee' }, artPaths: { portrait: '/assets/characters/scarecrow_portrait.png', sprite: '/assets/characters/scarecrow_sprite.png', icon: '/assets/characters/scarecrow_icon.png' } },
  { id: 'chicken', name: 'CHICKEN', description: 'Surprisingly fierce fowl', stats: { hp: 35, speed: 4.8, damage: 40, magic: 20 }, passive: { id: 'chicken_rage', name: 'Chicken Rage', description: 'Glass cannon - huge damage, low HP' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'no_hit_wave', description: 'Complete a wave without taking damage' }, artPaths: { portrait: '/assets/characters/chicken_portrait.png', sprite: '/assets/characters/chicken_sprite.png', icon: '/assets/characters/chicken_icon.png' } },

  // Legendaries (5)
  { id: 'phoenix', name: 'PHOENIX', description: 'Eternal fire bird', stats: { hp: 90, speed: 3.8, damage: 14, magic: 180 }, passive: { id: 'phoenix_rebirth', name: 'Phoenix Rebirth', description: 'Revive at full HP once, then explode on death' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'beat_boss_drake', description: 'Defeat Boss Drake' }, artPaths: { portrait: '/assets/characters/phoenix_portrait.png', sprite: '/assets/characters/phoenix_sprite.png', icon: '/assets/characters/phoenix_icon.png' } },
  { id: 'titan', name: 'TITAN', description: 'Ancient giant', stats: { hp: 400, speed: 1.4, damage: 45, magic: 30 }, passive: { id: 'titan_strength', name: 'Titan Strength', description: 'Melee attacks create shockwaves' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'reach_wave_30', description: 'Reach wave 30' }, artPaths: { portrait: '/assets/characters/titan_portrait.png', sprite: '/assets/characters/titan_sprite.png', icon: '/assets/characters/titan_icon.png' } },
  { id: 'void_walker', name: 'VOID WALKER', description: 'Between dimensions', stats: { hp: 60, speed: 3.4, damage: 12, magic: 210 }, passive: { id: 'void_walk', name: 'Void Walk', description: 'Teleport leaves damaging rift' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'teleport_50', description: 'Use teleport 50 times' }, artPaths: { portrait: '/assets/characters/void_walker_portrait.png', sprite: '/assets/characters/void_walker_sprite.png', icon: '/assets/characters/void_walker_icon.png' } },
  { id: 'time_keeper', name: 'TIME KEEPER', description: 'Master of temporal magic', stats: { hp: 65, speed: 3.2, damage: 10, magic: 220 }, passive: { id: 'time_warp', name: 'Time Warp', description: 'All cooldowns reduced by 20%' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'use_time_slow', description: 'Use Time Slow spell 25 times' }, artPaths: { portrait: '/assets/characters/time_keeper_portrait.png', sprite: '/assets/characters/time_keeper_sprite.png', icon: '/assets/characters/time_keeper_icon.png' } },
  { id: 'world_eater', name: 'WORLD EATER', description: 'Cosmic devourer', stats: { hp: 200, speed: 2.6, damage: 50, magic: 80 }, passive: { id: 'world_eater', name: 'World Eater', description: 'Killing bosses permanently increases all stats' }, unlockCondition: { type: 'CHALLENGE', challengeId: 'kill_all_bosses', description: 'Defeat every boss type' }, artPaths: { portrait: '/assets/characters/world_eater_portrait.png', sprite: '/assets/characters/world_eater_sprite.png', icon: '/assets/characters/world_eater_icon.png' } },
];

export const ALL_CHARACTERS: CharacterDef[] = [...STARTER_CHARACTERS, ...UNLOCKABLE_CHARACTERS];

export const CHALLENGES: Challenge[] = [
  { id: 'burn_100', name: 'Pyromaniac', description: 'Burn 100 enemies', condition: { type: 'KILL_COUNT', target: 'burn', amount: 100 }, unlocksCharacter: 'fire_samurai' },
  { id: 'freeze_50', name: 'Ice Age', description: 'Freeze 50 enemies', condition: { type: 'KILL_COUNT', target: 'freeze', amount: 50 }, unlocksCharacter: 'ice_witch' },
  { id: 'shock_75', name: 'Conductor', description: 'Shock 75 enemies', condition: { type: 'KILL_COUNT', target: 'shock', amount: 75 }, unlocksCharacter: 'storm_ninja' },
  { id: 'block_200', name: 'Immovable', description: 'Block 200 attacks', condition: { type: 'KILL_COUNT', target: 'block', amount: 200 }, unlocksCharacter: 'shadow_paladin' },
  { id: 'tank_1000', name: 'Damage Sponge', description: 'Take 1000 damage in one run', condition: { type: 'COLLECT_GOLD', amount: 1000 }, unlocksCharacter: 'earth_druid' },
  { id: 'heal_500', name: 'Field Medic', description: 'Heal 500 HP total', condition: { type: 'COLLECT_GOLD', amount: 500 }, unlocksCharacter: 'light_bard' },
  { id: 'summon_30', name: 'Necrolord', description: 'Summon 30 ghosts', condition: { type: 'KILL_COUNT', target: 'summon', amount: 30 }, unlocksCharacter: 'water_necro' },
  { id: 'dash_100', name: 'Speed Demon', description: 'Dash 100 times', condition: { type: 'KILL_COUNT', target: 'dash', amount: 100 }, unlocksCharacter: 'wind_ninja' },
  { id: 'kill_dragon', name: 'Dragon Slayer', description: 'Defeat Dragon Boss', condition: { type: 'KILL_BOSS', target: 'DRAGON_BOSS' }, unlocksCharacter: 'dragon_knight' },
  { id: 'drain_300', name: 'Blood Drinker', description: 'Drain 300 HP from enemies', condition: { type: 'COLLECT_GOLD', amount: 300 }, unlocksCharacter: 'vampire' },
  { id: 'low_hp_kills', name: 'Living Dangerously', description: 'Kill 50 enemies below 30% HP', condition: { type: 'KILL_COUNT', target: 'low_hp', amount: 50 }, unlocksCharacter: 'werewolf' },
  { id: 'survive_20', name: 'Survivor', description: 'Survive 20 waves', condition: { type: 'REACH_WAVE', amount: 20 }, unlocksCharacter: 'slime' },
  { id: 'revive_ally', name: 'Guardian Angel', description: 'Revive allies 10 times', condition: { type: 'KILL_COUNT', target: 'revive', amount: 10 }, unlocksCharacter: 'angel' },
  { id: 'streak_20', name: 'Unstoppable', description: 'Get a 20 kill streak', condition: { type: 'KILL_COUNT', target: 'streak', amount: 20 }, unlocksCharacter: 'demon' },
  { id: 'kill_necro', name: 'Death to Undeath', description: 'Defeat 10 Necromancers', condition: { type: 'KILL_COUNT', target: 'NECRO', amount: 10 }, unlocksCharacter: 'skeleton' },
  { id: 'kill_ghosts', name: 'Ghostbuster', description: 'Kill 100 ghosts', condition: { type: 'KILL_COUNT', target: 'GHOST', amount: 100 }, unlocksCharacter: 'ghost_player' },
  { id: 'kill_tanks', name: 'Tank Hunter', description: 'Kill 50 Tank enemies', condition: { type: 'KILL_COUNT', target: 'TANK', amount: 50 }, unlocksCharacter: 'minotaur' },
  { id: 'jump_kills', name: 'Death from Above', description: 'Kill 30 enemies while airborne', condition: { type: 'KILL_COUNT', target: 'air_kill', amount: 30 }, unlocksCharacter: 'harpy_player' },
  { id: 'build_walls', name: 'Architect', description: 'Build 50 wall segments', condition: { type: 'KILL_COUNT', target: 'wall', amount: 50 }, unlocksCharacter: 'golem' },
  { id: 'cast_200', name: 'Archmage', description: 'Cast 200 spells', condition: { type: 'KILL_COUNT', target: 'spell', amount: 200 }, unlocksCharacter: 'lich' },
  { id: 'play_paladin', name: 'Paladin Master', description: 'Complete 10 runs as Paladin', condition: { type: 'PLAY_AS', target: 'paladin', amount: 10 }, unlocksCharacter: 'dark_paladin' },
  { id: 'play_necro', name: 'Necro Master', description: 'Complete 10 runs as Necromancer', condition: { type: 'PLAY_AS', target: 'necromancer', amount: 10 }, unlocksCharacter: 'blood_necro' },
  { id: 'play_bard', name: 'Bard Master', description: 'Complete 10 runs as Bard', condition: { type: 'PLAY_AS', target: 'bard', amount: 10 }, unlocksCharacter: 'war_bard' },
  { id: 'play_ninja', name: 'Ninja Master', description: 'Complete 10 runs as Ninja', condition: { type: 'PLAY_AS', target: 'ninja', amount: 10 }, unlocksCharacter: 'shadow_ninja' },
  { id: 'play_druid', name: 'Druid Master', description: 'Complete 10 runs as Druid', condition: { type: 'PLAY_AS', target: 'druid', amount: 10 }, unlocksCharacter: 'holy_druid' },
  { id: 'play_witch', name: 'Witch Master', description: 'Complete 10 runs as Witch', condition: { type: 'PLAY_AS', target: 'witch', amount: 10 }, unlocksCharacter: 'plague_witch' },
  { id: 'play_samurai', name: 'Samurai Master', description: 'Complete 10 runs as Samurai', condition: { type: 'PLAY_AS', target: 'samurai', amount: 10 }, unlocksCharacter: 'arcane_samurai' },
  { id: 'forest_time', name: 'Forest Dweller', description: 'Spend 10 minutes in forests', condition: { type: 'COLLECT_GOLD', amount: 600 }, unlocksCharacter: 'wild_druid' },
  { id: 'perfect_blocks', name: 'Perfect Guard', description: 'Perfect block 100 times', condition: { type: 'KILL_COUNT', target: 'perfect_block', amount: 100 }, unlocksCharacter: 'stone_paladin' },
  { id: 'melee_500', name: 'Blade Master', description: 'Kill 500 enemies with melee', condition: { type: 'KILL_COUNT', target: 'melee', amount: 500 }, unlocksCharacter: 'blade_dancer' },
  { id: 'use_potions', name: 'Alchemist', description: 'Use 50 potions', condition: { type: 'KILL_COUNT', target: 'potion', amount: 50 }, unlocksCharacter: 'chef' },
  { id: 'dodge_100', name: 'Untouchable', description: 'Dodge 100 projectiles', condition: { type: 'KILL_COUNT', target: 'dodge', amount: 100 }, unlocksCharacter: 'mime' },
  { id: 'collect_gold', name: 'Midas', description: 'Collect 10000 gold total', condition: { type: 'COLLECT_GOLD', amount: 10000 }, unlocksCharacter: 'merchant' },
  { id: 'scare_enemies', name: 'Terrorizer', description: 'Make 200 enemies flee', condition: { type: 'KILL_COUNT', target: 'scare', amount: 200 }, unlocksCharacter: 'scarecrow' },
  { id: 'no_hit_wave', name: 'Perfect Wave', description: 'Complete a wave without taking damage', condition: { type: 'NO_DAMAGE_WAVE' }, unlocksCharacter: 'chicken' },
  { id: 'beat_boss_drake', name: 'Drake Slayer', description: 'Defeat Boss Drake', condition: { type: 'KILL_BOSS', target: 'BOSS_DRAKE' }, unlocksCharacter: 'phoenix' },
  { id: 'reach_wave_30', name: 'Endurance', description: 'Reach wave 30', condition: { type: 'REACH_WAVE', amount: 30 }, unlocksCharacter: 'titan' },
  { id: 'teleport_50', name: 'Blinker', description: 'Use teleport 50 times', condition: { type: 'KILL_COUNT', target: 'teleport', amount: 50 }, unlocksCharacter: 'void_walker' },
  { id: 'use_time_slow', name: 'Chronomancer', description: 'Use Time Slow spell 25 times', condition: { type: 'KILL_COUNT', target: 'time_slow', amount: 25 }, unlocksCharacter: 'time_keeper' },
  { id: 'kill_all_bosses', name: 'Boss Hunter', description: 'Defeat every boss type', condition: { type: 'KILL_BOSS', target: 'all' }, unlocksCharacter: 'world_eater' },
];
