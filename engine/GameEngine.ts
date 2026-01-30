
import {
  Vec2,
  PlayerStats,
  Bullet,
  Enemy,
  ElementType,
  GameState,
  Particle,
  DamageNumber,
  Pickup,
  Coin,
  Mount,
  MountType,
  TownState,
  FireArea,
  WanderingTrader,
  WallPiece,
  Tower,
  WallPieceType,
  WorldEvent,
  AttackDirection,
  EnemyCluster,
  Campfire,
  SlashEffect,
  FireTelegraph,
  MagicWheelState,
  MagicElement,
  MagicProjectile,
  Faction,
  FactionCastle,
  Ally,
  Torch
} from '../types';
import { terrainRenderer } from './TerrainRenderer';
import { assetManager } from './AssetManager';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  PLAYER_RADIUS,
  INITIAL_PLAYER_STATS,
  ENEMY_TYPES,
  ELEMENT_COLORS,
  SKILL_COOLDOWNS,
  LIMIT_BREAK_MAX_CHARGE,
  LIMIT_BREAK_DURATION,
  LIMIT_BREAK_REGEN_PER_FRAME,
  JUMP_FORCE,
  GRAVITY,
  MOUNT_CONFIGS,
  MAX_SLOTS,
  SHOP_ITEMS,
  SPELL_DATA,
  getXpForLevel,
  STAT_POINTS_PER_LEVEL,
  STAT_POINT_VALUES,
  WALL_CONFIGS,
  WALL_HEIGHT,
  BUILD_GRID_SIZE,
  CITY_HEAL_COOLDOWN,
  TOWN_RADIUS,
  ALLY_CONFIGS,
  FACTION_CASTLE_CONFIG,
  PLAYER_TEAM_COLORS,
  PLAYER_COLORS,
  ALL_CHARACTERS
} from '../constants';
import { InputType, CharacterDef } from '../types';
import { InputManager } from './InputManager';
import { WorldGenerator } from './WorldGenerator';
import { MagicWheel, ELEMENT_COLORS as MAGIC_ELEMENT_COLORS } from './MagicWheel';
import { SpatialHash } from './SpatialHash';
import { enginePerf } from './perf';
import { progressManager } from './ProgressManager';

const BIOME_ENEMIES: Record<string, (keyof typeof ENEMY_TYPES)[]> = {
  GRASS: ['DEER', 'WOLF', 'PATROL', 'BOMBER'],
  FOREST: ['WOLF', 'STALKER', 'GUARD', 'SERPENT', 'SPLITTER', 'PHASER'],
  SWAMP: ['SERPENT', 'GHOST', 'PATROL', 'HEALER', 'NECRO'],
  LOWLAND: ['SENTRY', 'PATROL', 'DEER', 'CHARGER'],
  MOUNTAIN: ['GUARD', 'ELITE', 'SENTRY', 'SPINNER', 'SHIELDER'],
  SNOW: ['WOLF', 'ELITE', 'TANK', 'SWARM_QUEEN', 'MIRROR'],
};

const PICKUP_TYPES: Pickup['type'][] = ['HEALTH_POTION', 'MANA_POTION', 'COIN_BAG', 'CHEST', 'SPEED_BOOST', 'DAMAGE_BOOST'];
const PICKUP_WEIGHTS = [30, 20, 25, 10, 8, 7];
const STARTUP_TOTALS = {
  horseHerds: 6,
  chariots: 8,
  dragons: 2,
  boats: 10,
  traders: 5,
  idleEnemies: 30,
  pickups: 80,
};
const STARTUP_INITIAL = {
  horseHerds: 1,
  chariots: 1,
  dragons: 0,
  boats: 0,
  traders: 1,
  idleEnemies: 10,
  pickups: 10,
};

const BOSS_KILL_MASKS: Record<string, number> = {
  BOSS_DRAKE: 1 << 0,
  DRAGON_BOSS: 1 << 1,
  SWARM_QUEEN: 1 << 2,
};
const ALL_BOSS_KILL_MASK = Object.values(BOSS_KILL_MASKS).reduce((acc, bit) => acc | bit, 0);

interface EnemyMeta {
  lastHitBy?: number;
  lastHitElement?: ElementType;
  lastHitWasMelee?: boolean;
  lastHitWasSpell?: boolean;
  lastHitAir?: boolean;
  hexStacks?: number;
  hexTimer?: number;
  fearTimer?: number;
}

interface PassiveState {
  iaidoTimer: number;
  beastialChargeTimer: number;
  invulnTimer: number;
  spectralTimer: number;
  blockStartFrame: number;
  blocking: boolean;
  shieldTimer: number;
  stillFrames: number;
  lastPos: Vec2;
  killStreak: number;
  killStreakTimer: number;
  bladeDanceStacks: number;
  bladeDanceTimer: number;
  wildGrowthStacks: number;
  wildGrowthTimer: number;
  darkPactTimer: number;
  darkPactCooldown: number;
  slimeSplitUsed: boolean;
  angelicUsed: boolean;
  phoenixUsed: boolean;
  forestFrames: number;
  mimeBarrierCooldown: number;
}

interface ProjectileBarrier {
  id: number;
  pos: Vec2;
  radius: number;
  life: number;
  ownerId: number;
}

export class GameEngine {
  private players: PlayerStats[] = [];
  private playerPositions: Vec2[] = [];
  private bullets: Bullet[] = [];
  private enemies: Enemy[] = [];
  private particles: Particle[] = [];
  private damageNumbers: DamageNumber[] = [];
  private coins: Coin[] = [];
  private mounts: Mount[] = [];
  private traders: WanderingTrader[] = [];
  private fireAreas: FireArea[] = [];
  private walls: WallPiece[] = [];
  private towers: Tower[] = [];
  private town: TownState = { id: 0, name: "Ancient Hub", prosperity: 10, tradeCount: 0, level: 1, pos: { x: WORLD_WIDTH/2, y: WORLD_HEIGHT/2 }, goldGeneration: 50, style: 'MEDIEVAL', faction: Faction.BLUE };
  private campfires: Campfire[] = [];
  private torches: Torch[] = [];
  private playerCityHealCooldowns: number[] = [];
  private pickups: Pickup[] = [];
  private slashEffects: SlashEffect[] = [];
  private fireTelegraphs: FireTelegraph[] = [];
  private factionCastles: FactionCastle[] = [];
  private allies: Ally[] = [];
  private input: InputManager;
  public world: WorldGenerator;
  private enemySpatialHash: SpatialHash<Enemy> = new SpatialHash(200);

  private nextId: number = 0;
  private frameCount: number = 0;
  private score: number = 0;
  private money: number = 0;
  public state: GameState = GameState.MENU;

  public camera: Vec2 = { x: 0, y: 0 };
  private wave: number = 1;
  private enemiesToSpawn: number = 0;
  private enemiesSpawned: number = 0;
  private enemiesKilledThisWave: number = 0;

  public buildMode: WallPieceType | null = null;
  public buildRotation: number = 0;

  private events: WorldEvent[] = [];
  private clusters: EnemyCluster[] = [];
  private eventCooldown: number = 0;
  private announcements: { text: string; life: number; color: string; priority: number }[] = [];

  // Magic Wheel System
  private magicWheels: MagicWheel[] = [];
  private wheelInputCooldowns: number[] = [];
  private magicProjectiles: MagicProjectile[] = [];
  private startupQueue: Array<() => void> = [];
  private startupQueueActive = false;
  private startupQueueFrames = 0;
  private passiveState: PassiveState[] = [];
  private enemyMeta: Map<number, EnemyMeta> = new Map();
  private mimeBarriers: ProjectileBarrier[] = [];
  private noDamageThisWave = true;
  private runCompletionTracked = false;
  private friendlyEntitiesInvulnerable = true;

  constructor(input: InputManager) {
    this.input = input;
    this.world = new WorldGenerator();
    this.reset();
  }

  // Shadow state for instant restart
  private shadowWorld: WorldGenerator | null = null;
  private shadowReady = false;
  private shadowPromise: Promise<void> | null = null;
  private lastPlayerCount = 1;

  public get isReady(): boolean { return this.shadowReady; }

  private createPassiveState(): PassiveState {
    return {
      iaidoTimer: 0,
      beastialChargeTimer: 0,
      invulnTimer: 0,
      spectralTimer: 0,
      blockStartFrame: -9999,
      blocking: false,
      shieldTimer: 0,
      stillFrames: 0,
      lastPos: { x: 0, y: 0 },
      killStreak: 0,
      killStreakTimer: 0,
      bladeDanceStacks: 0,
      bladeDanceTimer: 0,
      wildGrowthStacks: 0,
      wildGrowthTimer: 0,
      darkPactTimer: 0,
      darkPactCooldown: 0,
      slimeSplitUsed: false,
      angelicUsed: false,
      phoenixUsed: false,
      forestFrames: 0,
      mimeBarrierCooldown: 0,
    };
  }

  private getPassiveId(playerIdx: number): string | null {
    const p = this.players[playerIdx];
    if (!p) return null;
    const charDef = ALL_CHARACTERS.find(c => c.id === p.characterId);
    return charDef?.passive.id || null;
  }

  private hasPassive(playerIdx: number, passiveId: string): boolean {
    return this.getPassiveId(playerIdx) === passiveId;
  }

  public async reset(): Promise<void> {
    // Wait for shadow world if being prepared
    if (this.shadowPromise && !this.shadowReady) {
      await this.shadowPromise;
    }

    if (this.shadowReady && this.shadowWorld) {
      this.world = this.shadowWorld;
      this.shadowWorld = null;
      this.shadowReady = false;
      this.shadowPromise = null;
    } else {
      this.world = new WorldGenerator();
    }

    this.players = [];
    this.playerPositions = [];
    this.bullets = [];
    this.enemies = [];
    this.particles = [];
    this.damageNumbers = [];
    this.coins = [];
    this.mounts = [];
    this.traders = [];
    this.fireAreas = [];
    this.walls = [];
    this.towers = [];
    this.town = { id: 0, name: "Citadel Bazaar", prosperity: 10, tradeCount: 0, level: 1, pos: { x: WORLD_WIDTH/2, y: WORLD_HEIGHT/2 }, goldGeneration: 50, style: 'MEDIEVAL', faction: Faction.BLUE };
    this.campfires = [];
    this.torches = [];
    this.playerCityHealCooldowns = [];
    this.pickups = [];
    this.slashEffects = [];
    this.fireTelegraphs = [];
    this.factionCastles = [];
    this.allies = [];
    this.score = 0;
    this.money = 0;
    this.frameCount = 0;
    this.wave = 1;
    this.enemiesSpawned = 0;
    this.enemiesKilledThisWave = 0;
    this.state = GameState.MENU;
    this.buildMode = null;
    this.buildRotation = 0;
    this.events = [];
    this.clusters = [];
    this.eventCooldown = 0;
    this.announcements = [];
    this.magicWheels = [];
    this.wheelInputCooldowns = [];
    this.magicProjectiles = [];
    this.passiveState = [];
    this.enemyMeta.clear();
    this.mimeBarriers = [];
    this.noDamageThisWave = true;
    this.runCompletionTracked = false;
    this.startupQueue = [];
    this.startupQueueActive = false;
    this.startupQueueFrames = 0;
    this.camera = { x: WORLD_WIDTH / 2 - window.innerWidth / 2, y: WORLD_HEIGHT / 2 - window.innerHeight / 2 };
    this.input.clearPlayerInputMappings();

    // Start preparing next world immediately
    this.prepareNextWorld();
  }

  // Pre-build next world in background for instant restart
  private prepareNextWorld() {
    if (this.shadowReady || this.shadowPromise) return;
    this.shadowPromise = new Promise(resolve => {
      const doWork = () => {
        this.shadowWorld = new WorldGenerator();
        this.shadowWorld.prefillSpawnablePositions(40);
        this.shadowReady = true;
        resolve();
      };
      if ('requestIdleCallback' in window) {
        requestIdleCallback(doWork, { timeout: 100 });
      } else {
        setTimeout(doWork, 0);
      }
    });
  }

  // Pre-warm the engine while in menu for faster game start
  public async preWarm() {
    const start = performance.now();
    // Load assets and terrain in parallel for faster start
    await Promise.all([
      assetManager.loadCore(),
      terrainRenderer.load()
    ]);
    console.log(`Assets+terrain: ${(performance.now() - start).toFixed(0)}ms`);
    // Pre-compute spawnable positions to warm caches
    this.world.prefillSpawnablePositions(30);
    // Pre-build shadow world for instant first start
    this.prepareNextWorld();
    console.log(`Engine pre-warmed: ${(performance.now() - start).toFixed(0)}ms total`);
  }

  public start(playerCount: number = 1) {
    this.startWithCharacters(
      Array.from({ length: playerCount }, (_, i) => ({
        slotIndex: i,
        characterId: 'samurai',
        controllerId: i,
        inputType: 'GAMEPAD' as InputType
      }))
    );
  }

  public startWithCharacters(selections: { slotIndex: number; characterId: string; controllerId: number; inputType: InputType }[]) {
    const startTime = enginePerf.start('startWithCharacters');
    const spawn = this.world.getSpawnablePosition();
    const count = Math.max(1, Math.min(4, selections.length));
    this.lastPlayerCount = count;
    this.input.clearPlayerInputMappings();

    for (let i = 0; i < count; i++) {
      const sel = selections[i];
      const charDef = ALL_CHARACTERS.find(c => c.id === sel.characterId) || ALL_CHARACTERS[0];
      const p: PlayerStats = {
        ...JSON.parse(JSON.stringify(INITIAL_PLAYER_STATS)),
        id: i,
        characterId: charDef.id,
        hp: charDef.stats.hp,
        maxHp: charDef.stats.hp,
        speed: charDef.stats.speed,
        damage: charDef.stats.damage,
        magic: charDef.stats.magic,
        maxMagic: charDef.stats.magic,
        color: PLAYER_COLORS[i],
        statsDetail: {
          baseDamage: charDef.stats.damage,
          baseHp: charDef.stats.hp,
          baseSpeed: charDef.stats.speed,
          baseMagic: charDef.stats.magic
        }
      };
      this.players.push(p);
      this.playerPositions.push({ x: spawn.x + i * 40, y: spawn.y });
      this.playerCityHealCooldowns.push(0);
      this.magicWheels.push(new MagicWheel());
      this.wheelInputCooldowns.push(0);
      this.input.setPlayerInputMapping(i, sel.inputType, sel.controllerId);
      const passive = this.createPassiveState();
      passive.lastPos = { x: spawn.x + i * 40, y: spawn.y };
      this.passiveState[i] = passive;
    }

    this.campfires = this.world.getCampfires();
    this.torches = this.world.getTorches();
    const towns = this.world.getTowns();
    if (towns.length > 0) {
      this.town.style = towns[0].style;
      this.town.name = towns[0].name;
    }

    this.camera.x = spawn.x - window.innerWidth / 2;
    this.camera.y = spawn.y - window.innerHeight / 2;
    // Spawn a minimal set immediately to keep start snappy
    for (let i = 0; i < STARTUP_INITIAL.horseHerds; i++) this.spawnHorseHerd();
    for (let i = 0; i < STARTUP_INITIAL.chariots; i++) this.spawnChariot();
    for (let i = 0; i < STARTUP_INITIAL.dragons; i++) this.spawnDragon();
    for (let i = 0; i < STARTUP_INITIAL.boats; i++) this.spawnBoat();
    this.spawnTraders(STARTUP_INITIAL.traders);
    this.spawnIdleEnemies(STARTUP_INITIAL.idleEnemies);
    this.spawnWorldPickups(STARTUP_INITIAL.pickups);

    // Queue the rest of startup spawns to avoid blocking the main thread
    this.queueStartupSpawns();
    this.startWave(1);
    this.state = GameState.PLAYING;
    enginePerf.end('startWithCharacters', startTime, { force: true });
  }

  public addPlayerMidGame(characterId: string, controllerId: number, inputType: InputType): number {
    if (this.players.length >= 4) return -1;
    const charDef = ALL_CHARACTERS.find(c => c.id === characterId) || ALL_CHARACTERS[0];
    const i = this.players.length;
    const existingPos = this.playerPositions[0] || { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
    const p: PlayerStats = {
      ...JSON.parse(JSON.stringify(INITIAL_PLAYER_STATS)),
      id: i,
      characterId: charDef.id,
      hp: charDef.stats.hp,
      maxHp: charDef.stats.hp,
      speed: charDef.stats.speed,
      damage: charDef.stats.damage,
      magic: charDef.stats.magic,
      maxMagic: charDef.stats.magic,
      color: PLAYER_COLORS[i],
      statsDetail: {
        baseDamage: charDef.stats.damage,
        baseHp: charDef.stats.hp,
        baseSpeed: charDef.stats.speed,
        baseMagic: charDef.stats.magic
      }
    };
    this.players.push(p);
    this.playerPositions.push({ x: existingPos.x + 50, y: existingPos.y });
    this.playerCityHealCooldowns.push(0);
    this.magicWheels.push(new MagicWheel());
    this.wheelInputCooldowns.push(0);
    this.input.setPlayerInputMapping(i, inputType, controllerId);
    const passive = this.createPassiveState();
    passive.lastPos = { x: existingPos.x + 50, y: existingPos.y };
    this.passiveState[i] = passive;
    return i;
  }

  public removePlayer(playerIndex: number): void {
    if (playerIndex < 0 || playerIndex >= this.players.length) return;
    this.players.splice(playerIndex, 1);
    this.playerPositions.splice(playerIndex, 1);
    this.playerCityHealCooldowns.splice(playerIndex, 1);
    this.magicWheels.splice(playerIndex, 1);
    this.wheelInputCooldowns.splice(playerIndex, 1);
    this.input.removePlayerInputMapping(playerIndex);
    this.players.forEach((p, i) => p.id = i);
  }

  public getPlayerCount(): number {
    return this.players.length;
  }

  private spawnHorseHerd() {
    const centerPos = this.world.getSpawnablePosition();
    const herdSize = 2 + Math.floor(Math.random() * 3);
    const cfg = MOUNT_CONFIGS.HORSE;
    for (let j = 0; j < herdSize; j++) {
      const offset = { x: (Math.random() - 0.5) * 120, y: (Math.random() - 0.5) * 120 };
      this.mounts.push({
        id: this.nextId++,
        pos: { x: centerPos.x + offset.x, y: centerPos.y + offset.y },
        type: 'HORSE',
        hp: cfg.hp,
        maxHp: cfg.hp,
        angle: Math.random() * Math.PI * 2,
        alerted: false,
        riders: [],
        panicTimer: 0
      });
    }
  }

  private spawnChariot() {
    const pos = this.world.getSpawnablePosition();
    const cfg = MOUNT_CONFIGS.CHARIOT;
    this.mounts.push({
      id: this.nextId++,
      pos,
      type: 'CHARIOT',
      hp: cfg.hp,
      maxHp: cfg.hp,
      angle: Math.random() * Math.PI * 2,
      alerted: false,
      riders: []
    });
  }

  private spawnDragon() {
    const pos = this.world.getSpawnablePosition();
    const cfg = MOUNT_CONFIGS.DRAGON;
    this.mounts.push({
      id: this.nextId++,
      pos,
      type: 'DRAGON',
      hp: cfg.hp,
      maxHp: cfg.hp,
      angle: Math.random() * Math.PI * 2,
      alerted: false,
      riders: []
    });
  }

  private spawnBoat() {
    const pos = this.world.getRandomShorePosition(10);
    if (!pos) return;
    const cfg = MOUNT_CONFIGS.BOAT;
    this.mounts.push({
      id: this.nextId++,
      pos,
      type: 'BOAT',
      hp: cfg.hp,
      maxHp: cfg.hp,
      angle: Math.random() * Math.PI * 2,
      alerted: false,
      riders: []
    });
  }

  private spawnAmbientMounts() {
    for (let i = 0; i < STARTUP_TOTALS.horseHerds; i++) this.spawnHorseHerd();
    for (let i = 0; i < STARTUP_TOTALS.chariots; i++) this.spawnChariot();
    for (let i = 0; i < STARTUP_TOTALS.dragons; i++) this.spawnDragon();
    for (let i = 0; i < STARTUP_TOTALS.boats; i++) this.spawnBoat();
  }

  private spawnTrader() {
    const pos = this.world.getSpawnablePosition();
    this.traders.push({
      id: this.nextId++,
      pos,
      angle: Math.random() * Math.PI * 2,
      speed: 1.5,
      targetPos: this.world.getSpawnablePosition()
    });
  }

  private spawnTraders(count: number = STARTUP_TOTALS.traders) {
    for (let i = 0; i < count; i++) {
      this.spawnTrader();
    }
  }

  private spawnIdleEnemies(count: number = STARTUP_TOTALS.idleEnemies) {
    // Spawn ambient enemies - reduced from 80 to 30 for performance
    for (let i = 0; i < count; i++) {
      const pos = this.world.getSpawnablePosition();
      const biome = this.world.getBiomeAt(pos.x, pos.y);
      const possibleTypes = BIOME_ENEMIES[biome] || ['SENTRY', 'PATROL'];
      const t = possibleTypes[Math.floor(Math.random() * possibleTypes.length)];
      const config = ENEMY_TYPES[t];

      // Random stat variation for uniqueness
      const hpMult = 0.8 + Math.random() * 0.4;
      const speedMult = 0.9 + Math.random() * 0.2;

      this.enemies.push({
        id: this.nextId++,
        pos: { ...pos },
        hp: Math.floor(config.hp * hpMult),
        maxHp: Math.floor(config.hp * hpMult),
        speed: config.speed * speedMult,
        radius: config.radius,
        damage: config.damage,
        type: t,
        movement: config.movement as any,
        cooldown: 0,
        knockbackVel: { x: 0, y: 0 },
        slowTimer: 0,
        burnTimer: 0,
        poisonTimer: 0,
        isAggressive: false,
        angle: Math.random() * Math.PI * 2,
        visionCone: config.visionCone * (0.9 + Math.random() * 0.2),
        visionRange: config.visionRange * (0.9 + Math.random() * 0.2),
        patrolTarget: config.movement === 'PATROL' ? this.world.getSpawnablePosition() : undefined
      });
    }
  }

  private spawnEnemyCastle() {
    const cfg = FACTION_CASTLE_CONFIG;
    const towns = this.world.getTowns();
    let pos: Vec2;
    let attempts = 0;
    do {
      pos = {
        x: 1500 + Math.random() * (WORLD_WIDTH - 3000),
        y: 1500 + Math.random() * (WORLD_HEIGHT - 3000)
      };
      attempts++;
    } while (attempts < 20 && (
      this.world.getBiomeAt(pos.x, pos.y) === 'SEA' ||
      this.world.getBiomeAt(pos.x, pos.y) === 'MOUNTAIN' ||
      this.distSq(pos, this.town.pos) < 3000 * 3000 ||
      towns.some(t => this.distSq(pos, t.pos) < 1500 * 1500) ||
      this.factionCastles.some(c => this.distSq(pos, c.pos) < 2500 * 2500)
    ));

    this.factionCastles.push({
      id: this.nextId++,
      pos,
      faction: Faction.RED,
      hp: cfg.hp,
      maxHp: cfg.hp,
      level: 1 + Math.floor(Math.random() * 3),
      spawnCooldown: 300 + Math.random() * 300,
      siegeActive: false,
      siegeWave: 0,
      siegeEnemiesRemaining: 0
    });
  }

  private spawnAllyCastle() {
    const cfg = FACTION_CASTLE_CONFIG;
    const towns = this.world.getTowns();
    let pos: Vec2;
    let attempts = 0;
    const nearTown = towns[Math.floor(Math.random() * towns.length)] || this.town;
    do {
      const ang = Math.random() * Math.PI * 2;
      const dist = 800 + Math.random() * 1200;
      pos = {
        x: nearTown.pos.x + Math.cos(ang) * dist,
        y: nearTown.pos.y + Math.sin(ang) * dist
      };
      attempts++;
    } while (attempts < 20 && (
      this.world.getBiomeAt(pos.x, pos.y) === 'SEA' ||
      this.world.getBiomeAt(pos.x, pos.y) === 'MOUNTAIN' ||
      this.factionCastles.some(c => this.distSq(pos, c.pos) < 1500 * 1500)
    ));

    this.factionCastles.push({
      id: this.nextId++,
      pos,
      faction: Faction.BLUE,
      hp: cfg.hp,
      maxHp: cfg.hp,
      level: 1,
      spawnCooldown: 600 + Math.random() * 300,
      siegeActive: false,
      siegeWave: 0,
      siegeEnemiesRemaining: 0
    });
  }

  private spawnFactionCastles(numCastles: number = 4 + Math.floor(Math.random() * 3),
                              numAllyCastles: number = 2 + Math.floor(Math.random() * 2)) {
    for (let i = 0; i < numCastles; i++) this.spawnEnemyCastle();
    for (let i = 0; i < numAllyCastles; i++) this.spawnAllyCastle();
  }

  private queueStartupTask(task: () => void) {
    this.startupQueue.push(task);
    this.startupQueueActive = true;
  }

  private queueBatchedSpawns(total: number, batchSize: number, spawnFn: (count: number) => void) {
    let remaining = total;
    while (remaining > 0) {
      const batch = Math.min(batchSize, remaining);
      this.queueStartupTask(() => spawnFn(batch));
      remaining -= batch;
    }
  }

  private queueStartupSpawns() {
    this.startupQueue = [];
    this.startupQueueActive = true;
    this.startupQueueFrames = 0;

    const remaining = {
      horseHerds: Math.max(0, STARTUP_TOTALS.horseHerds - STARTUP_INITIAL.horseHerds),
      chariots: Math.max(0, STARTUP_TOTALS.chariots - STARTUP_INITIAL.chariots),
      dragons: Math.max(0, STARTUP_TOTALS.dragons - STARTUP_INITIAL.dragons),
      boats: Math.max(0, STARTUP_TOTALS.boats - STARTUP_INITIAL.boats),
      traders: Math.max(0, STARTUP_TOTALS.traders - STARTUP_INITIAL.traders),
      idleEnemies: Math.max(0, STARTUP_TOTALS.idleEnemies - STARTUP_INITIAL.idleEnemies),
      pickups: Math.max(0, STARTUP_TOTALS.pickups - STARTUP_INITIAL.pickups),
    };

    for (let i = 0; i < remaining.horseHerds; i++) this.queueStartupTask(() => this.spawnHorseHerd());
    for (let i = 0; i < remaining.chariots; i++) this.queueStartupTask(() => this.spawnChariot());
    for (let i = 0; i < remaining.dragons; i++) this.queueStartupTask(() => this.spawnDragon());
    for (let i = 0; i < remaining.boats; i++) this.queueStartupTask(() => this.spawnBoat());

    this.queueBatchedSpawns(remaining.traders, 1, (count) => this.spawnTraders(count));
    this.queueBatchedSpawns(remaining.idleEnemies, 5, (count) => this.spawnIdleEnemies(count));
    this.queueBatchedSpawns(remaining.pickups, 10, (count) => this.spawnWorldPickups(count));

    const numCastles = 4 + Math.floor(Math.random() * 3);
    const numAllyCastles = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < numCastles; i++) this.queueStartupTask(() => this.spawnEnemyCastle());
    for (let i = 0; i < numAllyCastles; i++) this.queueStartupTask(() => this.spawnAllyCastle());
  }

