
export type Vec2 = { x: number; y: number };

export enum Faction {
  BLUE = 'BLUE',   // player team
  RED = 'RED',     // enemy faction
  NEUTRAL = 'NEUTRAL'
}

export const FACTION_COLORS = {
  BLUE: ['#4d99ff', '#00bfff', '#1e90ff', '#4169e1', '#00ced1', '#20b2aa'],
  RED: ['#ff4444', '#dc143c', '#ff6347', '#b22222', '#8b0000', '#cd5c5c']
};

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
  LOBBY = 'LOBBY',
  CHARACTER_SELECT = 'CHARACTER_SELECT',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  UPGRADE = 'UPGRADE',
  SHOP = 'SHOP',
  DIALOGUE = 'DIALOGUE',
  GAME_OVER = 'GAME_OVER',
  STATS = 'STATS'
}

export type MountType = 'HORSE' | 'CHARIOT' | 'DRAGON' | 'BOAT';

export interface Mount {
  id: number;
  pos: Vec2;
  type: MountType;
  hp: number;
  maxHp: number;
  angle: number;
  alerted: boolean;
  riders: number[]; // player indices, first is driver
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

export type WallPieceType = 'WALL_STRAIGHT' | 'WALL_CORNER' | 'WALL_GATE' | 'TOWER';

export interface WallPiece {
  id: number;
  pos: Vec2;
  type: WallPieceType;
  hp: number;
  maxHp: number;
  height: number; // 0=ground, 1=wall height (players can jump on)
  rotation: number; // 0, 90, 180, 270 degrees
  isOpen?: boolean; // for gates
}

export interface Tower {
  id: number;
  pos: Vec2;
  hp: number;
  maxHp: number;
  height: number;
  range: number;
  damage: number;
  cooldown: number;
  maxCooldown: number;
  level: number;
}

export type EnemyAttackTarget = 'PLAYER' | 'WALL' | 'TOWER' | 'GATE';

export interface FlyingEnemy {
  canFlyOverWalls: boolean;
}

export interface TownState {
  id: number;
  name: string;
  prosperity: number;
  tradeCount: number;
  level: number;
  pos: Vec2;
  goldGeneration: number;
  style: CityStyle;
  faction: Faction;
}

export interface FactionCastle {
  id: number;
  pos: Vec2;
  faction: Faction;
  hp: number;
  maxHp: number;
  level: number;
  spawnCooldown: number;
  siegeActive: boolean;
  siegeWave: number;
  siegeEnemiesRemaining: number;
}

export interface Ally {
  id: number;
  pos: Vec2;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  type: 'SOLDIER' | 'ARCHER' | 'MAGE' | 'KNIGHT';
  cooldown: number;
  targetId: number | null;
  followPlayerId: number | null;
  behavior: 'FOLLOW' | 'GUARD' | 'ATTACK' | 'WANDER';
  angle: number;
  color: string;
  castCooldown?: number;
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
  characterId: string;
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
  mountId: number | null;
  weaponSlots: string[];
  armorSlots: string[];
  magicSlots: string[];
  equippedSpells: (string | null)[]; // 4 spell slots for X, Y, B, A
  projectileCount: number;
  statPoints: number;
  lastAimAngle: number;
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

export interface SlashEffect {
  id: number;
  pos: Vec2;
  angle: number;
  life: number;
  maxLife: number;
  range: number;
  color: string;
  width: number;
}

export interface FireTelegraph {
  id: number;
  pos: Vec2;
  radius: number;
  life: number;
  maxLife: number;
  flashRate: number;
  damage: number;
}

export interface Enemy {
  id: number;
  pos: Vec2;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  damage: number;
  type: 'SWARM' | 'SHOOTER' | 'TANK' | 'ELITE' | 'GHOST' | 'BOSS_DRAKE' | 'DRAGON_BOSS' | 'STALKER' | 'DEER' | 'SERPENT' | 'SENTRY' | 'PATROL' | 'GUARD' | 'WOLF' | 'DRAGON_ENEMY' | 'HARPY' | 'BOMBER' | 'SPLITTER' | 'SHIELDER' | 'HEALER' | 'CHARGER' | 'PHASER' | 'SPINNER' | 'NECRO' | 'SWARM_QUEEN' | 'MIRROR' | 'MAGE';
  movement: 'CHASE' | 'SNIPE' | 'ORBIT' | 'WANDER' | 'BOSS_PATTERN' | 'STILL' | 'PATROL';
  faction?: Faction;
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
  canFly?: boolean;
  targetWall?: number;
  attackingStructure?: boolean;
  // Special behavior state
  chargeState?: 'idle' | 'windup' | 'charging';
  chargeTimer?: number;
  chargeDir?: Vec2;
  phaseTimer?: number;
  spinAngle?: number;
  spawnTimer?: number;
  reviveTimer?: number;
  shieldActive?: boolean;
  fireBreathCooldown?: number;
  swipeCooldown?: number;
  telegraphCooldown?: number;
}

export interface Pickup {
  id: number;
  pos: Vec2;
  type: 'WEAPON_SPREAD' | 'WEAPON_BEAM' | 'REPAIR' | 'MAGIC_BOOST' | 'CHEST' | 'HEALTH_POTION' | 'MANA_POTION' | 'SPEED_BOOST' | 'DAMAGE_BOOST' | 'COIN_BAG';
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
  text?: string;
  fontSize?: number;
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

export type Biome = 'SEA' | 'SHORE' | 'RIVER' | 'LOWLAND' | 'GRASS' | 'SWAMP' | 'FOREST' | 'MOUNTAIN' | 'SNOW' | 'TOWN';

export type CityStyle = 'MEDIEVAL' | 'DESERT' | 'ASIAN' | 'NORDIC' | 'ELVEN' | 'DWARVEN';

export interface Campfire {
  id: number;
  pos: Vec2;
  radius: number;
}

export interface Torch {
  id: number;
  pos: Vec2;
  flicker: number;
}

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

export type AttackDirection = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'NORTHEAST' | 'NORTHWEST' | 'SOUTHEAST' | 'SOUTHWEST';

export interface WorldEvent {
  id: number;
  type: 'ATTACK_WAVE' | 'BOSS_SPAWN' | 'MERCHANT_CARAVAN' | 'WILD_HUNT' | 'STORM' | 'SIEGE';
  startTime: number;
  duration: number;
  warningTime: number;
  directions?: AttackDirection[];
  intensity: number;
  pos?: Vec2;
  active: boolean;
  announced: boolean;
  castleId?: number;
  waveNum?: number;
  totalWaves?: number;
  enemiesRemaining?: number;
}

export interface EnemyCluster {
  id: number;
  pos: Vec2;
  targetPos: Vec2;
  enemies: number[];
  behavior: 'AGGRESSIVE' | 'HUNTING' | 'PATROLLING' | 'FLEEING' | 'RAIDING';
  morale: number;
  leader?: number;
}

// Magic Wheel System - 8 elements in cardinal/diagonal directions
export enum MagicElement {
  BLACK = 'BLACK',     // Top - dark/void magic
  CURE = 'CURE',       // Bottom - healing/restoration
  FIRE = 'FIRE',       // Right - flames
  ICE = 'ICE',         // Left - frost
  LIGHTNING = 'LIGHTNING', // Top-Right diagonal
  EARTH = 'EARTH',     // Top-Left diagonal
  BLOOD = 'BLOOD',     // Bottom-Left diagonal
  LUMIN = 'LUMIN'      // Bottom-Right diagonal - light magic
}

export type CastMode = 'ATTACK' | 'SELF' | 'WALL' | 'TOWER' | 'AREA';
export type SpellModifier = 'NONE' | 'CHARGED' | 'RAPID' | 'SPLIT' | 'HOMING';

export interface MagicStack {
  elements: MagicElement[];
  maxSize: number;
}

export interface MagicWheelState {
  isOpen: boolean;
  selectedSegment: number; // 0-7, -1 if none
  stack: MagicStack;
  castMode: CastMode;
  aimAngle: number;
  chargeTime: number;
  modifier: SpellModifier;
  chargeLevel: number; // 0-100 for charged spells
}

export interface MagicCombo {
  elements: MagicElement[];
  name: string;
  effect: string;
  baseDamage: number;
  manaCost: number;
  element: ElementType;
}

export interface MagicProjectile {
  id: number;
  pos: Vec2;
  vel: Vec2;
  elements: MagicElement[];
  damage: number;
  radius: number;
  life: number;
  maxLife: number;
  playerId: number;
  pierce: number;
  aoe: boolean;
  aoeRadius: number;
  modifier: SpellModifier;
  splitCount: number; // how many times can still split
  homing: boolean;
  homingTarget?: number; // enemy id
}

export type PassiveId = 'iaido' | 'hex' | 'shadow_step' | 'divine_shield' | 'soul_harvest' | 'battle_hymn' | 'natures_gift' |
  'fire_aura' | 'frost_armor' | 'storm_call' | 'shadow_cloak' | 'earth_shield' | 'light_burst' | 'water_flow' | 'wind_dash' |
  'dragon_blood' | 'vampiric' | 'lycanthropy' | 'slime_split' | 'angelic' | 'demonic' | 'undead' | 'spectral' | 'beastial' | 'feral' | 'ancient' | 'corrupted' |
  'dark_pact' | 'blood_magic' | 'war_cry' | 'shadow_dance' | 'holy_light' | 'plague' | 'arcane_surge' | 'wild_growth' | 'stone_skin' | 'blade_dance' |
  'chef_special' | 'mime_trick' | 'merchant_luck' | 'scarecrow_fear' | 'chicken_rage' |
  'phoenix_rebirth' | 'titan_strength' | 'void_walk' | 'time_warp' | 'world_eater';

export interface CharacterPassive {
  id: PassiveId;
  name: string;
  description: string;
}

export interface CharacterDef {
  id: string;
  name: string;
  description: string;
  stats: { hp: number; speed: number; damage: number; magic: number };
  passive: CharacterPassive;
  unlockCondition?: { type: 'CHALLENGE'; challengeId: string; description: string };
  artPaths: { portrait: string; sprite: string; icon: string };
}

export type InputType = 'KEYBOARD_WASD' | 'KEYBOARD_ARROWS' | 'GAMEPAD';

export interface LobbySlot {
  joined: boolean;
  controllerId: number | null;
  inputType: InputType;
  selectedCharacter: string | null;
  ready: boolean;
}

export interface LobbyState {
  slots: [LobbySlot, LobbySlot, LobbySlot, LobbySlot];
  allReady: boolean;
}

export interface CharacterProgress {
  unlockedCharacters: string[];
  completedChallenges: string[];
}

export type ChallengeType = 'KILL_BOSS' | 'REACH_WAVE' | 'COLLECT_GOLD' | 'NO_DAMAGE_WAVE' | 'KILL_COUNT' | 'PLAY_AS';

export interface Challenge {
  id: string;
  name: string;
  description: string;
  condition: {
    type: ChallengeType;
    target?: string;
    amount?: number;
  };
  unlocksCharacter: string;
}

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  playerIndex: number;
}
