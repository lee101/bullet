
import { ElementType, MountType, ShopItem, SpellData } from './types';

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
  statPoints: 0,
  statsDetail: {
    baseDamage: 15,
    baseHp: 100,
    baseSpeed: 3.2,
    baseMagic: 100
  }
};

export const MOUNT_CONFIGS = {
  HORSE: { speedMult: 2.0, color: '#8B4513', label: 'STEED', hp: 150 },
  CHARIOT: { speedMult: 2.3, color: '#DAA520', label: 'WAR CHARIOT', hp: 250 },
  DRAGON: { speedMult: 3.0, color: '#DC143C', label: 'DRAKE', hp: 500 },
  BOAT: { speedMult: 1.8, color: '#654321', label: 'BOAT', hp: 200 },
};

export const SKILL_COOLDOWNS = [180, 480, 600, 900]; // X, Y, B, A

export const ENEMY_TYPES = {
  SWARM: { hp: 30, speed: 2.2, radius: 10, damage: 4, color: '#ff3333', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 2 },
  SHOOTER: { hp: 70, speed: 1.4, radius: 16, damage: 10, color: '#33ff33', movement: 'SNIPE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 5 },
  TANK: { hp: 300, speed: 0.9, radius: 28, damage: 20, color: '#3333ff', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 15 },
  ELITE: { hp: 700, speed: 1.6, radius: 22, damage: 15, color: '#ffff33', movement: 'ORBIT', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 10 },
  GHOST: { hp: 120, speed: 3.5, radius: 14, damage: 12, color: '#a020f0', movement: 'WANDER', isAggressive: true, visionCone: 0, visionRange: 0, canFly: true, wallDamage: 0 },
  STALKER: { hp: 200, speed: 2.5, radius: 18, damage: 25, color: '#ff8800', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 8 },
  SERPENT: { hp: 150, speed: 1.2, radius: 20, damage: 12, color: '#9933ff', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 6 },
  DEER: { hp: 400, speed: 3.0, radius: 25, damage: 10, color: '#ccaa88', movement: 'WANDER', isAggressive: false, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 0 },
  SENTRY: { hp: 180, speed: 2.0, radius: 18, damage: 18, color: '#888888', movement: 'STILL', isAggressive: false, visionCone: 0.7, visionRange: 400, canFly: false, wallDamage: 5 },
  PATROL: { hp: 120, speed: 1.8, radius: 14, damage: 12, color: '#667788', movement: 'PATROL', isAggressive: false, visionCone: 0.5, visionRange: 350, canFly: false, wallDamage: 4 },
  GUARD: { hp: 250, speed: 1.5, radius: 22, damage: 22, color: '#556677', movement: 'STILL', isAggressive: false, visionCone: 0.9, visionRange: 500, canFly: false, wallDamage: 8 },
  WOLF: { hp: 80, speed: 3.5, radius: 12, damage: 15, color: '#554433', movement: 'PATROL', isAggressive: false, visionCone: 0.6, visionRange: 300, canFly: false, wallDamage: 3 },
  BOSS_DRAKE: { hp: 5000, speed: 1.2, radius: 60, damage: 30, color: '#ff0000', movement: 'BOSS_PATTERN', isAggressive: true, visionCone: 0, visionRange: 0, canFly: true, wallDamage: 50 },
  DRAGON_ENEMY: { hp: 800, speed: 2.0, radius: 40, damage: 25, color: '#cc2200', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: true, wallDamage: 20 },
  DRAGON_BOSS: { hp: 8000, speed: 1.8, radius: 80, damage: 250, color: '#ff2200', movement: 'BOSS_PATTERN', isAggressive: true, visionCone: 0, visionRange: 0, canFly: true, wallDamage: 100 },
  HARPY: { hp: 100, speed: 3.8, radius: 16, damage: 15, color: '#aa66cc', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: true, wallDamage: 0 },
  // Tactical enemies - force player decisions
  BOMBER: { hp: 45, speed: 2.8, radius: 14, damage: 8, color: '#ff6600', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 0, explodeRadius: 120, explodeDamage: 80 },
  SPLITTER: { hp: 160, speed: 1.8, radius: 22, damage: 12, color: '#44cc88', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 4 },
  SHIELDER: { hp: 200, speed: 1.2, radius: 20, damage: 8, color: '#6699ff', movement: 'ORBIT', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 3, shieldRadius: 150 },
  HEALER: { hp: 80, speed: 1.5, radius: 16, damage: 5, color: '#66ff99', movement: 'ORBIT', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 0, healAmount: 8, healRadius: 180 },
  CHARGER: { hp: 180, speed: 1.0, radius: 24, damage: 35, color: '#cc4444', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 12, chargeSpeed: 12, chargeWindup: 60 },
  PHASER: { hp: 90, speed: 2.2, radius: 14, damage: 18, color: '#cc66ff', movement: 'CHASE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: true, wallDamage: 0, phaseInterval: 180 },
  SPINNER: { hp: 250, speed: 0.8, radius: 26, damage: 10, color: '#ffcc00', movement: 'WANDER', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 6, spinRate: 0.08, bulletInterval: 12 },
  NECRO: { hp: 300, speed: 1.0, radius: 22, damage: 12, color: '#330066', movement: 'SNIPE', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 5, reviveRadius: 300, reviveDelay: 300 },
  SWARM_QUEEN: { hp: 400, speed: 0.9, radius: 32, damage: 15, color: '#ff3366', movement: 'ORBIT', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 8, spawnInterval: 240, spawnCount: 3 },
  MIRROR: { hp: 120, speed: 1.6, radius: 18, damage: 0, color: '#aaddff', movement: 'ORBIT', isAggressive: true, visionCone: 0, visionRange: 0, canFly: false, wallDamage: 0, reflectChance: 0.4 },
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