  private processStartupQueue() {
    if (!this.startupQueueActive || this.startupQueue.length === 0) return;
    const start = performance.now();
    const budget = this.startupQueueFrames < 20 ? 6 : 3;
    while (this.startupQueue.length > 0 && (performance.now() - start) < budget) {
      const task = this.startupQueue.shift();
      if (task) task();
    }
    this.startupQueueFrames++;
    if (this.startupQueue.length === 0) this.startupQueueActive = false;
  }

  private startWave(waveNum: number) {
    if (waveNum > 1 && this.noDamageThisWave) {
      this.handleChallengeProgress('no_hit_wave', 1);
      this.announce('PERFECT WAVE!', '#ffd700', 3);
    }
    this.wave = waveNum;
    this.enemiesToSpawn = 12 + waveNum * 8;
    this.enemiesSpawned = 0;
    this.enemiesKilledThisWave = 0;
    this.money += this.town.goldGeneration;
    if (waveNum % 5 === 0) this.spawnBoss();
    this.noDamageThisWave = true;
    if (waveNum >= 20) this.handleChallengeProgress('survive_20', 1);
    if (waveNum >= 30) this.handleChallengeProgress('reach_wave_30', 1);
  }

  private getEnemyMeta(enemy: Enemy): EnemyMeta {
    let meta = this.enemyMeta.get(enemy.id);
    if (!meta) {
      meta = { hexStacks: 0, hexTimer: 0, fearTimer: 0 };
      this.enemyMeta.set(enemy.id, meta);
    }
    return meta;
  }

  private handleChallengeProgress(challengeId: string, amount: number = 1) {
    const unlocked = progressManager.addChallengeProgress(challengeId, amount);
    if (unlocked) this.announceCharacterUnlock(unlocked);
  }

  private announceCharacterUnlock(characterId: string) {
    const char = ALL_CHARACTERS.find(c => c.id === characterId);
    if (!char) return;
    const pos = this.playerPositions[0] || { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
    this.createExplosion(pos, '#ffd700', 40, 8, 12);
    this.announce(`UNLOCKED: ${char.name}`, '#ffd700', 4);
  }

  private handleRunComplete() {
    if (this.runCompletionTracked) return;
    this.runCompletionTracked = true;
    const playChallengeByCharacter: Record<string, string> = {
      paladin: 'play_paladin',
      necromancer: 'play_necro',
      bard: 'play_bard',
      ninja: 'play_ninja',
      druid: 'play_druid',
      witch: 'play_witch',
      samurai: 'play_samurai',
    };
    this.players.forEach(p => {
      const challengeId = playChallengeByCharacter[p.characterId];
      if (challengeId) this.handleChallengeProgress(challengeId, 1);
    });
  }

  private isNearPassive(playerIdx: number, passiveId: string, radius: number): boolean {
    const pos = this.playerPositions[playerIdx];
    if (!pos) return false;
    const rSq = radius * radius;
    return this.players.some((p, i) => {
      if (i === playerIdx || p.isDead) return false;
      if (this.getPassiveId(i) !== passiveId) return false;
      return this.distSq(pos, this.playerPositions[i]) < rSq;
    });
  }

  private getSpeedMultiplier(playerIdx: number): number {
    const p = this.players[playerIdx];
    const state = this.passiveState[playerIdx];
    if (!p || !state) return 1;
    let mult = 1;
    const hpRatio = p.hp / Math.max(1, p.maxHp);
    if (this.hasPassive(playerIdx, 'lycanthropy') && hpRatio < 0.3) mult *= 1.3;
    if (this.hasPassive(playerIdx, 'wild_growth')) mult *= 1 + state.wildGrowthStacks * 0.05;
    if (this.isNearPassive(playerIdx, 'battle_hymn', 260)) mult *= 1.15;
    return mult;
  }

  private getDamageMultiplier(playerIdx: number, context: { airborne?: boolean; isCharge?: boolean } = {}): number {
    const p = this.players[playerIdx];
    const state = this.passiveState[playerIdx];
    if (!p || !state) return 1;
    let mult = 1;
    const hpRatio = p.hp / Math.max(1, p.maxHp);
    if (this.hasPassive(playerIdx, 'demonic')) mult *= 1 + Math.min(10, state.killStreak) * 0.05;
    if (state.darkPactTimer > 0) mult *= 1.25;
    if (this.hasPassive(playerIdx, 'lycanthropy') && hpRatio < 0.3) mult *= 1.25;
    if (this.isNearPassive(playerIdx, 'war_cry', 260)) mult *= 1.2;
    if (this.hasPassive(playerIdx, 'chicken_rage')) mult *= 1.2;
    if (this.hasPassive(playerIdx, 'feral') && context.airborne) mult *= 1.3;
    if (this.hasPassive(playerIdx, 'beastial') && context.isCharge) mult *= 3;
    return mult;
  }

  private getCooldownMultiplier(playerIdx: number, spellType?: string): number {
    let mult = 1;
    if (this.hasPassive(playerIdx, 'time_warp')) mult *= 0.8;
    if (spellType === 'DASH' && this.hasPassive(playerIdx, 'wind_dash')) mult *= 0.5;
    return mult;
  }

  private getAttackInterval(playerIdx: number): number {
    const state = this.passiveState[playerIdx];
    if (!state) return 20;
    let interval = 20;
    if (this.hasPassive(playerIdx, 'blade_dance')) interval *= 1 - state.bladeDanceStacks * 0.05;
    if (this.hasPassive(playerIdx, 'time_warp')) interval *= 0.8;
    return Math.max(6, Math.round(interval));
  }

  private getMeleeCooldown(playerIdx: number): number {
    let cd = 45;
    if (this.hasPassive(playerIdx, 'time_warp')) cd *= 0.8;
    return Math.max(20, Math.round(cd));
  }

  private applyHealingToPlayer(playerIdx: number, amount: number, source: 'potion' | 'spell' | 'vampiric' | 'drain' | 'dragon_blood' | 'other' = 'other'): number {
    const p = this.players[playerIdx];
    if (!p || amount <= 0) return 0;
    let heal = amount;
    if (this.hasPassive(playerIdx, 'undead')) heal *= 0.5;
    if (source === 'potion' && this.hasPassive(playerIdx, 'chef_special')) heal *= 1.5;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + heal);
    const actual = p.hp - before;
    if (actual > 0) {
      if (source === 'vampiric' || source === 'drain') {
        this.handleChallengeProgress('drain_300', actual);
      } else {
        this.handleChallengeProgress('heal_500', actual);
      }
    }
    return actual;
  }

  private tryReviveFromPassive(playerIdx: number): boolean {
    const p = this.players[playerIdx];
    const state = this.passiveState[playerIdx];
    if (!p || !state) return false;

    if (this.hasPassive(playerIdx, 'angelic') && !state.angelicUsed) {
      state.angelicUsed = true;
      p.hp = Math.max(1, Math.floor(p.maxHp * 0.5));
      state.invulnTimer = 120;
      this.createExplosion(this.playerPositions[playerIdx], '#ffeeaa', 30, 6, 10);
      this.announce('ANGELIC REVIVE!', '#ffeeaa', 3);
      return true;
    }

    if (this.hasPassive(playerIdx, 'phoenix_rebirth') && !state.phoenixUsed) {
      state.phoenixUsed = true;
      p.hp = p.maxHp;
      state.invulnTimer = 120;
      this.createExplosion(this.playerPositions[playerIdx], '#ff6600', 60, 10, 16);
      this.announce('PHOENIX REBIRTH!', '#ff6600', 3);
      return true;
    }

    if (this.hasPassive(playerIdx, 'slime_split') && !state.slimeSplitUsed) {
      state.slimeSplitUsed = true;
      p.maxHp = Math.max(40, Math.floor(p.maxHp * 0.7));
      p.hp = Math.max(1, Math.floor(p.maxHp * 0.6));
      p.damage *= 0.7;
      state.invulnTimer = 90;
      this.createExplosion(this.playerPositions[playerIdx], '#44ff88', 35, 6, 10);
      this.announce('SLIME SPLIT!', '#44ff88', 3);
      return true;
    }

    return false;
  }

  private applyDamageToPlayer(playerIdx: number, amount: number, source: { element?: ElementType; attacker?: Enemy | null } = {}): number {
    const p = this.players[playerIdx];
    const state = this.passiveState[playerIdx];
    if (!p || !state || p.isDead) return 0;
    if (state.invulnTimer > 0 || state.spectralTimer > 0) return 0;

    const element = source.element;
    if (this.hasPassive(playerIdx, 'dragon_blood') && element === ElementType.FIRE) {
      this.applyHealingToPlayer(playerIdx, amount, 'dragon_blood');
      return 0;
    }
    if (this.hasPassive(playerIdx, 'undead') && element === ElementType.POISON) {
      return 0;
    }

    const perfectBlockWindow = this.frameCount - state.blockStartFrame <= 10;
    if (p.isBlocking && perfectBlockWindow) {
      if (this.hasPassive(playerIdx, 'shadow_step')) {
        state.invulnTimer = Math.max(state.invulnTimer, 60);
      }
      this.handleChallengeProgress('perfect_blocks', 1);
      this.handleChallengeProgress('block_200', 1);
      this.createExplosion(this.playerPositions[playerIdx], '#66ccff', 18, 3, 6);
      return 0;
    }

    let damage = amount;
    let damageMult = 1;
    if (p.isBlocking) damageMult *= 0.6;
    if (p.isBlocking && this.hasPassive(playerIdx, 'stone_skin')) damageMult *= 0.75;
    if (this.hasPassive(playerIdx, 'earth_shield') && state.stillFrames > 60) damageMult *= 0.7;

    damage = Math.max(0, damage * damageMult);
    const blocked = Math.max(0, amount - damage);

    if (blocked > 0) {
      this.handleChallengeProgress('block_200', 1);
      if (this.hasPassive(playerIdx, 'shadow_cloak')) {
        p.magic = Math.min(p.maxMagic, p.magic + blocked * 0.4);
      }
    }

    p.hp -= damage;
    if (damage > 0) {
      this.noDamageThisWave = false;
      this.handleChallengeProgress('tank_1000', damage);
    }

    if (damage > 0 && source.attacker && !this.hasPassive(playerIdx, 'ancient')) {
      const pos = this.playerPositions[playerIdx];
      const dx = pos.x - source.attacker.pos.x;
      const dy = pos.y - source.attacker.pos.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = Math.min(8, 2 + damage * 0.08);
      p.knockbackVel.x += (dx / d) * force;
      p.knockbackVel.y += (dy / d) * force;
    }

    if (this.hasPassive(playerIdx, 'frost_armor') && source.attacker) {
      source.attacker.slowTimer = Math.max(source.attacker.slowTimer, 180);
    }

    if (p.hp <= 0 && this.tryReviveFromPassive(playerIdx)) {
      return 0;
    }

    return damage;
  }

  private spreadDebuffs(playerIdx: number, enemy: Enemy, element?: ElementType) {
    if (!this.hasPassive(playerIdx, 'plague')) return;
    const radiusSq = 120 * 120;
    this.enemies.forEach(other => {
      if (other.id === enemy.id) return;
      if (this.distSq(enemy.pos, other.pos) > radiusSq) return;
      if (element === ElementType.FIRE) other.burnTimer = Math.max(other.burnTimer, 120);
      if (element === ElementType.ICE) other.slowTimer = Math.max(other.slowTimer, 160);
      if (element === ElementType.POISON) other.poisonTimer = Math.max(other.poisonTimer, 140);
    });
  }

  private recordHit(playerIdx: number) {
    const state = this.passiveState[playerIdx];
    if (!state) return;
    if (this.hasPassive(playerIdx, 'blade_dance')) {
      state.bladeDanceTimer = 180;
      state.bladeDanceStacks = Math.min(5, state.bladeDanceStacks + 1);
    }
  }

  private recordKill(playerIdx: number) {
    const state = this.passiveState[playerIdx];
    if (!state) return;
    state.killStreak = Math.min(20, state.killStreak + 1);
    state.killStreakTimer = 300;
    if (state.killStreak >= 20) this.handleChallengeProgress('streak_20', 1);
  }

  private spawnGhostAlly(ownerId: number, pos: Vec2, damage: number, life: number = 600) {
    this.allies.push({
      id: this.nextId++,
      pos: { ...pos },
      hp: 40 + damage,
      maxHp: 40 + damage,
      speed: 2.8,
      damage,
      type: 'MAGE',
      cooldown: 0,
      targetId: null,
      followPlayerId: ownerId,
      behavior: 'ATTACK',
      angle: Math.random() * Math.PI * 2,
      color: '#bb66ff',
      life,
      source: 'GHOST',
      ownerId,
    });
    this.createExplosion(pos, '#bb66ff', 12, 3, 5);
  }

