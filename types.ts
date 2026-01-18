
export type Vec2 = { x: number; y: number };

export enum ElementType {
  PHYSICAL = 'PHYSICAL',
  FIRE = 'FIRE',
  ICE = 'ICE',
  MAGIC = 'MAGIC',
  LIGHTNING = 'LIGHTNING',
  POISON = 'POISON',
  MELEE = 'MELEE'
}

export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  UPGRADE = 'UPGRADE',
  SHOP = 'SHOP',
  DIALOGUE = 'DIALOGUE',
  GAME_OVER = 'GAME_OVER',
  STATS = 'STATS'
}

export type MountType = 'HORSE' | 'CHARIOT' | 'DRAGON';

export interface Mount {
  id: number;
  pos: Vec2;
  type: MountType;
  life: number;
  angle: number;
  alerted: boolean;
}

export interface WanderingTrader {
  id: number;
  pos: Vec2;
  angle: number;
  speed: number;
  targetPos: Vec2;
}

export interface Castle {
  id: number;
  pos: Vec2;
  level: number;
  range: number;
  cooldown: number;
  maxCooldown: number;
  damage: number;
}

export interface TownState {
  id: number;
  name: string;
  prosperity: number;
  tradeCount: number;
  level: number;
  pos: Vec2;
  goldGeneration: number;
}

export interface FireArea {
  id: number;
  pos: Vec2;
  radius: number;
  life: number;
  maxLife: number;
  damage: number;
  color: string;
}

export interface PlayerStats {
  id: number;
  hp: number;
  maxHp: number;
  magic: number;
  maxMagic: number;
  speed: number;
  xp: number;
  level: number;
  score: number;
  autoAttackCooldown: number;
  manualAttackCooldown: number;
  meleeCooldown: number;
  skillCooldowns: [number, number, number, number]; // X, Y, B, A
  damage: number;
  fireRate: number;
  color: string;
  weaponType: 'BASIC' | 'SPREAD' | 'BEAM';
  weaponAmmo: number;
  limitBreakCharge: number;
  isLimitBreakActive: boolean;
  limitBreakTimer: number;
  z: number;
  zVel: number;
  isBlocking: boolean;
  isDead: boolean;
  reviveProgress: number;
  knockbackVel: Vec2;
  mount: MountType | null;
  weaponSlots: string[];
  armorSlots: string[];
  magicSlots: string[];
  equippedSpells: (string | null)[]; // 4 spell slots for X, Y, B, A
  projectileCount: number;
  // Stats detail for UI
  statsDetail: {
    baseDamage: number;
    baseHp: number;
    baseSpeed: number;
    baseMagic: number;
  };
}

export interface Bullet {
  id: number;
  playerId: number;
  pos: Vec2;
  vel: Vec2;
  damage: number;
  element: ElementType;
  radius: number;
  life: number;
  pierce: number;
}

export interface MeleeAttack {
  id: number;
  playerId: number;
  pos: Vec2;
  angle: number;
  life: number;
  maxLife: number;
  range: number;
  arc: number;
}

export interface Enemy {
  id: number;
  pos: Vec2;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  damage: number;
  type: 'SWARM' | 'SHOOTER' | 'TANK' | 'ELITE' | 'GHOST' | 'BOSS_DRAKE' | 'STALKER' | 'DEER' | 'SERPENT' | 'SENTRY' | 'PATROL' | 'GUARD' | 'WOLF';
  movement: 'CHASE' | 'SNIPE' | 'ORBIT' | 'WANDER' | 'BOSS_PATTERN' | 'STILL' | 'PATROL';
  cooldown: number;
  knockbackVel: Vec2;
  slowTimer: number;
  burnTimer: number;
  poisonTimer: number;
  isAggressive: boolean;
  angle: number;
  visionCone: number;
  visionRange: number;
  patrolTarget?: Vec2;
}

export interface Pickup {
  id: number;
  pos: Vec2;
  type: 'WEAPON_SPREAD' | 'WEAPON_BEAM' | 'REPAIR' | 'MAGIC_BOOST' | 'CHEST';
  life: number;
}

export interface Particle {
  pos: Vec2;
  vel: Vec2;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface DamageNumber {
  id: number;
  pos: Vec2;
  value: number;
  color: string;
  life: number;
  maxLife: number;
  isCrit: boolean;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  price: number;
  category: 'WEAPON' | 'ARMOR' | 'MAGIC' | 'UTILITY' | 'SPELL';
  tier: number;
  mods: {
    dmg?: number;
    hp?: number;
    spd?: number;
    mag?: number;
    proj?: number;
  };
  spellData?: SpellData;
}

export type SpellType =
  | 'FIREBALL' | 'ICE_STORM' | 'LIGHTNING_BOLT' | 'HEAL'
  | 'DASH' | 'NOVA' | 'SUMMON' | 'SHIELD' | 'METEOR'
  | 'POISON_CLOUD' | 'TELEPORT' | 'LASER' | 'EARTHQUAKE'
  | 'CHAIN_LIGHTNING' | 'BLOOD_DRAIN' | 'TIME_SLOW';

export interface SpellData {
  type: SpellType;
  element: ElementType;
  damage: number;
  manaCost: number;
  cooldown: number;
  range: number;
  radius?: number;
  duration?: number;
  projectileCount?: number;
}

export type Biome = 'SEA' | 'LOWLAND' | 'GRASS' | 'SWAMP' | 'MOUNTAIN' | 'TOWN';

export interface Coin {
  id: number;
  pos: Vec2;
  vel: Vec2;
  value: number;
  life: number;
}

export interface UpgradeOption {
  id: string;
  name: string;
  description: string;
  icon: string;
}