  private spawnSkeletonWarriors(ownerId: number, pos: Vec2, count: number, life: number = 600) {
    const cfg = ALLY_CONFIGS.SKELETON;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 40;
      const spawnPos = { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist };
      this.allies.push({
        id: this.nextId++,
        pos: spawnPos,
        hp: cfg.hp,
        maxHp: cfg.hp,
        speed: cfg.speed,
        damage: cfg.damage,
        type: 'SKELETON',
        cooldown: 0,
        targetId: null,
        followPlayerId: ownerId,
        behavior: 'FOLLOW',
        angle: ang,
        color: cfg.color,
        life,
        source: 'SUMMON',
        ownerId,
      });
      this.createExplosion(spawnPos, '#cfcfcf', 8, 2, 3);
    }
  }

  private healSummonedAllies(ownerId: number, amount: number, radius: number = 260) {
    if (amount <= 0) return;
    const center = this.playerPositions[ownerId];
    if (!center) return;
    const radiusSq = radius * radius;
    for (const ally of this.allies) {
      if (ally.ownerId !== ownerId || ally.source !== 'SUMMON') continue;
      if (this.distSq(center, ally.pos) > radiusSq) continue;
      ally.hp = Math.min(ally.maxHp, ally.hp + amount);
    }
  }

  private dealDamageToEnemy(
    enemy: Enemy,
    baseDamage: number,
    source: { playerId: number; element?: ElementType; isMelee?: boolean; isSpell?: boolean; isAirborne?: boolean; isCharge?: boolean }
  ) {
    const { playerId, element, isMelee, isSpell, isAirborne, isCharge } = source;
    const p = this.players[playerId];
    if (!p) return;
    const state = this.passiveState[playerId];
    const meta = this.getEnemyMeta(enemy);

    let damage = baseDamage;

    if (this.hasPassive(playerId, 'iaido') && state && state.iaidoTimer > 0) {
      damage *= 2;
      state.iaidoTimer = 0;
    }
    if (this.hasPassive(playerId, 'beastial') && state && state.beastialChargeTimer > 0 && isMelee) {
      damage *= 3;
      state.beastialChargeTimer = 0;
    }

    damage *= this.getDamageMultiplier(playerId, { airborne: isAirborne, isCharge });

    // Hex stacks for spell hits
    if (this.hasPassive(playerId, 'hex') && isSpell) {
      meta.hexStacks = (meta.hexStacks || 0) + 1;
      meta.hexTimer = 240;
      if ((meta.hexStacks || 0) >= 3) {
        enemy.hp -= 60;
        this.createExplosion(enemy.pos, '#cc33ff', 18, 3, 5);
        meta.hexStacks = 0;
      }
    }

    enemy.hp -= damage;
    enemy.isAggressive = true;
    meta.lastHitBy = playerId;
    meta.lastHitElement = element;
    meta.lastHitWasMelee = isMelee;
    meta.lastHitWasSpell = isSpell;
    meta.lastHitAir = isAirborne;

    if (element === ElementType.FIRE) enemy.burnTimer = Math.max(enemy.burnTimer, 180);
    if (element === ElementType.ICE) enemy.slowTimer = Math.max(enemy.slowTimer, 200);
    if (element === ElementType.POISON) enemy.poisonTimer = Math.max(enemy.poisonTimer, 160);

    if (this.hasPassive(playerId, 'fire_aura') && isMelee) {
      enemy.burnTimer = Math.max(enemy.burnTimer, 200);
      this.createExplosion(enemy.pos, '#ff4400', 8, 2, 3);
    }

    this.spreadDebuffs(playerId, enemy, element);

    if (this.hasPassive(playerId, 'vampiric')) {
      this.applyHealingToPlayer(playerId, damage * 0.2, 'vampiric');
    }

    this.recordHit(playerId);
    this.addDamageNumber(enemy.pos, damage, damage > 100);
  }

  private handleEnemyKilled(enemy: Enemy, meta?: EnemyMeta) {
    this.score += 600;
    this.enemiesKilledThisWave++;
    this.spawnCoin(enemy.pos, meta?.lastHitBy);

    const baseXp = 50 + Math.floor(enemy.maxHp / 5);
    this.players.forEach((p, i) => {
      p.xp += baseXp;
      this.processLevelUp(p, i);
    });

    if (meta?.lastHitBy !== undefined) {
      const killerId = meta.lastHitBy;
      this.recordKill(killerId);

      // Kill-based challenges
      if (enemy.hp / Math.max(1, enemy.maxHp) < 0.3) this.handleChallengeProgress('low_hp_kills', 1);
      if (meta.lastHitWasMelee) this.handleChallengeProgress('melee_500', 1);
      if (meta.lastHitAir) this.handleChallengeProgress('jump_kills', 1);
      if (meta.lastHitElement === ElementType.FIRE || enemy.burnTimer > 0) this.handleChallengeProgress('burn_100', 1);
      if (meta.lastHitElement === ElementType.ICE || enemy.slowTimer > 0) this.handleChallengeProgress('freeze_50', 1);
      if (meta.lastHitElement === ElementType.LIGHTNING) this.handleChallengeProgress('shock_75', 1);

      if (enemy.type === 'NECRO') this.handleChallengeProgress('kill_necro', 1);
      if (enemy.type === 'GHOST') this.handleChallengeProgress('kill_ghosts', 1);
      if (enemy.type === 'TANK') this.handleChallengeProgress('kill_tanks', 1);

      if (this.hasPassive(killerId, 'soul_harvest')) {
        this.spawnGhostAlly(killerId, enemy.pos, Math.max(12, Math.floor(this.players[killerId].damage * 0.6)));
        this.handleChallengeProgress('summon_30', 1);
      }

      if (this.hasPassive(killerId, 'arcane_surge') && meta.lastHitWasMelee) {
        this.players[killerId].magic = Math.min(this.players[killerId].maxMagic, this.players[killerId].magic + 20);
      }

      if (this.hasPassive(killerId, 'shadow_dance')) {
        const state = this.passiveState[killerId];
        if (state) {
          state.spectralTimer = Math.max(state.spectralTimer, 90);
          this.createExplosion(this.playerPositions[killerId], '#444444', 10, 2, 4);
        }
      }

      if (this.hasPassive(killerId, 'world_eater') && (enemy.type in BOSS_KILL_MASKS)) {
        const p = this.players[killerId];
        p.maxHp += 20; p.hp += 20;
        p.damage += 3;
        p.speed += 0.1;
        p.maxMagic += 10;
        this.createExplosion(this.playerPositions[killerId], '#aa66ff', 20, 4, 6);
      }
    }

    if (enemy.type === 'BOMBER') {
      this.createExplosion(enemy.pos, '#ff6600', 40, 6, 10);
      this.playerPositions.forEach((pp, i) => {
        if (this.distSq(enemy.pos, pp) < 120 * 120) {
          this.applyDamageToPlayer(i, 80, { element: ElementType.FIRE });
        }
      });
      const nearby = this.enemySpatialHash.getNearby(enemy.pos.x, enemy.pos.y, 120);
      for (const other of nearby) {
        if (other.id !== enemy.id) other.hp -= 40;
      }
    }

    if (enemy.type === 'SPLITTER') {
      for (let i = 0; i < 2; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spawnPos = { x: enemy.pos.x + Math.cos(ang) * 30, y: enemy.pos.y + Math.sin(ang) * 30 };
        this.enemies.push({
          id: this.nextId++, pos: spawnPos,
          hp: 50, maxHp: 50, speed: 3.2, radius: 12, damage: 8,
          type: 'SWARM', movement: 'CHASE', cooldown: 0,
          knockbackVel: { x: 0, y: 0 }, slowTimer: 0, burnTimer: 0, poisonTimer: 0,
          isAggressive: true, angle: ang, visionCone: 0, visionRange: 0
        });
      }
      this.createExplosion(enemy.pos, '#44cc88', 20, 4, 6);
    }

    if (enemy.type === 'DRAGON_BOSS') {
      const cfg = MOUNT_CONFIGS.DRAGON;
      this.mounts.push({
        id: this.nextId++,
        pos: { ...enemy.pos },
        type: 'DRAGON',
        hp: cfg.hp,
        maxHp: cfg.hp,
        angle: enemy.angle,
        alerted: false,
        riders: []
      });
      this.createExplosion(enemy.pos, '#ff2200', 60, 8, 12);
      this.announce('DRAGON TAMED! Mount available!', '#00ff44', 3);
    }

    if (enemy.type === 'DRAGON_BOSS') this.handleChallengeProgress('kill_dragon', 1);
    if (enemy.type === 'BOSS_DRAKE') this.handleChallengeProgress('beat_boss_drake', 1);

    const bossMask = BOSS_KILL_MASKS[enemy.type];
    if (bossMask) {
      const current = progressManager.getChallengeProgress('kill_all_bosses');
      const nextMask = current | bossMask;
      if (nextMask !== current) {
        progressManager.setChallengeProgress('kill_all_bosses', nextMask);
        if (nextMask === ALL_BOSS_KILL_MASK) {
          const unlocked = progressManager.completeChallenge('kill_all_bosses');
          if (unlocked) this.announceCharacterUnlock(unlocked);
        }
      }
    }
  }

  private magicElementToElementType(element: MagicElement): ElementType {
    switch (element) {
      case MagicElement.FIRE:
        return ElementType.FIRE;
      case MagicElement.ICE:
        return ElementType.ICE;
      case MagicElement.LIGHTNING:
        return ElementType.LIGHTNING;
      case MagicElement.BLOOD:
      case MagicElement.BLACK:
        return ElementType.POISON;
      case MagicElement.EARTH:
        return ElementType.PHYSICAL;
      case MagicElement.LUMIN:
      case MagicElement.CURE:
      default:
        return ElementType.MAGIC;
    }
  }

  private spendSpellResource(playerIdx: number, cost: number): boolean {
    const p = this.players[playerIdx];
    const state = this.passiveState[playerIdx];
    if (!p) return false;
    if (this.hasPassive(playerIdx, 'corrupted')) {
      if (p.hp <= cost + 5) return false;
      p.hp -= cost;
      return true;
    }
    if (p.magic < cost) return false;
    p.magic -= cost;
    if (state && this.hasPassive(playerIdx, 'dark_pact') && state.darkPactCooldown <= 0) {
      const sacrifice = Math.max(5, Math.floor(p.maxHp * 0.05));
      p.hp = Math.max(1, p.hp - sacrifice);
      state.darkPactTimer = 180;
      state.darkPactCooldown = 300;
      this.createExplosion(this.playerPositions[playerIdx], '#882222', 20, 4, 6);
    }
    return true;
  }

  private handleHealBurst(playerIdx: number, pos: Vec2) {
    if (this.hasPassive(playerIdx, 'light_burst') || this.hasPassive(playerIdx, 'holy_light')) {
      const radius = this.hasPassive(playerIdx, 'holy_light') ? 160 : 120;
      const damage = this.hasPassive(playerIdx, 'holy_light') ? 60 : 40;
      this.enemies.forEach(e => {
        if (this.distSq(pos, e.pos) < radius * radius) {
          this.dealDamageToEnemy(e, damage, { playerId: playerIdx, element: ElementType.MAGIC, isSpell: true });
        }
      });
      this.createExplosion(pos, '#ffff88', 30, 5, 8);
    }
  }

  private performMeleeAttack(playerIdx: number) {
    const p = this.players[playerIdx];
    const state = this.passiveState[playerIdx];
    if (!p || !state) return;
    const pos = this.playerPositions[playerIdx];
    const move = this.input.getMovement(playerIdx);
    const aimStick = this.input.getRightStick(playerIdx);
    const aimMagSq = aimStick.x * aimStick.x + aimStick.y * aimStick.y;
    const ang = aimMagSq > 0.04 ? Math.atan2(aimStick.y, aimStick.x) : p.lastAimAngle;

    const baseDamage = p.damage * 1.2;
    const isCharge = move.x * move.x + move.y * move.y > 0.6;
    const isAir = p.z > 0.1;

    let hit = false;
    this.enemies.forEach(e => {
      if (this.distSq(pos, e.pos) < 70 * 70) {
        hit = true;
        this.dealDamageToEnemy(e, baseDamage, { playerId: playerIdx, element: ElementType.PHYSICAL, isMelee: true, isAirborne: isAir, isCharge });
      }
    });

    if (this.hasPassive(playerIdx, 'titan_strength')) {
      const shockDamage = Math.floor(baseDamage * 0.5);
      this.enemies.forEach(e => {
        if (this.distSq(pos, e.pos) < 160 * 160) {
          this.dealDamageToEnemy(e, shockDamage, { playerId: playerIdx, element: ElementType.PHYSICAL, isMelee: true });
        }
      });
      this.createExplosion(pos, '#aa8844', 25, 4, 6);
    }

    if (hit) {
      this.createSlash(pos, ang, 60, '#ffffff');
      if (this.hasPassive(playerIdx, 'beastial')) state.beastialChargeTimer = 0;
    }
  }

  private spawnMimeBarrier(playerIdx: number, pos: Vec2, aim: Vec2) {
    const dirLen = Math.sqrt(aim.x * aim.x + aim.y * aim.y) || 1;
    const dir = { x: aim.x / dirLen, y: aim.y / dirLen };
    const barrierPos = { x: pos.x + dir.x * 80, y: pos.y + dir.y * 80 };
    this.mimeBarriers.push({ id: this.nextId++, pos: barrierPos, radius: 50, life: 120, ownerId: playerIdx });
    this.createExplosion(barrierPos, '#cccccc', 12, 2, 4);
  }

  private updateMimeBarriers() {
    this.mimeBarriers.forEach(b => b.life--);
    this.mimeBarriers = this.mimeBarriers.filter(b => b.life > 0);
  }

  private updateRevives() {
    this.players.forEach((p, i) => {
      if (!p.isDead) return;
      let reviver: number | null = null;
      for (let j = 0; j < this.players.length; j++) {
        if (i === j || this.players[j].isDead) continue;
        if (!this.input.isRevivePressed(j)) continue;
        if (this.distSq(this.playerPositions[i], this.playerPositions[j]) < 80 * 80) {
          reviver = j;
          break;
        }
      }

      if (reviver !== null) {
        p.reviveProgress++;
        if (p.reviveProgress >= 120) {
          p.isDead = false;
          p.hp = Math.max(1, Math.floor(p.maxHp * 0.4));
          p.reviveProgress = 0;
          this.handleChallengeProgress('revive_ally', 1);
          this.createExplosion(this.playerPositions[i], '#44ff88', 25, 4, 6);
          this.addDamageNumber({ x: this.playerPositions[i].x, y: this.playerPositions[i].y - 20 }, 0, true, 'REVIVED');
        }
      } else {
        p.reviveProgress = Math.max(0, p.reviveProgress - 1);
      }
    });
  }

  private spawnBoss() {
    const spawnPos = { x: WORLD_WIDTH/2 + 800, y: WORLD_HEIGHT/2 };
    const config = ENEMY_TYPES.DRAGON_BOSS;
    this.enemies.push({
        id: this.nextId++, pos: spawnPos,
        hp: config.hp + (this.wave * 1500), maxHp: config.hp + (this.wave * 1500),
        speed: config.speed, radius: config.radius, damage: config.damage,
        type: 'DRAGON_BOSS', movement: 'BOSS_PATTERN', cooldown: 0, knockbackVel: { x: 0, y: 0 },
        slowTimer: 0, burnTimer: 0, poisonTimer: 0, isAggressive: true,
        angle: 0, visionCone: 0, visionRange: 0, canFly: true, fireBreathCooldown: 0
    });
    this.enemiesSpawned++;
    this.announce('DRAGON BOSS APPROACHES!', '#ff2200', 3);
  }

  private hasLineOfSight(from: Vec2, to: Vec2): boolean {
    const dist = Math.sqrt((to.x - from.x)**2 + (to.y - from.y)**2);
    const steps = Math.floor(dist / 20);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const testX = from.x + (to.x - from.x) * t;
      const testY = from.y + (to.y - from.y) * t;
      if (this.world.getBiomeAt(testX, testY) === 'MOUNTAIN') return false;
    }
    return true;
  }

  public update() {
    if (this.state !== GameState.PLAYING) return;
    this.frameCount++;
    enginePerf.startFrame();
    enginePerf.measure('startupQueue', () => this.processStartupQueue());

    enginePerf.measure('spatialHash', () => {
      // Rebuild spatial hash for efficient queries
      this.enemySpatialHash.clear();
      this.enemySpatialHash.insertAll(this.enemies);
    });

    enginePerf.measure('camera', () => {
      let avgX = 0, avgY = 0, aliveCount = 0;
      this.playerPositions.forEach((pos, i) => {
          if (!this.players[i].isDead) {
              avgX += pos.x; avgY += pos.y; aliveCount++;
          }
      });
      if (aliveCount > 0) { avgX /= aliveCount; avgY /= aliveCount; }
      
      const targetCamX = avgX - window.innerWidth / 2;
      const targetCamY = avgY - window.innerHeight / 2;
      this.camera.x += (targetCamX - this.camera.x) * 0.08;
      this.camera.y += (targetCamY - this.camera.y) * 0.08;
    });

    enginePerf.measure('world.update', () => {
      // Lazy chunk loading/unloading
      this.world.update(this.camera.x, this.camera.y, window.innerWidth, window.innerHeight);
    });

    enginePerf.measure('players', () => {
      this.players.forEach((p, i) => {
        const pos = this.playerPositions[i];
        if (p.isDead) return;
        const state = this.passiveState[i] || (this.passiveState[i] = this.createPassiveState());

        if (state.invulnTimer > 0) state.invulnTimer--;
        if (state.spectralTimer > 0) state.spectralTimer--;
        if (state.iaidoTimer > 0) state.iaidoTimer--;
        if (state.beastialChargeTimer > 0) state.beastialChargeTimer--;
        if (state.darkPactTimer > 0) state.darkPactTimer--;
        if (state.darkPactCooldown > 0) state.darkPactCooldown--;
        if (state.mimeBarrierCooldown > 0) state.mimeBarrierCooldown--;

        if (state.killStreakTimer > 0) {
          state.killStreakTimer--;
          if (state.killStreakTimer <= 0) state.killStreak = 0;
        }
        if (state.bladeDanceTimer > 0) {
          state.bladeDanceTimer--;
          if (state.bladeDanceTimer <= 0) state.bladeDanceStacks = 0;
        }

        p.meleeCooldown = Math.max(0, p.meleeCooldown - 1);

        p.magic = Math.min(p.maxMagic, p.magic + 0.35);
        // Passive health regen (slow)
        if (this.frameCount % 60 === 0 && p.hp < p.maxHp) {
          p.hp = Math.min(p.maxHp, p.hp + 1);
        }
        const move = this.input.getMovement(i);
        const aimStick = this.input.getRightStick(i);
        const aimMagSq = aimStick.x * aimStick.x + aimStick.y * aimStick.y;
        if (aimMagSq > 0.04) {
          p.lastAimAngle = Math.atan2(aimStick.y, aimStick.x);
        }
        if (this.hasPassive(i, 'ancient')) {
          p.knockbackVel.x = 0;
          p.knockbackVel.y = 0;
        }

        const blockPressed = this.input.isBlockPressed(i);
        if (blockPressed && !state.blocking) state.blockStartFrame = this.frameCount;
        state.blocking = blockPressed;
        if (state.shieldTimer > 0) state.shieldTimer--;
        p.isBlocking = blockPressed || state.shieldTimer > 0;

        if (p.z === 0 && this.input.isJumpPressed(i)) p.zVel = JUMP_FORCE;
        p.z += p.zVel;
        if (p.z > 0) p.zVel -= GRAVITY;
        else { p.z = 0; p.zVel = 0; }

        // Check if player can land on a wall/tower (when falling)
        if (p.zVel < 0) {
          const wallBelow = this.getWallAt(pos, PLAYER_RADIUS);
          const towerBelow = this.getTowerAt(pos, PLAYER_RADIUS);
          if (wallBelow && p.z <= WALL_HEIGHT && p.z + p.zVel < WALL_HEIGHT) {
            p.z = WALL_HEIGHT;
            p.zVel = 0;
          } else if (towerBelow && p.z <= WALL_HEIGHT && p.z + p.zVel < WALL_HEIGHT) {
            p.z = WALL_HEIGHT;
            p.zVel = 0;
          }
        }

        // Allow jumping off walls
        if (p.z === WALL_HEIGHT && this.input.isJumpPressed(i)) {
          p.zVel = JUMP_FORCE;
        }

        // Mounting with Sneak Logic - multi-rider support for chariot/dragon/boat
        if (this.input.isRevivePressed(i) && !p.mount) {
            for (const m of this.mounts) {
                const dSq = this.distSq(m.pos, pos);
                if (dSq < 70 * 70) {
                    const cfg = MOUNT_CONFIGS[m.type];
                    const angleToPlayer = Math.atan2(pos.y - m.pos.y, pos.x - m.pos.x);
                    let diff = Math.abs(angleToPlayer - m.angle);
                    while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);

                    const isBehind = diff > 2.0;
                    const canMount = !m.alerted || isBehind || m.riders.length > 0;
                    const hasRoom = m.riders.length < cfg.maxRiders;

                    if (canMount && hasRoom && !m.riders.includes(i)) {
                      p.mount = m.type;
                      p.mountId = m.id;
                      m.riders.push(i);
                      this.createExplosion(pos, '#fff', 15, 2, 4);
                      break;
                    }
                }
            }
        }

        // Dismount with R when already mounted
        else if (this.input.isRevivePressed(i) && p.mount && p.mountId !== null) {
            const mount = this.mounts.find(m => m.id === p.mountId);
            if (mount) {
              mount.riders = mount.riders.filter(r => r !== i);
            }
            p.mount = null;
            p.mountId = null;
            this.createExplosion(pos, '#fff', 10, 1, 3);
        }

        // Interaction Check: Town or Trader
        if (this.input.isRevivePressed(i)) {
          const distToTown = Math.sqrt(this.distSq(pos, this.town.pos));
          if (distToTown < 300) this.state = GameState.SHOP;

          this.traders.forEach(tr => {
            if (this.distSq(pos, tr.pos) < 150 * 150) this.state = GameState.SHOP;
          });
        }

        let finalSpeed = p.speed * this.getSpeedMultiplier(i);
        if (p.isBlocking) finalSpeed *= 0.4;
        if (p.mount) finalSpeed *= MOUNT_CONFIGS[p.mount].speedMult;

        const oldX = pos.x, oldY = pos.y;
        const currentMount = p.mountId !== null ? this.mounts.find(m => m.id === p.mountId) : null;
        const isDriver = currentMount && currentMount.riders[0] === i;

        if (currentMount && !isDriver) {
          // Passenger - follow mount with offset
          const riderIdx = currentMount.riders.indexOf(i);
          const offsetAngle = currentMount.angle + Math.PI + (riderIdx - 1) * 0.7;
          const offsetDist = 20 + riderIdx * 12;
          pos.x = currentMount.pos.x + Math.cos(offsetAngle) * offsetDist;
          pos.y = currentMount.pos.y + Math.sin(offsetAngle) * offsetDist;
        } else {
          pos.x += move.x * finalSpeed;
          pos.y += move.y * finalSpeed;
          if (p.knockbackVel.x !== 0 || p.knockbackVel.y !== 0) {
            pos.x += p.knockbackVel.x;
            pos.y += p.knockbackVel.y;
            p.knockbackVel.x *= 0.7;
            p.knockbackVel.y *= 0.7;
            if (Math.abs(p.knockbackVel.x) < 0.05) p.knockbackVel.x = 0;
            if (Math.abs(p.knockbackVel.y) < 0.05) p.knockbackVel.y = 0;
          }
          pos.x = Math.max(0, Math.min(WORLD_WIDTH, pos.x));
          pos.y = Math.max(0, Math.min(WORLD_HEIGHT, pos.y));

          // Mountain/sea collision (skip when spectral)
          const biome = this.world.getBiomeAt(pos.x, pos.y);
          if (state.spectralTimer <= 0) {
            if (biome === 'MOUNTAIN' && p.mount !== 'DRAGON') { pos.x = oldX; pos.y = oldY; }
            if (biome === 'SEA' && p.mount !== 'DRAGON' && p.mount !== 'BOAT') { pos.x = oldX; pos.y = oldY; }
          }

          // Driver updates mount position
          if (currentMount && isDriver) {
            currentMount.pos = { ...pos };
            if (move.x !== 0 || move.y !== 0) currentMount.angle = Math.atan2(move.y, move.x);
          }
        }

        const newBiome = this.world.getBiomeAt(pos.x, pos.y);

        // Forest-based passives and challenge tracking
        if (newBiome === 'FOREST') {
          state.forestFrames++;
          if (state.forestFrames >= 60) {
            state.forestFrames = 0;
            this.handleChallengeProgress('forest_time', 1);
          }
          if (this.hasPassive(i, 'natures_gift') && this.frameCount % 45 === 0) {
            this.applyHealingToPlayer(i, 1, 'other');
          }
          if (this.hasPassive(i, 'wild_growth')) {
            state.wildGrowthTimer++;
            if (state.wildGrowthTimer >= 120) {
              state.wildGrowthTimer = 0;
              state.wildGrowthStacks = Math.min(5, state.wildGrowthStacks + 1);
            }
          }
        } else {
          state.forestFrames = 0;
          if (this.hasPassive(i, 'wild_growth') && state.wildGrowthStacks > 0 && this.frameCount % 120 === 0) {
            state.wildGrowthStacks = Math.max(0, state.wildGrowthStacks - 1);
          }
          state.wildGrowthTimer = 0;
        }

        const movedDist = Math.abs(pos.x - state.lastPos.x) + Math.abs(pos.y - state.lastPos.y);
        if (movedDist < 0.5) state.stillFrames++;
        else state.stillFrames = 0;
        state.lastPos = { x: pos.x, y: pos.y };

        // City auto-heal - full HP when entering city, 2min cooldown
      if (this.playerCityHealCooldowns[i] > 0) this.playerCityHealCooldowns[i]--;
      if (newBiome === 'TOWN' && this.playerCityHealCooldowns[i] <= 0 && p.hp < p.maxHp) {
        p.hp = p.maxHp;
        this.playerCityHealCooldowns[i] = CITY_HEAL_COOLDOWN;
        this.createExplosion(pos, '#00ff88', 25, 4, 6);
        this.addDamageNumber({ x: pos.x, y: pos.y - 30 }, 0, true, 'FULL HEAL');
      }

      for (let s = 0; s < 4; s++) {
        p.skillCooldowns[s] = Math.max(0, p.skillCooldowns[s] - 1);
        if (p.skillCooldowns[s] <= 0 && this.input.isSkillPressed(i, s)) this.activateSkill(i, s);
      }

      // Limit Break: L3+R3 when fully charged
      if (!p.isLimitBreakActive) {
        p.limitBreakCharge = Math.min(LIMIT_BREAK_MAX_CHARGE, p.limitBreakCharge + LIMIT_BREAK_REGEN_PER_FRAME);
        if (p.limitBreakCharge >= LIMIT_BREAK_MAX_CHARGE && this.input.isLimitBreakPressed(i)) {
          p.isLimitBreakActive = true;
          p.limitBreakTimer = LIMIT_BREAK_DURATION;
          p.limitBreakCharge = 0;
          this.activateLimitBreak(i);
        }
      } else {
        p.limitBreakTimer--;
        this.updateLimitBreak(i);
        if (p.limitBreakTimer <= 0) {
          p.isLimitBreakActive = false;
        }
      }

      if (p.isBlocking && this.hasPassive(i, 'divine_shield') && this.frameCount % 30 === 0) {
        this.players.forEach((other, oi) => {
          if (oi === i || other.isDead) return;
          if (this.distSq(this.playerPositions[oi], pos) < 200 * 200) {
            const healed = this.applyHealingToPlayer(oi, 2, 'other');
            if (healed > 0) {
              this.addDamageNumber({ x: this.playerPositions[oi].x, y: this.playerPositions[oi].y - 20 }, healed, false, `+${Math.floor(healed)}`);
            }
          }
        });
      }

      if (this.hasPassive(i, 'mime_trick') && p.isBlocking && state.mimeBarrierCooldown <= 0) {
        const aimStick = this.input.getRightStick(i);
        const aimMagSq = aimStick.x * aimStick.x + aimStick.y * aimStick.y;
        const aim = aimMagSq > 0.04
          ? aimStick
          : { x: Math.cos(p.lastAimAngle), y: Math.sin(p.lastAimAngle) };
        this.spawnMimeBarrier(i, pos, aim);
        state.mimeBarrierCooldown = 180;
      }

      if (this.input.isMeleePressed(i) && p.meleeCooldown <= 0) {
        this.performMeleeAttack(i);
        p.meleeCooldown = this.getMeleeCooldown(i);
      }

      p.autoAttackCooldown--;
      if (p.autoAttackCooldown <= 0) {
          const fireAngle = p.lastAimAngle;
          this.shoot(i, fireAngle, ElementType.PHYSICAL, p.weaponType);
          p.autoAttackCooldown = this.getAttackInterval(i);
      }

      // Magic Wheel Controls
      if (this.wheelInputCooldowns[i] > 0) this.wheelInputCooldowns[i]--;
      const wheel = this.magicWheels[i];
      if (wheel) {
        const rightStick = this.input.getRightStick(i);
        wheel.updateAim(rightStick.x, rightStick.y);
        wheel.updateCharge(1);

        if (this.input.isWheelOpenPressed(i) && this.wheelInputCooldowns[i] <= 0) {
          wheel.toggleWheel();
          this.wheelInputCooldowns[i] = 15;
        }

        if (wheel.getState().isOpen) {
          if (this.input.isWheelSelectPressed(i) && this.wheelInputCooldowns[i] <= 0) {
            if (wheel.selectElement()) {
              this.createExplosion(pos, MAGIC_ELEMENT_COLORS[wheel.getElementForSegment(wheel.getState().selectedSegment)], 8, 2, 3);
            }
            this.wheelInputCooldowns[i] = 12;
          }

          if (this.input.isWheelClearPressed(i) && this.wheelInputCooldowns[i] <= 0) {
            wheel.clearStack();
            this.wheelInputCooldowns[i] = 15;
          }

          if (this.input.isWheelModePressed(i) && this.wheelInputCooldowns[i] <= 0) {
            wheel.cycleCastMode();
            this.wheelInputCooldowns[i] = 20;
          }

          if (this.input.isModifierCyclePressed(i) && this.wheelInputCooldowns[i] <= 0) {
            wheel.cycleModifier();
            this.wheelInputCooldowns[i] = 20;
          }

          if (this.input.isWheelCastPressed(i) && this.wheelInputCooldowns[i] <= 0) {
            const manaCost = wheel.calculateManaCost();
            if (wheel.getState().stack.elements.length > 0 && this.spendSpellResource(i, manaCost)) {
              const aimAngle = rightStick.x !== 0 || rightStick.y !== 0
                ? Math.atan2(rightStick.y, rightStick.x)
                : p.lastAimAngle;

              const castMode = wheel.getState().castMode;
              if (castMode === 'ATTACK') {
                const projs = wheel.cast(i, pos, aimAngle);
                projs.forEach(proj => this.magicProjectiles.push(proj));
              } else if (castMode === 'SELF') {
                const result = wheel.castSelf(i, pos);
                if (result.heal > 0) {
                  const healed = this.applyHealingToPlayer(i, result.heal, 'spell');
                  if (healed > 0) {
                    this.addDamageNumber({ x: pos.x, y: pos.y - 20 }, healed, false, '+' + Math.floor(healed));
                    this.handleHealBurst(i, pos);
                  }
                }
                if (result.shield) {
                  const state = this.passiveState[i];
                  if (state) state.shieldTimer = Math.max(state.shieldTimer, 180);
                }
                this.createExplosion(pos, '#40ff90', 20, 3, 5);
              } else if (castMode === 'AREA') {
                const area = wheel.castArea(pos, aimAngle);
                if (area) {
                  const primaryElement = this.magicElementToElementType(area.elements[0]);
                  this.fireAreas.push({
                    id: this.nextId++,
                    pos: area.pos,
                    radius: area.radius,
                    life: area.duration,
                    maxLife: area.duration,
                    damage: area.damage,
                    color: MAGIC_ELEMENT_COLORS[area.elements[0]] || '#cc33ff',
                    sourcePlayerId: i,
                    element: primaryElement
                  });
                }
              }
              this.handleChallengeProgress('cast_200', 1);
              wheel.closeWheel();
              this.wheelInputCooldowns[i] = 30;
            }
          }
        }
      }
    });
    });

    this.updateRevives();
    this.updateMimeBarriers();

    enginePerf.measure('magicProjectiles', () => this.updateMagicProjectiles());
    enginePerf.measure('traders', () => this.updateTraders());
    enginePerf.measure('attacks', () => this.updateAttacks());
    enginePerf.measure('walls', () => this.updateWalls());
    enginePerf.measure('towers', () => this.updateTowers());
    enginePerf.measure('enemies', () => this.updateEnemies());
    enginePerf.measure('fireAreas', () => this.updateFireAreas());
    enginePerf.measure('slashEffects', () => this.updateSlashEffects());
    enginePerf.measure('fireTelegraphs', () => this.updateFireTelegraphs());
    enginePerf.measure('mounts', () => this.updateMounts());
    enginePerf.measure('pickups', () => this.updatePickups());
    enginePerf.measure('factionCastles', () => this.updateFactionCastles());
    enginePerf.measure('allies', () => this.updateAllies());
    enginePerf.measure('events', () => this.updateEvents());
    enginePerf.measure('announcements', () => this.updateAnnouncements());

    enginePerf.measure('buildPlacement', () => {
      // Handle building placement
      if (this.buildMode && this.playerPositions[0]) {
        const aim = this.input.getAim(0);
        const move = this.input.getMovement(0);
        const aimDir = aim || (move.x !== 0 || move.y !== 0 ? move : { x: 1, y: 0 });

        if (this.input.isShootPressed(0)) {
          const pos = this.playerPositions[0];
          const worldX = pos.x + aimDir.x * 80;
          const worldY = pos.y + aimDir.y * 80;
          this.placeBuilding(worldX, worldY);
        }
        if (this.input.isBlockPressed(0) && this.frameCount % 15 === 0) {
          this.rotateBuild();
        }
        if (this.input.isBuildCancelPressed(0)) {
          this.cancelBuild();
        }
      }
    });

    enginePerf.measure('waveSpawn', () => {
      if (this.enemiesSpawned < this.enemiesToSpawn && this.frameCount % 100 === 0) {
          const spawnPos = this.getValidEnemySpawn();
          if (spawnPos) this.spawnEnemy(spawnPos);
      }

      if (this.enemiesKilledThisWave >= this.enemiesToSpawn && this.enemies.length === 0) {
          this.startWave(this.wave + 1);
      }
    });

    enginePerf.measure('particles', () => {
      this.particles.forEach(p => { p.pos.x += p.vel.x; p.pos.y += p.vel.y; p.life--; });
      this.particles = this.particles.filter(p => p.life > 0);
      this.damageNumbers.forEach(dn => { dn.pos.y -= 1.0; dn.life--; });
      this.damageNumbers = this.damageNumbers.filter(dn => dn.life > 0);
    });

    enginePerf.measure('coins', () => {
      // Optimized coin physics - avoid sqrt when possible
      const collectDistSq = 30 * 30;
      const attractDistSq = 120 * 120;
      for (let ci = this.coins.length - 1; ci >= 0; ci--) {
        const c = this.coins[ci];
        c.pos.x += c.vel.x; c.pos.y += c.vel.y;

        for (let pi = 0; pi < this.playerPositions.length; pi++) {
          const pp = this.playerPositions[pi];
          const dx = pp.x - c.pos.x, dy = pp.y - c.pos.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < collectDistSq) {
            this.money += c.value;
            this.handleChallengeProgress('collect_gold', c.value);
            this.coins.splice(ci, 1);
            break; // Coin collected, move to next
          } else if (distSq < attractDistSq) {
            const d = Math.sqrt(distSq);
            c.vel.x += (dx / d) * 0.4;
            c.vel.y += (dy / d) * 0.4;
          }
        }
      }
    });

    enginePerf.measure('deathCheck', () => {
      this.players.forEach((p, i) => {
        if (!p.isDead && p.hp <= 0) {
          p.isDead = true;
          const deathPos = this.playerPositions[i];
          const state = this.passiveState[i];
          if (state && this.hasPassive(i, 'phoenix_rebirth') && state.phoenixUsed) {
            this.createExplosion(deathPos, '#ff6600', 70, 10, 16);
            this.enemies.forEach(e => {
              if (this.distSq(deathPos, e.pos) < 220 * 220) {
                this.dealDamageToEnemy(e, 60, { playerId: i, element: ElementType.FIRE, isSpell: true });
              }
            });
          }
          this.createExplosion(deathPos, '#ff0000', 30, 5, 8);
        }
      });
      if (this.players.every(p => p.isDead)) {
        this.handleRunComplete();
        this.state = GameState.GAME_OVER;
        this.prepareNextWorld();
      }
    });
  }

  private updateTraders() {
    this.traders.forEach(tr => {
      // Skip simulation for far-away traders
      if (!this.isInSimRange(tr.pos, 600)) return;

      const dx = tr.targetPos.x - tr.pos.x;
      const dy = tr.targetPos.y - tr.pos.y;
      const d = Math.sqrt(dx*dx + dy*dy);

      if (d < 50) tr.targetPos = this.world.getSpawnablePosition();
      else {
        tr.angle = Math.atan2(dy, dx);
        tr.pos.x += Math.cos(tr.angle) * tr.speed;
        tr.pos.y += Math.sin(tr.angle) * tr.speed;
      }
    });
  }

  private updateMounts() {
    this.mounts.forEach(m => {
      if (!this.isInSimRange(m.pos, 600)) return;

      const mountRadius = m.type === 'DRAGON' ? 40 : m.type === 'CHARIOT' ? 32 : 24;

      // Enemy damage to mounts
      if (!this.friendlyEntitiesInvulnerable) {
        this.enemies.forEach(e => {
          if (!e.isAggressive) return;
          if (this.distSq(m.pos, e.pos) < (mountRadius + e.radius) ** 2) {
            m.hp -= e.damage * 0.5;
            e.knockbackVel = { x: (e.pos.x - m.pos.x) * 0.3, y: (e.pos.y - m.pos.y) * 0.3 };
          }
        });
      }

      // Horses flee from aggressive enemies
      if (m.type === 'HORSE') {
        if (m.panicTimer === undefined) m.panicTimer = 0;
        if (m.panicTimer > 0) m.panicTimer--;
        const nearby = this.enemySpatialHash.getNearby(m.pos.x, m.pos.y, 320);
        let nearestDist = Infinity;
        for (const e of nearby) {
          if (!e.isAggressive) continue;
          const d = Math.sqrt(this.distSq(m.pos, e.pos));
          if (d < nearestDist) nearestDist = d;
        }
        if (nearestDist < 260 && m.panicTimer <= 0 && Math.random() < 0.02) {
          m.panicTimer = 180;
          m.alerted = true;
        }

        if (m.panicTimer > 0 || nearestDist < 120) {
          let fleeVec = { x: 0, y: 0 };
          for (const e of nearby) {
            if (!e.isAggressive) continue;
            const d = Math.sqrt(this.distSq(m.pos, e.pos));
            if (d < 300) {
              const strength = (300 - d) / 300;
              const boost = m.panicTimer > 0 ? 5.5 : 3.5;
              fleeVec.x += (m.pos.x - e.pos.x) / d * strength * boost;
              fleeVec.y += (m.pos.y - e.pos.y) / d * strength * boost;
            }
          }
          if (fleeVec.x !== 0 || fleeVec.y !== 0) {
            m.pos.x += fleeVec.x;
            m.pos.y += fleeVec.y;
            m.angle = Math.atan2(fleeVec.y, fleeVec.x);
            m.alerted = true;
          }
        }
      }

      // Dragon boss behavior - aggressive, breathes fire, hard to catch
      if (m.type === 'DRAGON') {
        let nearestPlayer: { pos: { x: number; y: number }; dist: number } | null = null;
        this.playerPositions.forEach((pp, i) => {
          if (this.players[i].isDead || this.players[i].mount) return;
          const d = Math.sqrt(this.distSq(m.pos, pp));
          if (!nearestPlayer || d < nearestPlayer.dist) nearestPlayer = { pos: pp, dist: d };
        });

        if (nearestPlayer && nearestPlayer.dist < 600) {
          m.alerted = true;
          const angToP = Math.atan2(nearestPlayer.pos.y - m.pos.y, nearestPlayer.pos.x - m.pos.x);

          if (nearestPlayer.dist < 200) {
            // Too close - circle and attack
            const orbitAng = angToP + Math.PI / 2 + Math.sin(this.frameCount * 0.02) * 0.5;
            m.pos.x += Math.cos(orbitAng) * 5;
            m.pos.y += Math.sin(orbitAng) * 5;
            m.angle = angToP;

            // Breathe fire at player
            if (this.frameCount % 90 === 0) {
              for (let i = -2; i <= 2; i++) {
                const fireAng = angToP + i * 0.15;
                const fPos = { x: m.pos.x + Math.cos(fireAng) * 80, y: m.pos.y + Math.sin(fireAng) * 80 };
                this.fireAreas.push({ id: this.nextId++, pos: fPos, radius: 40, life: 90, maxLife: 90, damage: 15, color: '#ff4400', element: ElementType.FIRE });
              }
              this.createExplosion(m.pos, '#ff6600', 15, 3, 5);
            }
          } else if (nearestPlayer.dist < 400) {
            // Medium range - strafe and dive occasionally
            const strafeAng = angToP + Math.PI / 2;
            m.pos.x += Math.cos(strafeAng) * 3;
            m.pos.y += Math.sin(strafeAng) * 3;
            m.angle = angToP;

            // Occasional dive attack
            if (this.frameCount % 180 === 0 && Math.random() < 0.4) {
              m.pos.x += Math.cos(angToP) * 150;
              m.pos.y += Math.sin(angToP) * 150;
              this.createExplosion(m.pos, '#ff4400', 20, 4, 6);
            }
          } else {
            // Far - fly away, circle back
            const fleeAng = angToP + Math.PI + Math.sin(this.frameCount * 0.01) * 0.8;
            m.pos.x += Math.cos(fleeAng) * 4;
            m.pos.y += Math.sin(fleeAng) * 4;
            m.angle = fleeAng;
          }
        } else {
          // Idle dragon - soar majestically
          m.alerted = false;
          if (this.frameCount % 120 === 0) m.angle += (Math.random() - 0.5) * 0.6;
          m.pos.x += Math.cos(m.angle) * 2;
          m.pos.y += Math.sin(m.angle) * 2;
        }

        m.pos.x = Math.max(0, Math.min(WORLD_WIDTH, m.pos.x));
        m.pos.y = Math.max(0, Math.min(WORLD_HEIGHT, m.pos.y));
        return;
      }

      // Standard mount behavior (horses, chariots, boats)
      let isSeen = false;
      this.playerPositions.forEach((pp, i) => {
        if (this.players[i].isDead || this.players[i].mount) return;
        const d = Math.sqrt(this.distSq(m.pos, pp));
        if (d < 450) {
          const angToP = Math.atan2(pp.y - m.pos.y, pp.x - m.pos.x);
          let diff = Math.abs(angToP - m.angle);
          while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);

          if (diff < 0.85 && this.hasLineOfSight(m.pos, pp)) {
            isSeen = true; m.alerted = true;
            m.angle = angToP + Math.PI;
            m.pos.x += Math.cos(m.angle) * 7;
            m.pos.y += Math.sin(m.angle) * 7;
          }
        }
      });

      if (!isSeen) {
        m.alerted = false;
        if (this.frameCount % 180 === 0) m.angle += (Math.random() - 0.5);
        m.pos.x += Math.cos(m.angle) * 0.45;
        m.pos.y += Math.sin(m.angle) * 0.45;
      }

      m.pos.x = Math.max(0, Math.min(WORLD_WIDTH, m.pos.x));
      m.pos.y = Math.max(0, Math.min(WORLD_HEIGHT, m.pos.y));
    });

    // Filter out destroyed mounts
    this.mounts = this.mounts.filter(m => {
      if (m.hp <= 0) {
        this.createExplosion(m.pos, MOUNT_CONFIGS[m.type].color, 20, 3, 6);
        return false;
      }
      return true;
    });
  }

  private spawnWorldPickups(count: number = STARTUP_TOTALS.pickups) {
    // Spawn initial pickups across the world
    for (let i = 0; i < count; i++) {
      const pos = this.world.getSpawnablePosition();
      const roll = Math.random() * 100;
      let cumulative = 0;
      let type: Pickup['type'] = 'HEALTH_POTION';
      for (let j = 0; j < PICKUP_TYPES.length; j++) {
        cumulative += PICKUP_WEIGHTS[j];
        if (roll < cumulative) { type = PICKUP_TYPES[j]; break; }
      }
      this.pickups.push({
        id: this.nextId++,
        pos,
        type,
        life: type === 'CHEST' ? Infinity : 3600 // chests permanent, others 1 min
      });
    }
  }

  private updatePickups() {
    // Spawn new pickups periodically
    if (this.frameCount % 600 === 0 && this.pickups.length < 100) {
      const pos = this.world.getSpawnablePosition();
      const types: Pickup['type'][] = ['HEALTH_POTION', 'MANA_POTION', 'COIN_BAG'];
      const type = types[Math.floor(Math.random() * types.length)];
      this.pickups.push({ id: this.nextId++, pos, type, life: 3600 });
    }

    // Player collection
    this.pickups.forEach(pk => {
      pk.life--;
      this.playerPositions.forEach((pp, i) => {
        if (this.distSq(pk.pos, pp) < 40 * 40) {
          const p = this.players[i];
          switch (pk.type) {
            case 'HEALTH_POTION':
              const healed = this.applyHealingToPlayer(i, 50, 'potion');
              this.createExplosion(pk.pos, '#ff4444', 10, 2, 4);
              if (healed > 0) this.addDamageNumber(pk.pos, healed, false, `+${Math.floor(healed)} HP`);
              this.handleChallengeProgress('use_potions', 1);
              break;
            case 'MANA_POTION':
              p.magic = Math.min(p.maxMagic, p.magic + 40);
              this.createExplosion(pk.pos, '#4444ff', 10, 2, 4);
              this.addDamageNumber(pk.pos, 40, false, '+40 MP');
              this.handleChallengeProgress('use_potions', 1);
              break;
            case 'COIN_BAG':
              this.money += 100;
              this.createExplosion(pk.pos, '#ffd700', 12, 2, 4);
              this.addDamageNumber(pk.pos, 100, true, '+100 GOLD');
              this.handleChallengeProgress('collect_gold', 100);
              break;
            case 'SPEED_BOOST':
              p.speed += 0.2;
              this.createExplosion(pk.pos, '#00ff88', 10, 2, 4);
              this.addDamageNumber(pk.pos, 0, true, '+SPEED');
              break;
            case 'DAMAGE_BOOST':
              p.damage += 5;
              this.createExplosion(pk.pos, '#ff8800', 10, 2, 4);
              this.addDamageNumber(pk.pos, 5, true, '+5 DMG');
              break;
            case 'CHEST':
              // Random reward from chest
              const rewards = ['gold', 'hp', 'damage', 'speed'];
              const reward = rewards[Math.floor(Math.random() * rewards.length)];
              if (reward === 'gold') { this.money += 250; this.addDamageNumber(pk.pos, 250, true, '+250 GOLD'); this.handleChallengeProgress('collect_gold', 250); }
              else if (reward === 'hp') { p.maxHp += 25; p.hp += 25; this.addDamageNumber(pk.pos, 25, true, '+25 MAX HP'); }
              else if (reward === 'damage') { p.damage += 8; this.addDamageNumber(pk.pos, 8, true, '+8 DMG'); }
              else { p.speed += 0.3; this.addDamageNumber(pk.pos, 0, true, '+SPEED'); }
              this.createExplosion(pk.pos, '#ffd700', 20, 4, 6);
              break;
          }
          pk.life = 0;
        }
      });
    });

    this.pickups = this.pickups.filter(pk => pk.life > 0);
  }

  private updateFireAreas() {
    this.fireAreas.forEach(fa => {
      fa.life--;
      if (!this.isInSimRange(fa.pos, 300)) return;
      const element = fa.element ?? ElementType.FIRE;

      if (this.frameCount % 15 === 0) {
        this.enemies.forEach(e => {
          if (this.distSq(fa.pos, e.pos) < fa.radius**2) {
            if (fa.sourcePlayerId !== undefined) {
              this.dealDamageToEnemy(e, fa.damage, { playerId: fa.sourcePlayerId, element, isSpell: true });
            } else {
              e.hp -= fa.damage;
              if (element === ElementType.FIRE) e.burnTimer = Math.max(e.burnTimer, 120);
              if (element === ElementType.ICE) e.slowTimer = Math.max(e.slowTimer, 120);
              if (element === ElementType.POISON) e.poisonTimer = Math.max(e.poisonTimer, 120);
            }
          }
        });
        if (fa.sourcePlayerId === undefined) {
          this.playerPositions.forEach((pp, i) => {
            if (this.distSq(fa.pos, pp) < fa.radius**2) {
              const dealt = this.applyDamageToPlayer(i, fa.damage * 0.4, { element });
              if (dealt > 0) this.addDamageNumber(pp, dealt, false);
            }
          });
        }
      }
    });
    this.fireAreas = this.fireAreas.filter(fa => fa.life > 0);
  }

  private updateMagicProjectiles() {
    const newProjectiles: MagicProjectile[] = [];

    for (let i = this.magicProjectiles.length - 1; i >= 0; i--) {
      const mp = this.magicProjectiles[i];

      // Homing behavior
      if (mp.homing) {
        let nearest: Enemy | null = null;
        let nearestDist = mp.homingTarget ? Infinity : 400 * 400;

        for (const e of this.enemies) {
          if (mp.homingTarget && e.id === mp.homingTarget) {
            nearest = e;
            break;
          }
          const d = this.distSq(mp.pos, e.pos);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = e;
          }
        }

        if (nearest) {
          mp.homingTarget = nearest.id;
          const targetAngle = Math.atan2(nearest.pos.y - mp.pos.y, nearest.pos.x - mp.pos.x);
          const currentAngle = Math.atan2(mp.vel.y, mp.vel.x);
          const speed = Math.sqrt(mp.vel.x ** 2 + mp.vel.y ** 2);
          let angleDiff = targetAngle - currentAngle;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          const turnRate = 0.08;
          const newAngle = currentAngle + Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), turnRate);
          mp.vel.x = Math.cos(newAngle) * speed;
          mp.vel.y = Math.sin(newAngle) * speed;
        }
      }

      mp.pos.x += mp.vel.x;
      mp.pos.y += mp.vel.y;
      mp.life--;

      let hitEnemy: Enemy | null = null;
      for (const e of this.enemies) {
        if (this.distSq(mp.pos, e.pos) < (mp.radius + e.radius) ** 2) {
          hitEnemy = e;
          const primaryElement = this.magicElementToElementType(mp.elements[0]);
          this.dealDamageToEnemy(e, mp.damage, { playerId: mp.playerId, element: primaryElement, isSpell: true });
          e.knockbackVel = { x: mp.vel.x * 0.3, y: mp.vel.y * 0.3 };

          for (const el of mp.elements) {
            if (el === MagicElement.FIRE) e.burnTimer = Math.max(e.burnTimer, 180);
            if (el === MagicElement.ICE) e.slowTimer = Math.max(e.slowTimer, 240);
            if (el === MagicElement.BLOOD || el === MagicElement.BLACK) e.poisonTimer = Math.max(e.poisonTimer, 150);
          }

          const color = MAGIC_ELEMENT_COLORS[mp.elements[0]] || '#cc33ff';
          this.createExplosion(mp.pos, color, 15, 3, 5);

          if (mp.aoe) {
            this.enemies.forEach(ae => {
              if (ae.id !== e.id && this.distSq(mp.pos, ae.pos) < mp.aoeRadius ** 2) {
                this.dealDamageToEnemy(ae, mp.damage * 0.5, { playerId: mp.playerId, element: primaryElement, isSpell: true });
              }
            });
          }

          mp.pierce--;
          if (mp.pierce < 0) {
            // Split on hit
            if (mp.splitCount > 0) {
              const speed = Math.sqrt(mp.vel.x ** 2 + mp.vel.y ** 2) * 0.8;
              const baseAngle = Math.atan2(mp.vel.y, mp.vel.x);
              for (let s = 0; s < 3; s++) {
                const splitAngle = baseAngle + (s - 1) * 0.6;
                newProjectiles.push({
                  id: this.nextId++,
                  pos: { x: mp.pos.x, y: mp.pos.y },
                  vel: { x: Math.cos(splitAngle) * speed, y: Math.sin(splitAngle) * speed },
                  elements: [...mp.elements],
                  damage: Math.floor(mp.damage * 0.5),
                  radius: mp.radius * 0.7,
                  life: Math.floor(mp.maxLife * 0.5),
                  maxLife: Math.floor(mp.maxLife * 0.5),
                  playerId: mp.playerId,
                  pierce: 0,
                  aoe: mp.aoe,
                  aoeRadius: mp.aoeRadius * 0.6,
                  modifier: 'NONE',
                  splitCount: mp.splitCount - 1,
                  homing: mp.homing,
                });
              }
            }
            this.magicProjectiles.splice(i, 1);
            break;
          }
        }
      }

      if (mp.life <= 0) this.magicProjectiles.splice(i, 1);
    }

    this.magicProjectiles.push(...newProjectiles);
  }

  private updateWalls() {
    this.walls = this.walls.filter(w => {
      if (w.hp <= 0) {
        this.createExplosion(w.pos, '#8B4513', 20, 3, 6);
        return false;
      }
      return true;
    });
  }

  private updateTowers() {
    this.towers.forEach(t => {
      if (!this.isInSimRange(t.pos, 400)) return;
      t.cooldown--;
      if (t.cooldown <= 0) {
        const target = this.getNearestEnemy(t.pos, t.range);
        if (target && target.isAggressive) {
          const ang = Math.atan2(target.pos.y - t.pos.y, target.pos.x - t.pos.x);
          this.bullets.push({
            id: this.nextId++,
            playerId: -1,
            pos: { ...t.pos },
            vel: { x: Math.cos(ang) * 18, y: Math.sin(ang) * 18 },
            damage: t.damage,
            element: ElementType.PHYSICAL,
            radius: 8,
            life: 80,
            pierce: 1
          });
          t.cooldown = t.maxCooldown;
        }
      }
    });
    this.towers = this.towers.filter(t => {
      if (t.hp <= 0) {
        this.createExplosion(t.pos, '#4a3a2f', 30, 4, 8);
        return false;
      }
      return true;
    });
  }

  private getWallAt(pos: Vec2, radius: number): WallPiece | null {
    for (const w of this.walls) {
      const cfg = WALL_CONFIGS[w.type];
      const hw = cfg.width / 2;
      const hh = cfg.height / 2;
      if (pos.x > w.pos.x - hw - radius && pos.x < w.pos.x + hw + radius &&
          pos.y > w.pos.y - hh - radius && pos.y < w.pos.y + hh + radius) {
        return w;
      }
    }
    return null;
  }

  private getTowerAt(pos: Vec2, radius: number): Tower | null {
    for (const t of this.towers) {
      const cfg = WALL_CONFIGS.TOWER;
      const hw = cfg.width / 2;
      if (this.distSq(pos, t.pos) < (hw + radius) ** 2) {
        return t;
      }
    }
    return null;
  }

  private isBlockedByWall(from: Vec2, to: Vec2): WallPiece | null {
    const dist = Math.sqrt(this.distSq(from, to));
    const steps = Math.ceil(dist / 20);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const testPos = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      const wall = this.getWallAt(testPos, 5);
      if (wall && (!wall.isOpen || wall.type !== 'WALL_GATE')) return wall;
    }
    return null;
  }

  private activateSkill(pIdx: number, sIdx: number) {
    const p = this.players[pIdx], pos = this.playerPositions[pIdx];
    const spellId = p.equippedSpells[sIdx];
    if (!spellId) return;

    const spellData = SPELL_DATA[spellId];
    if (!spellData) return;

    // Check resource cost
    if (!this.spendSpellResource(pIdx, spellData.manaCost)) return;
    const cooldownMult = this.getCooldownMultiplier(pIdx, spellData.type);
    p.skillCooldowns[sIdx] = Math.round(spellData.cooldown * cooldownMult);
    this.handleChallengeProgress('cast_200', 1);

    // Dragon mount override - fire breath
    if (p.mount === 'DRAGON') {
      const aimStick = this.input.getRightStick(pIdx);
      const aimMagSq = aimStick.x * aimStick.x + aimStick.y * aimStick.y;
      const ang = aimMagSq > 0.04 ? Math.atan2(aimStick.y, aimStick.x) : p.lastAimAngle;
      for (let i = 0; i < 15; i++) {
        const fPos = { x: pos.x + Math.cos(ang)*(100+i*40), y: pos.y + Math.sin(ang)*(100+i*40) };
        this.fireAreas.push({ id: this.nextId++, pos: fPos, radius: 55, life: 350, maxLife: 350, damage: 25, color: '#ff4400', sourcePlayerId: pIdx, element: ElementType.FIRE });
      }
      return;
    }

    const aimStick = this.input.getRightStick(pIdx);
    const aimMagSq = aimStick.x * aimStick.x + aimStick.y * aimStick.y;
    const ang = aimMagSq > 0.04 ? Math.atan2(aimStick.y, aimStick.x) : p.lastAimAngle;
    const state = this.passiveState[pIdx];

    switch (spellData.type) {
      case 'DASH':
        const move = this.input.getMovement(pIdx);
        pos.x += move.x * spellData.range;
        pos.y += move.y * spellData.range;
        this.createExplosion(pos, '#fff', 20, 4, 6);
        if (state) {
          if (this.hasPassive(pIdx, 'iaido')) state.iaidoTimer = 120;
          if (this.hasPassive(pIdx, 'beastial')) state.beastialChargeTimer = 120;
          if (this.hasPassive(pIdx, 'spectral')) state.spectralTimer = 90;
        }
        if (this.hasPassive(pIdx, 'storm_call')) {
          for (let i = 0; i < 5; i++) {
            const t = i / 4;
            const trailPos = { x: pos.x - Math.cos(ang) * t * 160, y: pos.y - Math.sin(ang) * t * 160 };
            this.fireAreas.push({
              id: this.nextId++,
              pos: trailPos,
              radius: 45,
              life: 45,
              maxLife: 45,
              damage: 18,
              color: '#88ccff',
              sourcePlayerId: pIdx,
              element: ElementType.LIGHTNING
            });
          }
        }
        this.handleChallengeProgress('dash_100', 1);
        this.handleChallengeProgress('dodge_100', 1);
        break;

      case 'NOVA':
        this.createExplosion(pos, '#0ff', 60, 8, 14);
        this.enemies.forEach(e => {
          if (this.distSq(pos, e.pos) < (spellData.radius || 380)**2) {
            this.dealDamageToEnemy(e, spellData.damage, { playerId: pIdx, element: spellData.element, isSpell: true });
          }
        });
        break;

      case 'HEAL':
        this.applyHealingToPlayer(pIdx, Math.abs(spellData.damage), 'spell');
        this.handleHealBurst(pIdx, pos);
        this.createExplosion(pos, '#0f0', 15, 2, 5);
        break;

      case 'LASER':
        for (let k = 0; k < (spellData.projectileCount || 6); k++) {
          this.shoot(pIdx, ang + (Math.random()-0.5)*0.15, ElementType.MAGIC, 'BEAM');
        }
        break;

      case 'FIREBALL':
        const fbPos = { x: pos.x + Math.cos(ang) * spellData.range, y: pos.y + Math.sin(ang) * spellData.range };
        this.fireAreas.push({
          id: this.nextId++, pos: fbPos, radius: spellData.radius || 80,
          life: 60, maxLife: 60, damage: spellData.damage, color: ELEMENT_COLORS[ElementType.FIRE],
          sourcePlayerId: pIdx, element: ElementType.FIRE
        });
        this.createExplosion(fbPos, '#ff4400', 30, 6, 10);
        break;

      case 'ICE_STORM':
        this.fireAreas.push({
          id: this.nextId++, pos: { ...pos }, radius: spellData.radius || 200,
          life: spellData.duration || 180, maxLife: spellData.duration || 180,
          damage: spellData.damage, color: ELEMENT_COLORS[ElementType.ICE],
          sourcePlayerId: pIdx, element: ElementType.ICE
        });
        this.enemies.forEach(e => {
          if (this.distSq(pos, e.pos) < (spellData.radius || 200)**2) e.slowTimer = 120;
        });
        break;

      case 'LIGHTNING_BOLT':
        const lbTarget = this.getNearestEnemy(pos, spellData.range);
        if (lbTarget) {
          this.dealDamageToEnemy(lbTarget, spellData.damage, { playerId: pIdx, element: ElementType.LIGHTNING, isSpell: true });
          this.createExplosion(lbTarget.pos, '#ffff00', 25, 5, 8);
        }
        break;

      case 'METEOR':
        const mPos = { x: pos.x + Math.cos(ang) * 300, y: pos.y + Math.sin(ang) * 300 };
        this.fireAreas.push({
          id: this.nextId++, pos: mPos, radius: spellData.radius || 150,
          life: 90, maxLife: 90, damage: spellData.damage, color: '#ff2200',
          sourcePlayerId: pIdx, element: ElementType.FIRE
        });
        this.createExplosion(mPos, '#ff6600', 80, 10, 16);
        this.enemies.forEach(e => {
          if (this.distSq(mPos, e.pos) < (spellData.radius || 150)**2) {
            this.dealDamageToEnemy(e, spellData.damage, { playerId: pIdx, element: ElementType.FIRE, isSpell: true });
            e.burnTimer = Math.max(e.burnTimer, 180);
          }
        });
        break;

      case 'POISON_CLOUD':
        const pcPos = { x: pos.x + Math.cos(ang) * 200, y: pos.y + Math.sin(ang) * 200 };
        this.fireAreas.push({
          id: this.nextId++, pos: pcPos, radius: spellData.radius || 120,
          life: spellData.duration || 300, maxLife: spellData.duration || 300,
          damage: spellData.damage, color: ELEMENT_COLORS[ElementType.POISON],
          sourcePlayerId: pIdx, element: ElementType.POISON
        });
        break;

      case 'TELEPORT':
        pos.x += Math.cos(ang) * spellData.range;
        pos.y += Math.sin(ang) * spellData.range;
        this.createExplosion(pos, '#cc33ff', 25, 4, 8);
        if (state && this.hasPassive(pIdx, 'spectral')) state.spectralTimer = 120;
        if (this.hasPassive(pIdx, 'void_walk')) {
          this.fireAreas.push({
            id: this.nextId++,
            pos: { ...pos },
            radius: 90,
            life: 120,
            maxLife: 120,
            damage: 30,
            color: '#9933ff',
            sourcePlayerId: pIdx,
            element: ElementType.MAGIC
          });
        }
        this.handleChallengeProgress('teleport_50', 1);
        this.handleChallengeProgress('dodge_100', 1);
        break;

      case 'SHIELD':
        if (state) state.shieldTimer = Math.max(state.shieldTimer, spellData.duration || 300);
        // Shield duration handled in update loop
        break;

      case 'EARTHQUAKE':
        this.createExplosion(pos, '#8B4513', 50, 8, 12);
        this.enemies.forEach(e => {
          if (this.distSq(pos, e.pos) < (spellData.radius || 300)**2) {
            this.dealDamageToEnemy(e, spellData.damage, { playerId: pIdx, element: ElementType.PHYSICAL, isSpell: true });
            e.slowTimer = Math.max(e.slowTimer, 90);
          }
        });
        break;

      case 'CHAIN_LIGHTNING':
        let targets: Enemy[] = [];
        let lastPos = pos;
        for (let i = 0; i < (spellData.projectileCount || 5); i++) {
          const next = this.getNearestEnemy(lastPos, 300);
          if (next && !targets.includes(next)) {
            targets.push(next);
            this.dealDamageToEnemy(next, spellData.damage, { playerId: pIdx, element: ElementType.LIGHTNING, isSpell: true });
            this.createExplosion(next.pos, '#ffff00', 10, 3, 5);
            lastPos = next.pos;
          }
        }
        break;

      case 'BLOOD_DRAIN':
        const drainTarget = this.getNearestEnemy(pos, spellData.range);
        if (drainTarget) {
          this.dealDamageToEnemy(drainTarget, spellData.damage, { playerId: pIdx, element: ElementType.POISON, isSpell: true });
          this.applyHealingToPlayer(pIdx, spellData.damage * 0.5, 'drain');
          if (this.hasPassive(pIdx, 'soul_harvest') || this.hasPassive(pIdx, 'water_flow') || this.hasPassive(pIdx, 'blood_magic')) {
            this.healSummonedAllies(pIdx, spellData.damage * 0.4);
          }
          this.createExplosion(drainTarget.pos, '#880000', 15, 3, 6);
        }
        break;

      case 'TIME_SLOW':
        this.enemies.forEach(e => {
          if (this.distSq(pos, e.pos) < (spellData.radius || 500)**2) {
            e.slowTimer = spellData.duration || 180;
          }
        });
        this.createExplosion(pos, '#9999ff', 40, 5, 10);
        this.handleChallengeProgress('use_time_slow', 1);
        break;

      case 'SUMMON':
        // Spawn a friendly "ghost" enemy that attacks other enemies
        const summonPos = { x: pos.x + Math.cos(ang) * 100, y: pos.y + Math.sin(ang) * 100 };
        this.createExplosion(summonPos, '#aa00ff', 30, 6, 10);
        if (this.hasPassive(pIdx, 'soul_harvest') || this.hasPassive(pIdx, 'water_flow') || this.hasPassive(pIdx, 'blood_magic')) {
          const count = 3 + Math.floor(Math.random() * 2);
          this.spawnSkeletonWarriors(pIdx, summonPos, count, spellData.duration || 600);
          this.handleChallengeProgress('summon_30', count);
        } else {
          this.spawnGhostAlly(pIdx, summonPos, Math.max(10, Math.floor(p.damage * 0.6)), spellData.duration || 600);
          this.handleChallengeProgress('summon_30', 1);
        }
        break;
    }
  }

  private activateLimitBreak(pIdx: number) {
    const p = this.players[pIdx], pos = this.playerPositions[pIdx];
    // Player color determines limit break type: blue=samurai, pink=witch, green=ranger, yellow=paladin
    const colors = ['#4af', '#f4a', '#4fa', '#fa4'];
    const colorIdx = colors.indexOf(p.color);

    // Initial burst effect
    this.createExplosion(pos, '#ff6622', 80, 15, 25);
    this.createExplosion(pos, '#ffaa00', 60, 10, 20);
    this.addDamageNumber({ x: pos.x, y: pos.y - 50 }, 0, false, 'LIMIT BREAK!');

    // Boost stats during limit break
    p.damage *= 2;
    p.speed *= 1.5;
  }

  private updateLimitBreak(pIdx: number) {
    const p = this.players[pIdx], pos = this.playerPositions[pIdx];
    const colors = ['#4af', '#f4a', '#4fa', '#fa4'];
    const colorIdx = colors.indexOf(p.color);
    const timer = p.limitBreakTimer;

    // Fiery aura particles every few frames
    if (timer % 3 === 0) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 20;
      this.particles.push({
        pos: { x: pos.x + Math.cos(angle) * dist, y: pos.y + Math.sin(angle) * dist },
        vel: { x: Math.cos(angle) * 0.5, y: -2 - Math.random() },
        color: timer % 6 < 3 ? '#ff4400' : '#ffaa00',
        size: 3 + Math.random() * 4,
        life: 30,
        maxLife: 30
      });
    }

    // Character-specific limit break effects
    if (colorIdx === 0) {
      // Samurai (blue): Teleport slashes every 20 frames
      if (timer % 20 === 0) {
        const nearestEnemy = this.findNearestEnemy(pos, 400);
        if (nearestEnemy) {
          // Teleport near enemy
          const ang = Math.atan2(nearestEnemy.pos.y - pos.y, nearestEnemy.pos.x - pos.x);
          const teleportDist = Math.sqrt(this.distSq(pos, nearestEnemy.pos)) - 40;
          pos.x += Math.cos(ang) * teleportDist;
          pos.y += Math.sin(ang) * teleportDist;
          // Slash effect
          this.createExplosion(pos, '#ff2200', 35, 8, 12);
          this.dealDamageToEnemy(nearestEnemy, p.damage * 1.5, { playerId: pIdx, element: ElementType.PHYSICAL, isMelee: true });
        }
      }
    } else if (colorIdx === 1) {
      // Witch (pink): Magic storm - bullets everywhere
      if (timer % 8 === 0) {
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2 + timer * 0.1;
          this.bullets.push({
            id: this.nextId++, playerId: pIdx, pos: { ...pos },
            vel: { x: Math.cos(ang) * 8, y: Math.sin(ang) * 8 },
            damage: p.damage * 0.5, element: ElementType.MAGIC, radius: 8, life: 60, pierce: 2
          });
        }
      }
    } else if (colorIdx === 2) {
      // Ranger (green): Rapid multi-shot
      if (timer % 5 === 0) {
        const aimStick = this.input.getRightStick(pIdx);
        const aimMagSq = aimStick.x * aimStick.x + aimStick.y * aimStick.y;
        const ang = aimMagSq > 0.04 ? Math.atan2(aimStick.y, aimStick.x) : p.lastAimAngle;
        for (let s = -2; s <= 2; s++) {
          this.bullets.push({
            id: this.nextId++, playerId: pIdx, pos: { ...pos },
            vel: { x: Math.cos(ang + s * 0.15) * 12, y: Math.sin(ang + s * 0.15) * 12 },
            damage: p.damage * 0.4, element: ElementType.PHYSICAL, radius: 6, life: 50, pierce: 1
          });
        }
      }
    } else {
      // Paladin (yellow): Healing aura + damage pulse
      if (timer % 30 === 0) {
        const healed = this.applyHealingToPlayer(pIdx, 10, 'other');
        if (healed > 0) this.handleHealBurst(pIdx, pos);
        this.createExplosion(pos, '#ffff44', 50, 6, 10);
        this.enemies.forEach(e => {
          if (this.distSq(pos, e.pos) < 200 * 200) {
            this.dealDamageToEnemy(e, p.damage * 0.8, { playerId: pIdx, element: ElementType.PHYSICAL, isSpell: true });
          }
        });
      }
    }

    // End of limit break - reset stats
    if (timer === 1) {
      p.damage /= 2;
      p.speed /= 1.5;
    }
  }

  private findNearestEnemy(pos: { x: number; y: number }, maxDist: number): Enemy | null {
    let nearest: Enemy | null = null;
    let nearestDistSq = maxDist * maxDist;
    for (const e of this.enemies) {
      const d = this.distSq(pos, e.pos);
      if (d < nearestDistSq) {
        nearestDistSq = d;
        nearest = e;
      }
    }
    return nearest;
  }

  private updateEnemies() {
    this.enemies.forEach(e => {
      const meta = this.getEnemyMeta(e);
      if (meta.hexTimer && meta.hexTimer > 0) {
        meta.hexTimer--;
        if (meta.hexTimer <= 0) meta.hexStacks = 0;
      }
      if (meta.fearTimer && meta.fearTimer > 0) meta.fearTimer--;

      // Only fully simulate enemies in range
      const inRange = this.isInSimRange(e.pos, 800);

      // Always tick down timers
      if (e.slowTimer > 0) e.slowTimer--;
      if (e.burnTimer > 0) { e.burnTimer--; if (inRange && e.burnTimer % 30 === 0) e.hp -= 10; }
      if (e.poisonTimer > 0) { e.poisonTimer--; if (inRange && e.poisonTimer % 40 === 0) e.hp -= 15; }

      // Scarecrow fear: weak enemies flee
      if (e.hp / Math.max(1, e.maxHp) < 0.35) {
        const scarecrowIdx = this.players.findIndex((p, i) => !p.isDead && this.hasPassive(i, 'scarecrow_fear') && this.distSq(this.playerPositions[i], e.pos) < 220 * 220);
        if (scarecrowIdx !== -1) {
          meta.fearTimer = Math.max(meta.fearTimer || 0, 90);
          this.handleChallengeProgress('scare_enemies', 1);
        }
      }

      if (meta.fearTimer && meta.fearTimer > 0) {
        const scarePos = this.playerPositions.find((pp, i) => this.hasPassive(i, 'scarecrow_fear'));
        if (scarePos) {
          const dx = e.pos.x - scarePos.x;
          const dy = e.pos.y - scarePos.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          e.pos.x += (dx / d) * e.speed * 1.5;
          e.pos.y += (dy / d) * e.speed * 1.5;
          e.angle = Math.atan2(dy, dx);
          e.isAggressive = false;
          return;
        }
      }

      // Skip AI/movement for out-of-range enemies
      if (!inRange) return;

      // Vision cone detection for non-aggressive enemies
      if (!e.isAggressive && e.visionCone > 0 && e.visionRange > 0) {
        this.playerPositions.forEach((pp, i) => {
          if (this.players[i].isDead) return;
          const dist = Math.sqrt(this.distSq(e.pos, pp));
          if (dist < e.visionRange && this.hasLineOfSight(e.pos, pp)) {
            const angleToPlayer = Math.atan2(pp.y - e.pos.y, pp.x - e.pos.x);
            let angleDiff = Math.abs(angleToPlayer - e.angle);
            while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - Math.PI * 2);
            if (angleDiff < e.visionCone) {
              e.isAggressive = true;
            }
          }
        });
      }

      if (!e.isAggressive) {
        // Wildlife simulation: predators hunt prey - use spatial hash
        if (e.type === 'WOLF' && this.frameCount % 60 === 0) {
          const nearby = this.enemySpatialHash.getNearby(e.pos.x, e.pos.y, 500);
          const prey = nearby.find(other => other.type === 'DEER');
          if (prey) {
            const dx = prey.pos.x - e.pos.x, dy = prey.pos.y - e.pos.y;
            const d = Math.sqrt(dx*dx + dy*dy);
            e.angle = Math.atan2(dy, dx);
            e.pos.x += (dx/d) * e.speed * 1.5;
            e.pos.y += (dy/d) * e.speed * 1.5;
            if (d < 30) { prey.hp -= 15; prey.isAggressive = false; }
            return;
          }
        }

        // Deer flee from nearby threats - use spatial hash
        if (e.type === 'DEER') {
          const nearby = this.enemySpatialHash.getNearby(e.pos.x, e.pos.y, 400);
          const threat = nearby.find(other => other.type === 'WOLF' || other.isAggressive);
          if (threat) {
            const dx = e.pos.x - threat.pos.x, dy = e.pos.y - threat.pos.y;
            const d = Math.sqrt(dx*dx + dy*dy);
            e.pos.x += (dx/d) * e.speed * 1.2;
            e.pos.y += (dy/d) * e.speed * 1.2;
            e.angle = Math.atan2(dy, dx);
            return;
          }
        }

        // Handle different idle movement patterns
        if (e.movement === 'PATROL' && e.patrolTarget) {
          const dx = e.patrolTarget.x - e.pos.x;
          const dy = e.patrolTarget.y - e.pos.y;
          const d = Math.sqrt(dx*dx + dy*dy);
          if (d < 50) {
            e.patrolTarget = this.world.getSpawnablePosition();
          } else {
            e.angle = Math.atan2(dy, dx);
            e.pos.x += Math.cos(e.angle) * e.speed * 0.5;
            e.pos.y += Math.sin(e.angle) * e.speed * 0.5;
          }
        } else if (e.movement === 'STILL') {
          if (this.frameCount % 120 === 0) e.angle += (Math.random() - 0.5) * 0.8;
        } else {
          const wanderAng = this.frameCount * 0.01 + e.id;
          e.pos.x += Math.cos(wanderAng) * 0.8;
          e.pos.y += Math.sin(wanderAng) * 0.8;
          e.angle = wanderAng;
        }
        return;
      }

      if (e.type === 'BOSS_DRAKE') { this.updateBossBehavior(e); return; }
      if (e.type === 'DRAGON_BOSS') { this.updateDragonBoss(e); return; }
      this.updateSpecialEnemy(e);

      const target = this.getNearestPlayer(e.pos);
      if (!target) return;
      const dx = target.x - e.pos.x, dy = target.y - e.pos.y, d = Math.sqrt(dx*dx + dy*dy);
      e.angle = Math.atan2(dy, dx);

      const config = ENEMY_TYPES[e.type];
      const canFly = config.canFly || e.canFly;

      if (!canFly) {
        const nextPos = { x: e.pos.x + (dx/d)*e.speed, y: e.pos.y + (dy/d)*e.speed };
        const blockingWall = this.getWallAt(nextPos, e.radius);
        const blockingTower = this.getTowerAt(nextPos, e.radius);

        if (blockingWall && (!blockingWall.isOpen || blockingWall.type !== 'WALL_GATE')) {
          e.attackingStructure = true;
          e.targetWall = blockingWall.id;
          if (this.frameCount % 30 === 0 && config.wallDamage > 0) {
            blockingWall.hp -= config.wallDamage;
            this.addDamageNumber(blockingWall.pos, config.wallDamage, false);
          }
          return;
        } else if (blockingTower) {
          e.attackingStructure = true;
          if (this.frameCount % 30 === 0 && config.wallDamage > 0) {
            blockingTower.hp -= config.wallDamage;
            this.addDamageNumber(blockingTower.pos, config.wallDamage, false);
          }
          return;
        }
      }

      e.attackingStructure = false;
      e.targetWall = undefined;

      // Dynamic AI: Flanking, retreating, pack behavior
      const hpRatio = e.hp / e.maxHp;

      // Low health enemies retreat
      if (hpRatio < 0.25 && e.type !== 'BOMBER' && e.type !== 'CHARGER') {
        e.pos.x -= (dx/d)*e.speed * 1.5;
        e.pos.y -= (dy/d)*e.speed * 1.5;
        return;
      }

      // Flanking: Try to approach from the side
      if (d > 200 && e.movement === 'CHASE' && Math.random() < 0.3) {
        const perpAngle = Math.atan2(dy, dx) + (Math.random() > 0.5 ? Math.PI/3 : -Math.PI/3);
        e.pos.x += Math.cos(perpAngle)*e.speed;
        e.pos.y += Math.sin(perpAngle)*e.speed;
        return;
      }

      // Pack behavior: Wolves and swarm move together - use spatial hash
      if ((e.type === 'WOLF' || e.type === 'SWARM') && this.frameCount % 5 === 0) {
        let packCenterX = 0, packCenterY = 0, packCount = 0;
        const nearby = this.enemySpatialHash.getNearby(e.pos.x, e.pos.y, 300);
        for (const other of nearby) {
          if (other.type === e.type && other.id !== e.id) {
            packCenterX += other.pos.x; packCenterY += other.pos.y; packCount++;
          }
        }
        if (packCount > 0) {
          packCenterX /= packCount; packCenterY /= packCount;
          const toPackX = packCenterX - e.pos.x, toPackY = packCenterY - e.pos.y;
          const toPackD = Math.sqrt(toPackX*toPackX + toPackY*toPackY);
          if (toPackD > 50) {
            e.pos.x += (toPackX/toPackD) * e.speed * 0.3;
            e.pos.y += (toPackY/toPackD) * e.speed * 0.3;
          }
        }
      }

      // Alert propagation: Alerted enemies alert nearby passive ones - use spatial hash
      if (e.isAggressive && this.frameCount % 30 === 0) {
        const nearby = this.enemySpatialHash.getNearby(e.pos.x, e.pos.y, 400);
        for (const other of nearby) {
          if (!other.isAggressive) other.isAggressive = true;
        }
      }

      e.pos.x += (dx/d)*e.speed; e.pos.y += (dy/d)*e.speed;
    });

    this.enemies = this.enemies.filter(e => {
      if (e.hp <= 0) {
        const meta = this.enemyMeta.get(e.id);
        this.handleEnemyKilled(e, meta);
        this.enemyMeta.delete(e.id);
        return false;
      }
      return true;
    });
  }

  private updateBossBehavior(e: Enemy) {
      const target = this.getNearestPlayer(e.pos);
      if (!target) return;
      const dx = target.x - e.pos.x, dy = target.y - e.pos.y, d = Math.sqrt(dx*dx+dy*dy);
      e.pos.x += (dx/d)*e.speed; e.pos.y += (dy/d)*e.speed;
      e.cooldown--;
      if (e.cooldown <= 0) {
          const ang = Math.atan2(dy, dx);
          if (Math.random() < 0.6) {
              for (let i = -8; i <= 8; i++) {
                  const bAng = ang + i * 0.14;
                  this.bullets.push({ id: this.nextId++, playerId: -2, pos: {...e.pos}, vel: {x: Math.cos(bAng)*5, y: Math.sin(bAng)*5}, damage: 30, element: ElementType.FIRE, radius: 14, life: 110, pierce: 1 });
              }
          }
          e.cooldown = 130;
      }
  }

  private updateDragonBoss(e: Enemy) {
    const target = this.getNearestPlayer(e.pos);
    if (!target) return;
    const dx = target.x - e.pos.x, dy = target.y - e.pos.y, d = Math.sqrt(dx*dx+dy*dy);
    e.angle = Math.atan2(dy, dx);
    e.pos.x += (dx/d)*e.speed; e.pos.y += (dy/d)*e.speed;

    if (!e.fireBreathCooldown) e.fireBreathCooldown = 0;
    if (!e.swipeCooldown) e.swipeCooldown = 0;
    if (!e.telegraphCooldown) e.telegraphCooldown = 0;

    e.fireBreathCooldown--;
    e.swipeCooldown--;
    e.telegraphCooldown--;

    // Swipe attacks - multiple slashes around the dragon
    if (e.swipeCooldown <= 0 && d < 250) {
      for (let i = 0; i < 6; i++) {
        const swipeAng = e.angle + (i * Math.PI / 3);
        this.slashEffects.push({
          id: this.nextId++,
          pos: { x: e.pos.x + Math.cos(swipeAng) * 60, y: e.pos.y + Math.sin(swipeAng) * 60 },
          angle: swipeAng + Math.PI/2,
          life: 20,
          maxLife: 20,
          range: 120,
          color: '#ff4400',
          width: 8
        });
      }
      // Damage players in range
      this.playerPositions.forEach((pp, i) => {
        if (this.distSq(e.pos, pp) < 180*180) {
          const dealt = this.applyDamageToPlayer(i, 40, { element: ElementType.PHYSICAL, attacker: e });
          if (dealt > 0) this.addDamageNumber(pp, dealt, false);
        }
      });
      e.swipeCooldown = 60;
    }

    // Fire telegraphs - flashing circles that explode
    if (e.telegraphCooldown <= 0) {
      for (let i = 0; i < 5; i++) {
        const telAng = Math.random() * Math.PI * 2;
        const telDist = 150 + Math.random() * 350;
        this.fireTelegraphs.push({
          id: this.nextId++,
          pos: { x: e.pos.x + Math.cos(telAng) * telDist, y: e.pos.y + Math.sin(telAng) * telDist },
          radius: 70 + Math.random() * 40,
          life: 90,
          maxLife: 90,
          flashRate: 8,
          damage: 45
        });
      }
      e.telegraphCooldown = 120;
    }

    // Fire breath
    if (e.fireBreathCooldown <= 0 && d < 600) {
      const ang = e.angle;
      for (let i = 0; i < 10; i++) {
        const spread = (Math.random() - 0.5) * 0.5;
        const dist = 100 + i * 45;
        const fPos = { x: e.pos.x + Math.cos(ang + spread) * dist, y: e.pos.y + Math.sin(ang + spread) * dist };
        this.fireAreas.push({ id: this.nextId++, pos: fPos, radius: 50, life: 150, maxLife: 150, damage: 30, color: '#ff4400', element: ElementType.FIRE });
      }
      this.createExplosion(e.pos, '#ff6600', 20, 4, 8);
      e.fireBreathCooldown = 180;
    }

    // Bullet spray
    e.cooldown--;
    if (e.cooldown <= 0) {
      for (let i = -4; i <= 4; i++) {
        const bAng = e.angle + i * 0.2;
        this.bullets.push({ id: this.nextId++, playerId: -2, pos: {...e.pos}, vel: {x: Math.cos(bAng)*5.5, y: Math.sin(bAng)*5.5}, damage: 35, element: ElementType.FIRE, radius: 14, life: 90, pierce: 1 });
      }
      e.cooldown = 100;
    }
  }

  private createSlash(pos: Vec2, angle: number, range: number, color: string) {
    this.slashEffects.push({
      id: this.nextId++,
      pos: { ...pos },
      angle,
      life: 15,
      maxLife: 15,
      range,
      color,
      width: 6
    });
  }

  private updateSpecialEnemy(e: Enemy) {
    const target = this.getNearestPlayer(e.pos);

    switch (e.type) {
      case 'SHOOTER': {
        if (!target) break;
        const d = Math.sqrt(this.distSq(e.pos, target));
        e.cooldown--;
        if (e.cooldown <= 0 && d < 500) {
          const ang = Math.atan2(target.y - e.pos.y, target.x - e.pos.x);
          this.bullets.push({ id: this.nextId++, playerId: -2, pos: {...e.pos}, vel: {x: Math.cos(ang)*4.5, y: Math.sin(ang)*4.5}, damage: 15, element: ElementType.PHYSICAL, radius: 8, life: 80, pierce: 1 });
          e.cooldown = 60;
        }
        if (d < 200) { e.pos.x -= (target.x - e.pos.x) / d * e.speed; e.pos.y -= (target.y - e.pos.y) / d * e.speed; }
        break;
      }

      case 'GUARD':
      case 'SENTRY': {
        if (!target) break;
        const d = Math.sqrt(this.distSq(e.pos, target));
        e.cooldown--;
        if (e.cooldown <= 0 && d < 450) {
          const ang = Math.atan2(target.y - e.pos.y, target.x - e.pos.x);
          this.bullets.push({ id: this.nextId++, playerId: -2, pos: {...e.pos}, vel: {x: Math.cos(ang)*4, y: Math.sin(ang)*4}, damage: 20, element: ElementType.PHYSICAL, radius: 10, life: 70, pierce: 1 });
          e.cooldown = 90;
        }
        break;
      }

      case 'STALKER': {
        if (!target) break;
        e.cooldown--;
        if (e.cooldown <= 0) {
          const ang = Math.atan2(target.y - e.pos.y, target.x - e.pos.x);
          for (let i = -1; i <= 1; i++) {
            this.bullets.push({ id: this.nextId++, playerId: -2, pos: {...e.pos}, vel: {x: Math.cos(ang + i*0.15)*5.5, y: Math.sin(ang + i*0.15)*5.5}, damage: 12, element: ElementType.PHYSICAL, radius: 7, life: 60, pierce: 1 });
          }
          e.cooldown = 50;
        }
        break;
      }

      case 'DRAGON_ENEMY': {
        if (!target) break;
        const d = Math.sqrt(this.distSq(e.pos, target));
        e.cooldown--;
        if (e.cooldown <= 0 && d < 600) {
          const ang = Math.atan2(target.y - e.pos.y, target.x - e.pos.x);
          for (let i = 0; i < 5; i++) {
            const fPos = { x: e.pos.x + Math.cos(ang) * (80 + i * 40), y: e.pos.y + Math.sin(ang) * (80 + i * 40) };
            this.fireAreas.push({ id: this.nextId++, pos: fPos, radius: 40, life: 120, maxLife: 120, damage: 20, color: '#ff4400', element: ElementType.FIRE });
          }
          e.cooldown = 120;
        }
        break;
      }

      case 'HARPY': {
        if (!target) break;
        e.cooldown--;
        if (e.cooldown <= 0) {
          const ang = Math.atan2(target.y - e.pos.y, target.x - e.pos.x);
          this.bullets.push({ id: this.nextId++, playerId: -2, pos: {...e.pos}, vel: {x: Math.cos(ang)*6, y: Math.sin(ang)*6}, damage: 10, element: ElementType.PHYSICAL, radius: 6, life: 50, pierce: 1 });
          e.cooldown = 40;
        }
        break;
      }

      case 'SERPENT': {
        if (!target) break;
        e.cooldown--;
        if (e.cooldown <= 0) {
          const ang = Math.atan2(target.y - e.pos.y, target.x - e.pos.x);
          this.bullets.push({ id: this.nextId++, playerId: -2, pos: {...e.pos}, vel: {x: Math.cos(ang)*4.5, y: Math.sin(ang)*4.5}, damage: 8, element: ElementType.POISON, radius: 10, life: 90, pierce: 1 });
          e.cooldown = 70;
        }
        break;
      }

      case 'ELITE': {
        if (!target) break;
        e.cooldown--;
        if (e.cooldown <= 0) {
          const ang = Math.atan2(target.y - e.pos.y, target.x - e.pos.x);
          for (let i = -2; i <= 2; i++) {
            this.bullets.push({ id: this.nextId++, playerId: -2, pos: {...e.pos}, vel: {x: Math.cos(ang + i*0.2)*5, y: Math.sin(ang + i*0.2)*5}, damage: 18, element: ElementType.MAGIC, radius: 10, life: 80, pierce: 1 });
          }
          e.cooldown = 80;
        }
        break;
      }

      case 'GHOST': {
        if (!target) break;
        e.cooldown--;
        if (e.cooldown <= 0) {
          const ang = Math.atan2(target.y - e.pos.y, target.x - e.pos.x);
          this.bullets.push({ id: this.nextId++, playerId: -2, pos: {...e.pos}, vel: {x: Math.cos(ang)*4, y: Math.sin(ang)*4}, damage: 15, element: ElementType.MAGIC, radius: 12, life: 100, pierce: 2 });
          e.cooldown = 100;
        }
        break;
      }

      case 'CHARGER': {
        if (!e.chargeState) e.chargeState = 'idle';
        if (!e.chargeTimer) e.chargeTimer = 0;
        e.chargeTimer--;

        if (e.chargeState === 'idle' && target) {
          const d = Math.sqrt(this.distSq(e.pos, target));
          if (d < 400 && d > 100) {
            e.chargeState = 'windup';
            e.chargeTimer = 60;
            this.createExplosion(e.pos, '#ff4444', 8, 1, 3);
          }
        } else if (e.chargeState === 'windup' && e.chargeTimer <= 0) {
          e.chargeState = 'charging';
          e.chargeTimer = 30;
          if (target) {
            const dx = target.x - e.pos.x, dy = target.y - e.pos.y;
            const d = Math.sqrt(dx*dx + dy*dy);
            e.chargeDir = { x: dx/d, y: dy/d };
          }
        } else if (e.chargeState === 'charging') {
          if (e.chargeDir) {
            e.pos.x += e.chargeDir.x * 12;
            e.pos.y += e.chargeDir.y * 12;
          }
          if (e.chargeTimer <= 0) {
            e.chargeState = 'idle';
            e.chargeTimer = 120;
          }
        }
        break;
      }

      case 'SPINNER': {
        if (!e.spinAngle) e.spinAngle = 0;
        e.spinAngle += 0.08;
        e.cooldown--;
        if (e.cooldown <= 0) {
          for (let i = 0; i < 4; i++) {
            const ang = e.spinAngle + (i * Math.PI / 2);
            this.bullets.push({
              id: this.nextId++, playerId: -2, pos: {...e.pos},
              vel: { x: Math.cos(ang) * 3, y: Math.sin(ang) * 3 },
              damage: 12, element: ElementType.FIRE, radius: 8, life: 80, pierce: 1
            });
          }
          e.cooldown = 12;
        }
        break;
      }

      case 'PHASER': {
        if (!e.phaseTimer) e.phaseTimer = 180;
        e.phaseTimer--;
        if (e.phaseTimer <= 0 && target) {
          const ang = Math.random() * Math.PI * 2;
          const dist = 100 + Math.random() * 150;
          e.pos.x = target.x + Math.cos(ang) * dist;
          e.pos.y = target.y + Math.sin(ang) * dist;
          e.phaseTimer = 180;
          this.createExplosion(e.pos, '#cc66ff', 15, 3, 5);
        }
        break;
      }

      case 'HEALER': {
        if (this.frameCount % 60 === 0) {
          const nearby = this.enemySpatialHash.getNearby(e.pos.x, e.pos.y, 180);
          for (const other of nearby) {
            if (other.id !== e.id) {
              other.hp = Math.min(other.maxHp, other.hp + 8);
              this.createExplosion(other.pos, '#66ff99', 3, 1, 2);
            }
          }
        }
        break;
      }

      case 'SHIELDER': {
        const nearby = this.enemySpatialHash.getNearby(e.pos.x, e.pos.y, 150);
        for (const other of nearby) {
          if (other.id !== e.id) other.shieldActive = true;
        }
        break;
      }

      case 'SWARM_QUEEN': {
        if (!e.spawnTimer) e.spawnTimer = 240;
        e.spawnTimer--;
        if (e.spawnTimer <= 0) {
          for (let i = 0; i < 3; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spawnPos = { x: e.pos.x + Math.cos(ang) * 50, y: e.pos.y + Math.sin(ang) * 50 };
            const cfg = ENEMY_TYPES.SWARM;
            this.enemies.push({
              id: this.nextId++, pos: spawnPos,
              hp: cfg.hp * 0.6, maxHp: cfg.hp * 0.6,
              speed: cfg.speed * 1.2, radius: cfg.radius * 0.8, damage: cfg.damage,
              type: 'SWARM', movement: 'CHASE', cooldown: 0,
              knockbackVel: { x: 0, y: 0 }, slowTimer: 0, burnTimer: 0, poisonTimer: 0,
              isAggressive: true, angle: ang, visionCone: 0, visionRange: 0
            });
          }
          e.spawnTimer = 240;
          this.createExplosion(e.pos, '#ff3366', 10, 2, 4);
        }
        break;
      }

      case 'NECRO': {
        // Necro behavior handled in death filter
        break;
      }

      case 'MAGE': {
        if (!target) break;
        const d = Math.sqrt(this.distSq(e.pos, target));
        e.cooldown--;

        // Cast spells at players
        if (e.cooldown <= 0 && d < 450) {
          const ang = Math.atan2(target.y - e.pos.y, target.x - e.pos.x);
          const spellType = Math.random();

          if (spellType < 0.4) {
            // Magic bolt barrage
            for (let i = -1; i <= 1; i++) {
              this.bullets.push({
                id: this.nextId++, playerId: -2, pos: { ...e.pos },
                vel: { x: Math.cos(ang + i * 0.2) * 4, y: Math.sin(ang + i * 0.2) * 4 },
                damage: e.damage, element: ElementType.MAGIC, radius: 10, life: 70, pierce: 1
              });
            }
          } else if (spellType < 0.7) {
            // Fire area attack
            const targetPos = { x: target.x + (Math.random() - 0.5) * 60, y: target.y + (Math.random() - 0.5) * 60 };
            this.fireAreas.push({
              id: this.nextId++, pos: targetPos, radius: 60,
              life: 90, maxLife: 90, damage: 20, color: '#cc33ff', element: ElementType.MAGIC
            });
            this.createExplosion(targetPos, '#cc33ff', 15, 3, 5);
          } else {
            // Lightning-style fast bolt
            this.bullets.push({
              id: this.nextId++, playerId: -2, pos: { ...e.pos },
              vel: { x: Math.cos(ang) * 7, y: Math.sin(ang) * 7 },
              damage: e.damage * 1.5, element: ElementType.LIGHTNING, radius: 8, life: 50, pierce: 2
            });
          }

          this.createExplosion(e.pos, '#cc33ff', 8, 2, 4);
          e.cooldown = 120;
        }

        // Keep distance but stay in range
        if (d < 200) {
          e.pos.x -= (target.x - e.pos.x) / d * e.speed * 1.2;
          e.pos.y -= (target.y - e.pos.y) / d * e.speed * 1.2;
        } else if (d > 350) {
          e.pos.x += (target.x - e.pos.x) / d * e.speed * 0.8;
          e.pos.y += (target.y - e.pos.y) / d * e.speed * 0.8;
        }
        break;
      }
    }
  }

  private updateAttacks() {
    this.bullets.forEach(b => {
      b.pos.x += b.vel.x; b.pos.y += b.vel.y; b.life--;
      // Player bullets hit enemies - use spatial hash
      if (b.playerId >= 0) {
        const nearby = this.enemySpatialHash.getNearby(b.pos.x, b.pos.y, b.radius + 80);
        for (const e of nearby) {
          if (b.life <= 0) break;
          if (this.distSq(b.pos, e.pos) < (b.radius + e.radius)**2) {
            const isAir = this.players[b.playerId]?.z > 0;
            this.dealDamageToEnemy(e, b.damage, { playerId: b.playerId, element: b.element, isSpell: false, isMelee: false, isAirborne: isAir });
            b.life = 0;
          }
        }
      } else if (b.playerId === -1 || b.playerId === -3) {
        const nearby = this.enemySpatialHash.getNearby(b.pos.x, b.pos.y, b.radius + 80);
        for (const e of nearby) {
          if (b.life <= 0) break;
          if (this.distSq(b.pos, e.pos) < (b.radius + e.radius)**2) {
            e.hp -= b.damage; e.isAggressive = true;
            this.addDamageNumber(e.pos, b.damage, false);
            b.life = 0;
          }
        }
      }
      // Enemy bullets hit players and allies
      if (b.playerId === -2) {
        let blockedByBarrier = false;
        for (const barrier of this.mimeBarriers) {
          if (this.distSq(b.pos, barrier.pos) < (b.radius + barrier.radius) ** 2) {
            blockedByBarrier = true;
            b.life = 0;
            this.createExplosion(b.pos, '#cccccc', 6, 2, 3);
            break;
          }
        }
        if (blockedByBarrier) return;
        this.playerPositions.forEach((pp, i) => {
          if (!this.players[i].isDead && this.distSq(b.pos, pp) < (b.radius + PLAYER_RADIUS)**2) {
            const dealt = this.applyDamageToPlayer(i, b.damage, { element: b.element });
            if (dealt > 0) this.addDamageNumber(pp, dealt, false);
            b.life = 0;
          }
        });
        if (!this.friendlyEntitiesInvulnerable) {
          this.allies.forEach(a => {
            if (this.distSq(b.pos, a.pos) < (b.radius + 15)**2) {
              a.hp -= b.damage;
              this.addDamageNumber(a.pos, b.damage, false);
              b.life = 0;
            }
          });
        }
      }
    });
    this.bullets = this.bullets.filter(b => b.life > 0);

    // Melee enemy contact damage with slash effects
    const meleeTypes = ['SWARM', 'TANK', 'STALKER', 'WOLF', 'CHARGER', 'SERPENT'];
    this.enemies.forEach(e => {
      if (!e.isAggressive || !meleeTypes.includes(e.type)) return;
      this.playerPositions.forEach((pp, i) => {
        if (this.players[i].isDead) return;
        const d = Math.sqrt(this.distSq(e.pos, pp));
        if (d < e.radius + PLAYER_RADIUS + 10) {
          if (e.cooldown <= 0 || e.type === 'CHARGER') {
            const dealt = this.applyDamageToPlayer(i, e.damage, { element: ElementType.PHYSICAL, attacker: e });
            if (dealt > 0) this.addDamageNumber(pp, dealt, false);
            // Slash effect
            const slashAng = Math.atan2(pp.y - e.pos.y, pp.x - e.pos.x);
            this.createSlash(
              { x: (e.pos.x + pp.x) / 2, y: (e.pos.y + pp.y) / 2 },
              slashAng + (Math.random() - 0.5) * 0.5,
              40 + e.radius,
              e.type === 'WOLF' ? '#664422' : e.type === 'CHARGER' ? '#cc4444' : '#ff6644'
            );
            if (e.type !== 'CHARGER') e.cooldown = 30;
          }
        }
      });
    });
  }

  private updateSlashEffects() {
    this.slashEffects.forEach(s => s.life--);
    this.slashEffects = this.slashEffects.filter(s => s.life > 0);
  }

  private updateFireTelegraphs() {
    this.fireTelegraphs.forEach(ft => {
      ft.life--;
      if (ft.life <= 0) {
        // Explode into fire area
        this.fireAreas.push({
          id: this.nextId++,
          pos: { ...ft.pos },
          radius: ft.radius,
          life: 60,
          maxLife: 60,
          damage: ft.damage,
          color: '#ff4400',
          element: ElementType.FIRE
        });
        this.createExplosion(ft.pos, '#ff6600', 20, 4, 8);
        // Damage players in blast
        this.playerPositions.forEach((pp, i) => {
          if (this.distSq(ft.pos, pp) < ft.radius * ft.radius) {
            const dealt = this.applyDamageToPlayer(i, ft.damage, { element: ElementType.FIRE });
            if (dealt > 0) this.addDamageNumber(pp, dealt, false);
          }
        });
      }
    });
    this.fireTelegraphs = this.fireTelegraphs.filter(ft => ft.life > 0);
  }

  private spawnCoin(pos: Vec2, killerId?: number) {
      const hasMerchantLuck = killerId !== undefined && this.hasPassive(killerId, 'merchant_luck');
      const value = hasMerchantLuck ? 38 : 25;
      const count = hasMerchantLuck ? 6 : 4;
      for (let i = 0; i < count; i++) {
          const a = Math.random()*Math.PI*2, s = 2+Math.random()*5;
          this.coins.push({ id: this.nextId++, pos: {...pos}, vel: {x: Math.cos(a)*s, y: Math.sin(a)*s}, value, life: 600 });
      }
  }

  private shoot(pIdx: number, angle: number, element: ElementType, type: PlayerStats['weaponType']) {
    const p = this.players[pIdx], pos = {...this.playerPositions[pIdx]};
    this.bullets.push({ id: this.nextId++, playerId: pIdx, pos, vel: {x: Math.cos(angle)*20, y: Math.sin(angle)*20}, damage: p.damage, element, radius: 9, life: 100, pierce: 1 });
  }

  private spawnEnemy(pos: Vec2) {
    // Wave-based enemy selection with tactical enemies
    const earlyTypes: (keyof typeof ENEMY_TYPES)[] = ['SWARM', 'SHOOTER', 'BOMBER'];
    const midTypes: (keyof typeof ENEMY_TYPES)[] = ['SWARM', 'SHOOTER', 'TANK', 'STALKER', 'BOMBER', 'SPLITTER', 'CHARGER'];
    const lateTypes: (keyof typeof ENEMY_TYPES)[] = ['TANK', 'ELITE', 'GHOST', 'SPLITTER', 'CHARGER', 'SPINNER', 'HEALER', 'PHASER'];
    const endgameTypes: (keyof typeof ENEMY_TYPES)[] = ['ELITE', 'SPINNER', 'NECRO', 'SWARM_QUEEN', 'SHIELDER', 'PHASER', 'MIRROR'];

    let types: (keyof typeof ENEMY_TYPES)[];
    if (this.wave <= 3) types = earlyTypes;
    else if (this.wave <= 7) types = midTypes;
    else if (this.wave <= 12) types = lateTypes;
    else types = endgameTypes;

    const t = types[Math.floor(Math.random() * types.length)];
    const config = ENEMY_TYPES[t];

    // Scale stats with wave for progressive difficulty
    const waveScale = 1 + (this.wave - 1) * 0.12;
    const hpMult = waveScale * (0.9 + Math.random() * 0.2);
    const dmgMult = 1 + (this.wave - 1) * 0.08;

    this.enemies.push({
      id: this.nextId++,
      pos: { ...pos },
      hp: Math.floor(config.hp * hpMult),
      maxHp: Math.floor(config.hp * hpMult),
      speed: config.speed * (1 + this.wave * 0.02),
      radius: config.radius,
      damage: Math.floor(config.damage * dmgMult),
      type: t,
      movement: config.movement as any,
      cooldown: 0,
      knockbackVel: { x: 0, y: 0 },
      slowTimer: 0,
      burnTimer: 0,
      poisonTimer: 0,
      isAggressive: true,
      angle: Math.random() * Math.PI * 2,
      visionCone: config.visionCone,
      visionRange: config.visionRange
    });
    this.enemiesSpawned++;
  }

  private createExplosion(pos: Vec2, color: string, count: number, force: number, maxSize: number) {
    for (let i = 0; i < count; i++) {
        const ang = Math.random()*Math.PI*2, spd = (1+Math.random()*4.5)*force;
        this.particles.push({ pos: {...pos}, vel: {x: Math.cos(ang)*spd, y: Math.sin(ang)*spd}, life: 35, maxLife: 35, color, size: 1+Math.random()*maxSize });
    }
  }

  private addDamageNumber(pos: Vec2, val: number, isCrit: boolean, text?: string) {
    this.damageNumbers.push({ id: this.nextId++, pos: {...pos}, value: Math.floor(val), color: isCrit ? '#ffcc00' : '#fff', life: 45, maxLife: 45, isCrit, text });
  }

  private addLevelUpText(pos: Vec2, level: number) {
    this.damageNumbers.push({
      id: this.nextId++,
      pos: { x: pos.x, y: pos.y - 30 },
      value: level,
      color: '#00ff44',
      life: 90,
      maxLife: 90,
      isCrit: true,
      text: 'LEVEL UP!',
      fontSize: 20
    });
  }

  private processLevelUp(p: PlayerStats, pIdx: number) {
    const xpNeeded = getXpForLevel(p.level);
    if (p.xp >= xpNeeded) {
      p.xp -= xpNeeded;
      p.level++;
      p.statPoints += STAT_POINTS_PER_LEVEL;
      p.hp = p.maxHp;
      p.magic = p.maxMagic;
      this.addLevelUpText(this.playerPositions[pIdx], p.level);
      this.createExplosion(this.playerPositions[pIdx], '#00ff44', 30, 5, 8);
    }
  }

  public allocateStat(playerIdx: number, stat: 'hp' | 'damage' | 'magic' | 'speed'): boolean {
    const p = this.players[playerIdx];
    if (!p) return false;
    const statInfo = STAT_POINT_VALUES[stat];
    if (p.statPoints < statInfo.cost) return false;
    p.statPoints -= statInfo.cost;
    switch (stat) {
      case 'hp': p.maxHp += statInfo.gain; p.hp += statInfo.gain; break;
      case 'damage': p.damage += statInfo.gain; break;
      case 'magic': p.maxMagic += statInfo.gain; p.magic += statInfo.gain; break;
      case 'speed': p.speed += statInfo.gain; break;
    }
    return true;
  }

  private getValidEnemySpawn(): Vec2 | null {
    const spawnPos = { x: this.camera.x + (Math.random()>0.5 ? -250 : window.innerWidth+250), y: this.camera.y + Math.random()*window.innerHeight };
    const b = this.world.getBiomeAt(spawnPos.x, spawnPos.y);
    if (b === 'SEA' || b === 'MOUNTAIN' || b === 'TOWN') return null;
    return spawnPos;
  }

  private getNearestEnemy(pos: Vec2, range: number): Enemy | null {
    return this.enemySpatialHash.getNearest(pos.x, pos.y, range);
  }

  private getNearestPlayer(pos: Vec2): Vec2 | null {
    let best = null, minDist = Infinity;
    this.playerPositions.forEach((p, i) => { if (!this.players[i].isDead) { const d = this.distSq(pos, p); if (d < minDist) { minDist = d; best = p; } } });
    return best;
  }

  private normalizeVec(vec: Vec2): Vec2 {
    const d = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
    if (!d || d < 0.0001) return { x: 0, y: 0 };
    return { x: vec.x / d, y: vec.y / d };
  }

  private getEnemyThreat(pos: Vec2, radius: number): { count: number; vec: Vec2 } {
    const nearby = this.enemySpatialHash.getNearby(pos.x, pos.y, radius);
    let vx = 0, vy = 0, count = 0;
    for (const e of nearby) {
      if (!e.isAggressive) continue;
      const dx = pos.x - e.pos.x;
      const dy = pos.y - e.pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const weight = 1 / Math.max(1, dist * 0.5);
      vx += (dx / dist) * weight;
      vy += (dy / dist) * weight;
      count++;
    }
    return { count, vec: this.normalizeVec({ x: vx, y: vy }) };
  }

  private chooseSafeDirection(pos: Vec2, desiredDir: Vec2, radius: number): Vec2 {
    const base = this.normalizeVec(desiredDir);
    if (base.x === 0 && base.y === 0) return base;
    const baseAng = Math.atan2(base.y, base.x);
    let bestDir = base;
    let bestScore = Infinity;
    const offsets = [-0.6, -0.3, 0, 0.3, 0.6];
    for (const offset of offsets) {
      const ang = baseAng + offset;
      const dir = { x: Math.cos(ang), y: Math.sin(ang) };
      const testPos = { x: pos.x + dir.x * 90, y: pos.y + dir.y * 90 };
      const nearby = this.enemySpatialHash.getNearby(testPos.x, testPos.y, radius);
      let danger = 0;
      for (const e of nearby) {
        if (e.isAggressive) danger++;
      }
      const score = danger + Math.abs(offset) * 0.4;
      if (score < bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }
    return bestDir;
  }

  private distSq(v1: Vec2, v2: Vec2) { return (v1.x-v2.x)**2 + (v1.y-v2.y)**2; }

  private isInSimRange(pos: Vec2, margin: number = 600): boolean {
    return pos.x >= this.camera.x - margin &&
           pos.x <= this.camera.x + window.innerWidth + margin &&
           pos.y >= this.camera.y - margin &&
           pos.y <= this.camera.y + window.innerHeight + margin;
  }

  public buyItem(playerIdx: number, itemId: string, price: number) {
      if (this.money < price) return;
      const p = this.players[playerIdx], item = SHOP_ITEMS.find(i => i.id === itemId);
      if (!item) return;
      // Utility items can be rebought (consumables, builds)
      if (itemId === 'upgrade_town') { this.money -= price; this.town.level++; this.town.goldGeneration += 60; return; }
      if (itemId === 'build_wall') { this.money -= price; this.buildMode = 'WALL_STRAIGHT'; this.state = GameState.PLAYING; return; }
      if (itemId === 'build_corner') { this.money -= price; this.buildMode = 'WALL_CORNER'; this.state = GameState.PLAYING; return; }
      if (itemId === 'build_gate') { this.money -= price; this.buildMode = 'WALL_GATE'; this.state = GameState.PLAYING; return; }
      if (itemId === 'build_tower') { this.money -= price; this.buildMode = 'TOWER'; this.state = GameState.PLAYING; return; }
      if (item.category === 'UTILITY') { this.money -= price; return; }
      const slotMap = { WEAPON: p.weaponSlots, ARMOR: p.armorSlots, MAGIC: p.magicSlots, SPELL: p.magicSlots };
      const slots = slotMap[item.category as keyof typeof slotMap];
      if (!slots) return;
      if (slots.includes(itemId)) return; // No duplicates
      if (slots.length >= MAX_SLOTS) return;
      this.money -= price;
      slots.push(itemId);
      if (item.mods.dmg) p.damage += item.mods.dmg;
      if (item.mods.hp) { p.maxHp += item.mods.hp; p.hp += item.mods.hp; }
      if (item.mods.spd) p.speed += item.mods.spd;
      if (item.mods.mag) p.maxMagic += item.mods.mag;
      if (item.mods.proj) p.projectileCount += item.mods.proj;
  }

  public exitShop() { this.state = GameState.PLAYING; }
  public pause() { if (this.state === GameState.PLAYING) this.state = GameState.PAUSED; }
  public resume() { if (this.state === GameState.PAUSED) this.state = GameState.PLAYING; }
  public applyUpgrade(id: string) { this.startWave(this.wave+1); this.state = GameState.PLAYING; }

  public equipSpell(playerIdx: number, spellId: string, slotIdx: number) {
    if (slotIdx < 0 || slotIdx > 3) return;
    const p = this.players[playerIdx];
    if (!p) return;

    // Check if player owns this spell (either free starter or purchased)
    const item = SHOP_ITEMS.find(i => i.id === spellId);
    if (!item || item.category !== 'SPELL') return;

    // Free starter spells or spells in magicSlots
    const isStarter = item.price === 0;
    const isOwned = p.magicSlots.includes(spellId);

    if (!isStarter && !isOwned) return;

    p.equippedSpells[slotIdx] = spellId;
  }

  public getOwnedSpells(playerIdx: number): string[] {
    const p = this.players[playerIdx];
    if (!p) return [];

    // Get all free spells plus owned ones
    const freeSpells = SHOP_ITEMS
      .filter(i => i.category === 'SPELL' && i.price === 0)
      .map(i => i.id);

    return [...freeSpells, ...p.magicSlots.filter(s => s.startsWith('spell_'))];
  }

  public placeBuilding(worldX: number, worldY: number): boolean {
    if (!this.buildMode) return false;
    const gridX = Math.round(worldX / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
    const gridY = Math.round(worldY / BUILD_GRID_SIZE) * BUILD_GRID_SIZE;
    const pos = { x: gridX, y: gridY };
    if (this.getWallAt(pos, 10) || this.getTowerAt(pos, 10)) return false;
    const biome = this.world.getBiomeAt(pos.x, pos.y);
    if (biome === 'SEA' || biome === 'MOUNTAIN') return false;
    const builtMode = this.buildMode;
    if (builtMode === 'TOWER') {
      const cfg = WALL_CONFIGS.TOWER;
      this.towers.push({ id: this.nextId++, pos, hp: cfg.hp, maxHp: cfg.hp, height: WALL_HEIGHT,
        range: cfg.range, damage: cfg.damage, cooldown: 0, maxCooldown: cfg.cooldown, level: 1 });
    } else {
      const cfg = WALL_CONFIGS[builtMode];
      this.walls.push({ id: this.nextId++, pos, type: builtMode, hp: cfg.hp, maxHp: cfg.hp,
        height: WALL_HEIGHT, rotation: this.buildRotation, isOpen: false });
      this.handleChallengeProgress('build_walls', 1);
    }
    this.buildMode = null; this.buildRotation = 0;
    this.createExplosion(pos, '#8B4513', 15, 2, 4);
    return true;
  }

  public cancelBuild() {
    if (this.buildMode) {
      const costs: Record<WallPieceType, number> = { 'WALL_STRAIGHT': 100, 'WALL_CORNER': 120, 'WALL_GATE': 200, 'TOWER': 400 };
      this.money += costs[this.buildMode];
      this.buildMode = null; this.buildRotation = 0;
    }
  }

  public rotateBuild() { this.buildRotation = (this.buildRotation + 90) % 360; }

  public toggleGate(pos: Vec2) {
    const wall = this.getWallAt(pos, 20);
    if (wall && wall.type === 'WALL_GATE') wall.isOpen = !wall.isOpen;
  }

  private updateFactionCastles() {
    const cfg = FACTION_CASTLE_CONFIG;

    this.factionCastles.forEach(castle => {
      if (!this.isInSimRange(castle.pos, 1500)) return;

      castle.spawnCooldown--;

      // Red castles spawn enemy mage groups and occasionally trigger sieges
      if (castle.faction === Faction.RED && !castle.siegeActive) {
        // Spawn enemy mages periodically
        if (castle.spawnCooldown <= 0 && this.enemies.length < 150) {
          this.spawnMageGroup(castle.pos, Faction.RED, castle.level);
          castle.spawnCooldown = cfg.spawnInterval * (0.8 + Math.random() * 0.4);
        }

        // Random chance to start siege (enemy attacks player)
        if (this.wave >= 3 && Math.random() < 0.0003 * castle.level) {
          this.startSiege(castle, true);
        }
      }

      // Blue castles spawn ally units
      if (castle.faction === Faction.BLUE && !castle.siegeActive) {
        if (castle.spawnCooldown <= 0 && this.allies.length < 20) {
          this.spawnAllyFromCastle(castle);
          castle.spawnCooldown = cfg.spawnInterval * 1.5;
        }
      }

      // Handle active sieges
      if (castle.siegeActive) {
        this.updateSiege(castle);
      }

      // Check for player-initiated siege on red castles
      if (castle.faction === Faction.RED && !castle.siegeActive) {
        const playerNear = this.playerPositions.some((pp, i) =>
          !this.players[i].isDead && this.distSq(pp, castle.pos) < cfg.captureRadius * cfg.captureRadius
        );
        if (playerNear && this.frameCount % 300 === 0 && Math.random() < 0.3) {
          this.startSiege(castle, false);
        }
      }
    });
  }

  private startSiege(castle: FactionCastle, enemyAttacks: boolean) {
    const cfg = FACTION_CASTLE_CONFIG;
    castle.siegeActive = true;
    castle.siegeWave = 1;
    castle.siegeEnemiesRemaining = cfg.enemiesPerWave * castle.level;

    this.events.push({
      id: this.nextId++,
      type: 'SIEGE',
      startTime: 120,
      duration: 0,
      warningTime: 90,
      intensity: castle.level,
      pos: { ...castle.pos },
      active: true,
      announced: false,
      castleId: castle.id,
      waveNum: 1,
      totalWaves: cfg.siegeWaves,
      enemiesRemaining: castle.siegeEnemiesRemaining
    });

    this.announce('SIEGE!', enemyAttacks ? '#ff4444' : '#ffaa00', 3);
  }

  private updateSiege(castle: FactionCastle) {
    const cfg = FACTION_CASTLE_CONFIG;

    // Spawn siege enemies/defenders from castle
    if (castle.siegeEnemiesRemaining > 0 && this.frameCount % 45 === 0) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 100 + Math.random() * 150;
      const spawnPos = {
        x: castle.pos.x + Math.cos(ang) * dist,
        y: castle.pos.y + Math.sin(ang) * dist
      };

      if (castle.faction === Faction.RED) {
        this.spawnSiegeEnemy(spawnPos, castle.level);
      }
      castle.siegeEnemiesRemaining--;
    }

    // Check siege completion
    if (castle.siegeEnemiesRemaining <= 0) {
      const siegeEnemiesAlive = this.enemies.filter(e =>
        e.faction === castle.faction && this.distSq(e.pos, castle.pos) < 800 * 800
      ).length;

      if (siegeEnemiesAlive === 0) {
        if (castle.siegeWave < cfg.siegeWaves) {
          castle.siegeWave++;
          castle.siegeEnemiesRemaining = cfg.enemiesPerWave * castle.level;
          this.announce(`WAVE ${castle.siegeWave}/${cfg.siegeWaves}`, '#ffaa00', 2);
        } else {
          // Siege complete - capture castle
          castle.siegeActive = false;
          if (castle.faction === Faction.RED) {
            castle.faction = Faction.BLUE;
            castle.hp = castle.maxHp;
            this.announce('CASTLE CAPTURED!', '#4d99ff', 3);
            this.createExplosion(castle.pos, '#4d99ff', 50, 6, 10);
            // Spawn victory allies
            for (let i = 0; i < 3; i++) {
              this.spawnAllyFromCastle(castle);
            }
          }
        }
      }
    }
  }

  private spawnMageGroup(pos: Vec2, faction: Faction, level: number) {
    const groupSize = 2 + Math.floor(Math.random() * 3) + level;
    const colors = faction === Faction.RED
      ? ['#ff4444', '#dc143c', '#ff6347', '#b22222']
      : ['#4d99ff', '#00bfff', '#1e90ff', '#20b2aa'];

    for (let i = 0; i < groupSize; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 80 + Math.random() * 120;
      const spawnPos = { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist };
      const isMage = i === 0 || Math.random() < 0.3;
      const t = isMage ? 'MAGE' : (Math.random() < 0.5 ? 'SHOOTER' : 'STALKER');
      const config = ENEMY_TYPES[t];

      this.enemies.push({
        id: this.nextId++,
        pos: spawnPos,
        hp: Math.floor(config.hp * (1 + level * 0.2)),
        maxHp: Math.floor(config.hp * (1 + level * 0.2)),
        speed: config.speed,
        radius: config.radius,
        damage: Math.floor(config.damage * (1 + level * 0.15)),
        type: t as any,
        movement: config.movement as any,
        cooldown: 0,
        knockbackVel: { x: 0, y: 0 },
        slowTimer: 0,
        burnTimer: 0,
        poisonTimer: 0,
        isAggressive: true,
        angle: Math.random() * Math.PI * 2,
        visionCone: 0,
        visionRange: 0,
        faction
      });
    }
  }

  private spawnSiegeEnemy(pos: Vec2, level: number) {
    const types: (keyof typeof ENEMY_TYPES)[] = ['MAGE', 'SHOOTER', 'TANK', 'CHARGER', 'ELITE'];
    const t = types[Math.floor(Math.random() * types.length)];
    const config = ENEMY_TYPES[t];

    this.enemies.push({
      id: this.nextId++,
      pos: { ...pos },
      hp: Math.floor(config.hp * (1.2 + level * 0.3)),
      maxHp: Math.floor(config.hp * (1.2 + level * 0.3)),
      speed: config.speed * 1.1,
      radius: config.radius,
      damage: Math.floor(config.damage * (1.1 + level * 0.2)),
      type: t as any,
      movement: 'CHASE',
      cooldown: 0,
      knockbackVel: { x: 0, y: 0 },
      slowTimer: 0,
      burnTimer: 0,
      poisonTimer: 0,
      isAggressive: true,
      angle: Math.random() * Math.PI * 2,
      visionCone: 0,
      visionRange: 0,
      faction: Faction.RED
    });
  }

  private spawnAllyFromCastle(castle: FactionCastle) {
    const types: (keyof typeof ALLY_CONFIGS)[] = ['SOLDIER', 'ARCHER', 'MAGE', 'KNIGHT'];
    const t = types[Math.floor(Math.random() * types.length)];
    const config = ALLY_CONFIGS[t];

    const ang = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 100;
    const pos = {
      x: castle.pos.x + Math.cos(ang) * dist,
      y: castle.pos.y + Math.sin(ang) * dist
    };

    this.allies.push({
      id: this.nextId++,
      pos,
      hp: config.hp,
      maxHp: config.hp,
      speed: config.speed,
      damage: config.damage,
      type: t,
      cooldown: 0,
      targetId: null,
      followPlayerId: null,
      behavior: 'WANDER',
      angle: ang,
      color: config.color,
      source: 'CASTLE'
    });

    this.createExplosion(pos, config.color, 10, 2, 4);
  }

  private updateAllies() {
    this.allies.forEach(ally => {
      if (!this.isInSimRange(ally.pos, 800)) return;

      if (ally.speechTimer !== undefined) {
        ally.speechTimer--;
        if (ally.speechTimer <= 0) {
          ally.speechTimer = 0;
          ally.speech = undefined;
        }
      }

      if (ally.life !== undefined) ally.life--;
      ally.cooldown--;
      const cfg = ALLY_CONFIGS[ally.type];

      const threat = this.getEnemyThreat(ally.pos, 240);
      const dangerCount = threat.count;
      const lowHp = ally.hp / Math.max(1, ally.maxHp) < 0.4;
      const townDistSq = this.distSq(ally.pos, this.town.pos);
      const inTown = townDistSq < (TOWN_RADIUS * 0.6) ** 2;

      if (lowHp && !inTown) {
        ally.behavior = 'SEEK_TOWN';
        ally.targetId = null;
        ally.followPlayerId = null;
        if (!ally.nextSpeechFrame || this.frameCount >= ally.nextSpeechFrame) {
          ally.speech = 'I need to fight my way back to town!';
          ally.speechTimer = 180;
          ally.nextSpeechFrame = this.frameCount + 360;
        }
      } else if (lowHp && inTown) {
        ally.behavior = 'WANDER';
        if (this.frameCount % 30 === 0) ally.hp = Math.min(ally.maxHp, ally.hp + 2);
        if (!ally.nextSpeechFrame || this.frameCount >= ally.nextSpeechFrame) {
          ally.speech = 'Healing up!';
          ally.speechTimer = 120;
          ally.nextSpeechFrame = this.frameCount + 240;
        }
      } else if (dangerCount >= 5 && ally.type !== 'KNIGHT') {
        ally.behavior = 'RETREAT';
        ally.targetId = null;
        ally.followPlayerId = null;
        if (!ally.nextSpeechFrame || this.frameCount >= ally.nextSpeechFrame) {
          ally.speech = 'Too many of them!';
          ally.speechTimer = 120;
          ally.nextSpeechFrame = this.frameCount + 240;
        }
      }

      if (ally.source === 'GHOST' && ally.ownerId !== undefined && this.hasPassive(ally.ownerId, 'water_flow')) {
        this.enemies.forEach(e => {
          if (this.distSq(ally.pos, e.pos) < 80 * 80) {
            e.slowTimer = Math.max(e.slowTimer, 120);
          }
        });
      }

      // Find nearest player to potentially follow
      let nearestPlayer: { idx: number; dist: number; score: number } | null = null;
      this.playerPositions.forEach((pp, i) => {
        if (this.players[i].isDead) return;
        const d = Math.sqrt(this.distSq(ally.pos, pp));
        const hpRatio = this.players[i].hp / Math.max(1, this.players[i].maxHp);
        const score = d * (hpRatio < 0.4 ? 0.7 : 1);
        if (d < 400 && (!nearestPlayer || score < nearestPlayer.score)) {
          nearestPlayer = { idx: i, dist: d, score };
        }
      });

      // Decide behavior
      if (nearestPlayer && nearestPlayer.dist < 200) {
        if (ally.behavior !== 'SEEK_TOWN' && ally.behavior !== 'RETREAT') {
          ally.behavior = 'FOLLOW';
          ally.followPlayerId = nearestPlayer.idx;
        }
      } else if (ally.followPlayerId !== null) {
        const followPos = this.playerPositions[ally.followPlayerId];
        if (followPos && this.distSq(ally.pos, followPos) > 600 * 600) {
          ally.behavior = 'WANDER';
          ally.followPlayerId = null;
        }
      }

      // Find target enemy
      let targetEnemy: Enemy | null = null;
      let minEnemyDist = cfg.attackRange * cfg.attackRange;
      this.enemies.forEach(e => {
        if (!e.isAggressive) return;
        const d = this.distSq(ally.pos, e.pos);
        if (d < minEnemyDist) {
          minEnemyDist = d;
          targetEnemy = e;
        }
      });

      // Combat behavior
      if (targetEnemy && ally.behavior !== 'SEEK_TOWN' && ally.behavior !== 'RETREAT') {
        ally.behavior = 'ATTACK';
        ally.targetId = targetEnemy.id;
        const dx = targetEnemy.pos.x - ally.pos.x;
        const dy = targetEnemy.pos.y - ally.pos.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        ally.angle = Math.atan2(dy, dx);

        // Attack
        if (ally.cooldown <= 0 && d < cfg.attackRange) {
          if (ally.type === 'ARCHER' || ally.type === 'MAGE') {
            // Ranged attack
            this.bullets.push({
              id: this.nextId++,
              playerId: -3, // ally bullet
              pos: { ...ally.pos },
              vel: { x: Math.cos(ally.angle) * 12, y: Math.sin(ally.angle) * 12 },
              damage: ally.damage,
              element: ally.type === 'MAGE' ? ElementType.MAGIC : ElementType.PHYSICAL,
              radius: ally.type === 'MAGE' ? 10 : 6,
              life: 60,
              pierce: 1
            });
            this.createExplosion(ally.pos, ally.color, 5, 1, 3);
          } else {
            // Melee attack
            targetEnemy.hp -= ally.damage;
            this.addDamageNumber(targetEnemy.pos, ally.damage, false);
            this.createSlash(
              { x: (ally.pos.x + targetEnemy.pos.x) / 2, y: (ally.pos.y + targetEnemy.pos.y) / 2 },
              ally.angle, 30, ally.color
            );
          }
          ally.cooldown = cfg.attackCooldown;
        }

        // Move toward or away based on type
        if (ally.type === 'ARCHER' || ally.type === 'MAGE') {
          if (d < 150) {
            ally.pos.x -= (dx / d) * ally.speed;
            ally.pos.y -= (dy / d) * ally.speed;
          } else if (d > cfg.attackRange * 0.8) {
            ally.pos.x += (dx / d) * ally.speed;
            ally.pos.y += (dy / d) * ally.speed;
          }
        } else {
          ally.pos.x += (dx / d) * ally.speed;
          ally.pos.y += (dy / d) * ally.speed;
        }
      } else if (ally.behavior === 'SEEK_TOWN') {
        const toTown = { x: this.town.pos.x - ally.pos.x, y: this.town.pos.y - ally.pos.y };
        const baseDir = this.normalizeVec(toTown);
        const blended = this.normalizeVec({
          x: baseDir.x + threat.vec.x * Math.min(1.5, dangerCount * 0.4),
          y: baseDir.y + threat.vec.y * Math.min(1.5, dangerCount * 0.4),
        });
        const safeDir = this.chooseSafeDirection(ally.pos, blended, 160);
        ally.pos.x += safeDir.x * ally.speed * 1.2;
        ally.pos.y += safeDir.y * ally.speed * 1.2;
        ally.angle = Math.atan2(safeDir.y, safeDir.x);
      } else if (ally.behavior === 'RETREAT') {
        if (dangerCount > 0) {
          const retreatDir = this.chooseSafeDirection(ally.pos, threat.vec, 160);
          ally.pos.x += retreatDir.x * ally.speed * 1.3;
          ally.pos.y += retreatDir.y * ally.speed * 1.3;
          ally.angle = Math.atan2(retreatDir.y, retreatDir.x);
        } else {
          ally.behavior = 'WANDER';
        }
      } else if (ally.behavior === 'FOLLOW' && ally.followPlayerId !== null) {
        // Follow player
        const target = this.playerPositions[ally.followPlayerId];
        if (target) {
          const dx = target.x - ally.pos.x;
          const dy = target.y - ally.pos.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 80) {
            ally.pos.x += (dx / d) * ally.speed;
            ally.pos.y += (dy / d) * ally.speed;
            ally.angle = Math.atan2(dy, dx);
          }
        }
      } else {
        // Wander
        if (this.frameCount % 120 === 0) {
          ally.angle += (Math.random() - 0.5) * 1.5;
        }
        ally.pos.x += Math.cos(ally.angle) * ally.speed * 0.3;
        ally.pos.y += Math.sin(ally.angle) * ally.speed * 0.3;
      }

      // Clamp position
      ally.pos.x = Math.max(50, Math.min(WORLD_WIDTH - 50, ally.pos.x));
      ally.pos.y = Math.max(50, Math.min(WORLD_HEIGHT - 50, ally.pos.y));
    });

    // Handle ally damage from enemies and filter dead allies
    if (!this.friendlyEntitiesInvulnerable) {
      this.allies.forEach(ally => {
        this.enemies.forEach(e => {
          if (!e.isAggressive) return;
          if (this.distSq(ally.pos, e.pos) < (20 + e.radius) ** 2) {
            if (e.cooldown <= 0) {
              ally.hp -= e.damage;
              this.addDamageNumber(ally.pos, e.damage, false);
              e.cooldown = 45;
            }
          }
        });
      });
    }

    this.allies = this.allies.filter(a => {
      if (a.life !== undefined && a.life <= 0) {
        if (a.source === 'GHOST' && a.ownerId !== undefined && this.hasPassive(a.ownerId, 'blood_magic')) {
          const blastRadius = 120;
          this.enemies.forEach(e => {
            if (this.distSq(a.pos, e.pos) < blastRadius * blastRadius) {
              this.dealDamageToEnemy(e, 40, { playerId: a.ownerId, element: ElementType.POISON, isSpell: true });
            }
          });
          this.createExplosion(a.pos, '#aa00ff', 25, 4, 6);
        } else {
          this.createExplosion(a.pos, a.color, 15, 3, 5);
        }
        return false;
      }
      if (a.hp <= 0) {
        if (a.source === 'GHOST' && a.ownerId !== undefined && this.hasPassive(a.ownerId, 'blood_magic')) {
          const blastRadius = 120;
          this.enemies.forEach(e => {
            if (this.distSq(a.pos, e.pos) < blastRadius * blastRadius) {
              this.dealDamageToEnemy(e, 40, { playerId: a.ownerId, element: ElementType.POISON, isSpell: true });
            }
          });
          this.createExplosion(a.pos, '#aa00ff', 25, 4, 6);
        } else {
          this.createExplosion(a.pos, a.color, 15, 3, 5);
        }
        return false;
      }
      return true;
    });
  }

  private updateEvents() {
    this.eventCooldown--;

    // Maybe spawn new event
    if (this.eventCooldown <= 0 && this.wave >= 2 && Math.random() < 0.002) {
      this.triggerAttackWave();
    }

    // Process active events
    this.events.forEach(ev => {
      if (!ev.active) return;
      ev.startTime--;

      // Announce warning
      if (!ev.announced && ev.startTime <= ev.warningTime) {
        ev.announced = true;
        const dirText = ev.directions ? ev.directions.join(' & ') : '';
        this.announce(`ATTACK IMMINENT FROM ${dirText}!`, '#ff4444', 2);
      }

      // Event starts
      if (ev.startTime <= 0 && ev.duration > 0) {
        ev.duration--;

        // Spawn enemies from directions
        if (ev.type === 'ATTACK_WAVE' && ev.directions && this.frameCount % 30 === 0) {
          ev.directions.forEach(dir => {
            const spawnPos = this.getDirectionalSpawn(dir, ev.intensity);
            if (spawnPos) this.spawnWaveEnemy(spawnPos, ev.intensity);
          });
        }
      }

      // Event ends
      if (ev.duration <= 0) {
        ev.active = false;
        this.announce('Attack wave defeated!', '#44ff44', 1);
      }
    });

    this.events = this.events.filter(ev => ev.active);
  }

  private triggerAttackWave() {
    const dirs: AttackDirection[] = ['NORTH', 'SOUTH', 'EAST', 'WEST', 'NORTHEAST', 'NORTHWEST', 'SOUTHEAST', 'SOUTHWEST'];
    const numDirs = Math.min(1 + Math.floor(this.wave / 4), 3);
    const chosenDirs: AttackDirection[] = [];

    for (let i = 0; i < numDirs; i++) {
      const idx = Math.floor(Math.random() * dirs.length);
      chosenDirs.push(dirs.splice(idx, 1)[0]);
    }

    const intensity = Math.min(1 + this.wave * 0.15, 3);

    this.events.push({
      id: this.nextId++,
      type: 'ATTACK_WAVE',
      startTime: 300,
      duration: 600 + this.wave * 60,
      warningTime: 180,
      directions: chosenDirs,
      intensity,
      active: true,
      announced: false
    });

    this.eventCooldown = 1800 + Math.random() * 1200;
  }

  private getDirectionalSpawn(dir: AttackDirection, intensity: number): Vec2 | null {
    const cx = this.town.pos.x;
    const cy = this.town.pos.y;
    const dist = 1500 + Math.random() * 500;
    const spread = 400 * intensity;

    let baseX = cx, baseY = cy;
    switch (dir) {
      case 'NORTH': baseY = cy - dist; break;
      case 'SOUTH': baseY = cy + dist; break;
      case 'EAST': baseX = cx + dist; break;
      case 'WEST': baseX = cx - dist; break;
      case 'NORTHEAST': baseX = cx + dist * 0.7; baseY = cy - dist * 0.7; break;
      case 'NORTHWEST': baseX = cx - dist * 0.7; baseY = cy - dist * 0.7; break;
      case 'SOUTHEAST': baseX = cx + dist * 0.7; baseY = cy + dist * 0.7; break;
      case 'SOUTHWEST': baseX = cx - dist * 0.7; baseY = cy + dist * 0.7; break;
    }

    const pos = {
      x: baseX + (Math.random() - 0.5) * spread,
      y: baseY + (Math.random() - 0.5) * spread
    };

    pos.x = Math.max(100, Math.min(WORLD_WIDTH - 100, pos.x));
    pos.y = Math.max(100, Math.min(WORLD_HEIGHT - 100, pos.y));

    const biome = this.world.getBiomeAt(pos.x, pos.y);
    if (biome === 'SEA' || biome === 'MOUNTAIN') return null;
    return pos;
  }

  private spawnWaveEnemy(pos: Vec2, intensity: number) {
    const aggressiveTypes: (keyof typeof ENEMY_TYPES)[] =
      intensity > 2 ? ['TANK', 'ELITE', 'CHARGER', 'SPINNER'] :
      intensity > 1 ? ['STALKER', 'SHOOTER', 'BOMBER', 'SPLITTER'] :
      ['SWARM', 'SHOOTER', 'WOLF'];

    const t = aggressiveTypes[Math.floor(Math.random() * aggressiveTypes.length)];
    const config = ENEMY_TYPES[t];

    const scaleMult = 1 + (intensity - 1) * 0.3;

    this.enemies.push({
      id: this.nextId++,
      pos: { ...pos },
      hp: Math.floor(config.hp * scaleMult),
      maxHp: Math.floor(config.hp * scaleMult),
      speed: config.speed * (1 + intensity * 0.1),
      radius: config.radius,
      damage: Math.floor(config.damage * scaleMult),
      type: t,
      movement: 'CHASE',
      cooldown: 0,
      knockbackVel: { x: 0, y: 0 },
      slowTimer: 0,
      burnTimer: 0,
      poisonTimer: 0,
      isAggressive: true,
      angle: Math.atan2(this.town.pos.y - pos.y, this.town.pos.x - pos.x),
      visionCone: 0,
      visionRange: 0
    });
  }

  private announce(text: string, color: string, priority: number) {
    this.announcements.push({ text, life: 180, color, priority });
  }

  private updateAnnouncements() {
    this.announcements.forEach(a => a.life--);
    this.announcements = this.announcements.filter(a => a.life > 0);
  }

  public getDrawState() {
    return {
      players: this.players, playerPositions: this.playerPositions,
      bullets: this.bullets, enemies: this.enemies, particles: this.particles,
      damageNumbers: this.damageNumbers, coins: this.coins, mounts: this.mounts,
      traders: this.traders, fireAreas: this.fireAreas, walls: this.walls, towers: this.towers,
      slashEffects: this.slashEffects, fireTelegraphs: this.fireTelegraphs,
      pickups: this.pickups,
      score: this.score, money: this.money, state: this.state, wave: this.wave,
      camera: this.camera, world: this.world, town: this.town,
      buildMode: this.buildMode, buildRotation: this.buildRotation,
      events: this.events, announcements: this.announcements,
      campfires: this.campfires, torches: this.torches, towns: this.world.getTowns(),
      playerCityHealCooldowns: this.playerCityHealCooldowns,
      magicWheels: this.magicWheels.map(w => w.getState()),
      magicProjectiles: this.magicProjectiles,
      factionCastles: this.factionCastles,
      allies: this.allies
    };
  }

  public getMagicWheelInfo(playerIndex: number): { manaCost: number; comboName: string | null } {
    const wheel = this.magicWheels[playerIndex];
    if (!wheel) return { manaCost: 0, comboName: null };
    return { manaCost: wheel.calculateManaCost(), comboName: wheel.getComboName() };
  }
}
