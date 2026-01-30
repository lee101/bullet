
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
import { InputType, CharacterDef, MagicElement } from '../types';
import { InputManager } from './InputManager';
import { WorldGenerator } from './WorldGenerator';
import { MagicWheel, ELEMENT_COLORS as MAGIC_ELEMENT_COLORS } from './MagicWheel';
import { SpatialHash } from './SpatialHash';

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
  private screenShake: { intensity: number; duration: number; decay: number } = { intensity: 0, duration: 0, decay: 0.9 };
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
        for (let i = 0; i < 10; i++) this.shadowWorld.getSpawnablePosition();
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
    // Pre-load terrain textures and assets in parallel
    await Promise.all([
      terrainRenderer.load(),
      assetManager.load()
    ]);
    // Pre-compute spawnable positions to warm caches
    for (let i = 0; i < 10; i++) {
      this.world.getSpawnablePosition();
    }
    // Pre-build shadow world for instant first start
    this.prepareNextWorld();
    console.log('Engine pre-warmed');
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
    this.spawnAmbientMounts();
    this.spawnTraders();
    this.spawnIdleEnemies();
    this.spawnWorldPickups();
    this.spawnFactionCastles();
    this.startWave(1);
    this.state = GameState.PLAYING;
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

  private spawnAmbientMounts() {
    // Spawn horse herds (clusters of 2-4) - reduced from 12 to 6 herds
    for (let i = 0; i < 6; i++) {
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
          riders: []
        });
      }
    }

    // Spawn chariots (scattered) - reduced from 15 to 8
    for (let i = 0; i < 8; i++) {
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

    // Spawn rare dragons (boss-like, few) - reduced from 5 to 2
    for (let i = 0; i < 2; i++) {
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

    // Spawn boats on shorelines - reduced from 25 to 10
    const shorePositions = this.world.getShorePositions(10);
    for (const pos of shorePositions) {
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
  }

  private spawnTraders() {
    for (let i = 0; i < 5; i++) {
      const pos = this.world.getSpawnablePosition();
      this.traders.push({
        id: this.nextId++,
        pos,
        angle: Math.random() * Math.PI * 2,
        speed: 1.5,
        targetPos: this.world.getSpawnablePosition()
      });
    }
  }

  private spawnIdleEnemies() {
    // Biome-based enemy spawning with tactical enemies
    const biomeEnemies: Record<string, (keyof typeof ENEMY_TYPES)[]> = {
      GRASS: ['DEER', 'WOLF', 'PATROL', 'BOMBER'],
      FOREST: ['WOLF', 'STALKER', 'GUARD', 'SERPENT', 'SPLITTER', 'PHASER'],
      SWAMP: ['SERPENT', 'GHOST', 'PATROL', 'HEALER', 'NECRO'],
      LOWLAND: ['SENTRY', 'PATROL', 'DEER', 'CHARGER'],
      MOUNTAIN: ['GUARD', 'ELITE', 'SENTRY', 'SPINNER', 'SHIELDER'],
      SNOW: ['WOLF', 'ELITE', 'TANK', 'SWARM_QUEEN', 'MIRROR'],
    };

    // Spawn ambient enemies - reduced from 80 to 30 for performance
    for (let i = 0; i < 30; i++) {
      const pos = this.world.getSpawnablePosition();
      const biome = this.world.getBiomeAt(pos.x, pos.y);
      const possibleTypes = biomeEnemies[biome] || ['SENTRY', 'PATROL'];
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

  private spawnFactionCastles() {
    const cfg = FACTION_CASTLE_CONFIG;
    const towns = this.world.getTowns();

    // Spawn 4-6 enemy (red) castles spread around the map
    const numCastles = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < numCastles; i++) {
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

    // Spawn 2-3 friendly (blue) castles near player areas
    const numAllyCastles = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < numAllyCastles; i++) {
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
  }

  private startWave(waveNum: number) {
    this.wave = waveNum;
    this.enemiesToSpawn = 12 + waveNum * 8;
    this.enemiesSpawned = 0;
    this.enemiesKilledThisWave = 0;
    this.money += this.town.goldGeneration;
    // Wave start visual effects
    this.playerPositions.forEach((pos, i) => {
      if (!this.players[i].isDead) {
        this.createWaveStartEffect(pos, waveNum);
      }
    });
    if (waveNum % 5 === 0) this.spawnBoss();
  }

  private createWaveStartEffect(pos: Vec2, waveNum: number) {
    // Expanding ring effect
    const ringCount = Math.min(3, Math.ceil(waveNum / 5));
    for (let ring = 0; ring < ringCount; ring++) {
      const delay = ring * 5;
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const baseRadius = 30 + ring * 20;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * baseRadius, y: pos.y + Math.sin(ang) * baseRadius },
          vel: { x: Math.cos(ang) * (4 + ring), y: Math.sin(ang) * (4 + ring) },
          life: 25 + delay,
          maxLife: 25 + delay,
          color: waveNum % 5 === 0 ? '#ff4444' : '#44aaff',
          size: 3 - ring * 0.5
        });
      }
    }
    this.triggerScreenShake(3, 8);
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
    // Boss entrance VFX
    this.createBossEntranceEffect(spawnPos);
    this.announce('DRAGON BOSS APPROACHES!', '#ff2200', 3);
  }

  private createBossEntranceEffect(pos: Vec2) {
    // Massive explosion effect
    for (let i = 0; i < 50; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 8;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 40 + Math.random() * 30,
        maxLife: 70,
        color: i % 3 === 0 ? '#ff2200' : i % 3 === 1 ? '#ff8800' : '#ffcc00',
        size: 4 + Math.random() * 5
      });
    }
    // Dark portal ring
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      const radius = 80;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 },
        life: 50,
        maxLife: 50,
        color: '#880000',
        size: 6
      });
    }
    // Ground crack lines
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      for (let j = 0; j < 5; j++) {
        const dist = 20 + j * 25;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
          vel: { x: Math.cos(ang) * 1, y: Math.sin(ang) * 1 },
          life: 60 - j * 5,
          maxLife: 60,
          color: '#ff4400',
          size: 3
        });
      }
    }

    // Ominous dark particles rising
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * 60;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: (Math.random() - 0.5) * 2, y: -3 - Math.random() * 4 },
        life: 50 + Math.random() * 30,
        maxLife: 80,
        color: '#440044',
        size: 5 + Math.random() * 3
      });
    }

    // Lightning strikes around boss
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 100 + Math.random() * 30;
      const strikeX = pos.x + Math.cos(ang) * dist;
      const strikeY = pos.y + Math.sin(ang) * dist;

      // Lightning bolt particles descending
      for (let j = 0; j < 6; j++) {
        this.particles.push({
          pos: { x: strikeX + (Math.random() - 0.5) * 10, y: strikeY - 50 - j * 20 },
          vel: { x: (Math.random() - 0.5) * 4, y: 8 + Math.random() * 4 },
          life: 5 + j * 2,
          maxLife: 17,
          color: '#ffff88',
          size: 3 + Math.random() * 2
        });
      }
    }

    this.triggerScreenShake(15, 40);
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

    // Rebuild spatial hash for efficient queries
    this.enemySpatialHash.clear();
    this.enemySpatialHash.insertAll(this.enemies);

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

    // Lazy chunk loading/unloading
    this.world.update(this.camera.x, this.camera.y, window.innerWidth, window.innerHeight);

    this.players.forEach((p, i) => {
      const pos = this.playerPositions[i];
      if (p.isDead) return;

      p.magic = Math.min(p.maxMagic, p.magic + 0.35);
      // Passive health regen (slow)
      if (this.frameCount % 60 === 0 && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + 1);
      }
      const move = this.input.getMovement(i);
      
      if (p.z === 0 && this.input.isJumpPressed(i)) p.zVel = JUMP_FORCE;
      const wasAirborne = p.z > 5;
      p.z += p.zVel;
      if (p.z > 0) p.zVel -= GRAVITY;
      else {
        // Landing effect when hitting ground from height
        if (wasAirborne && p.zVel < -2) {
          this.createLandingDust(pos, Math.abs(p.zVel));
        }
        p.z = 0; p.zVel = 0;
      }

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
                    this.createMountEffect(pos, m.type);
                    break;
                  }
              }
          }
      }

      // Dismount with R when already mounted
      else if (this.input.isRevivePressed(i) && p.mount && p.mountId !== null) {
          const mount = this.mounts.find(m => m.id === p.mountId);
          const dismountType = p.mount;
          if (mount) {
            mount.riders = mount.riders.filter(r => r !== i);
          }
          p.mount = null;
          p.mountId = null;
          this.createDismountEffect(pos, dismountType);
      }

      // Interaction Check: Town or Trader
      if (this.input.isRevivePressed(i)) {
        const distToTown = Math.sqrt(this.distSq(pos, this.town.pos));
        if (distToTown < 300) this.state = GameState.SHOP;

        this.traders.forEach(tr => {
          if (this.distSq(pos, tr.pos) < 150 * 150) this.state = GameState.SHOP;
        });
      }

      let finalSpeed = p.isBlocking ? p.speed * 0.4 : p.speed;
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
        pos.x = Math.max(0, Math.min(WORLD_WIDTH, pos.x));
        pos.y = Math.max(0, Math.min(WORLD_HEIGHT, pos.y));

        // Mountain collision
        const biome = this.world.getBiomeAt(pos.x, pos.y);
        if (biome === 'MOUNTAIN' && p.mount !== 'DRAGON') { pos.x = oldX; pos.y = oldY; }
        if (biome === 'SEA' && p.mount !== 'DRAGON' && p.mount !== 'BOAT') { pos.x = oldX; pos.y = oldY; }

        // Footstep dust particles when moving on ground
        const moveDist = Math.abs(pos.x - oldX) + Math.abs(pos.y - oldY);
        if (moveDist > 2 && p.z === 0 && !p.mount && this.frameCount % 8 === 0) {
          const dustColor = biome === 'SNOW' ? '#ffffff' : biome === 'SHORE' ? '#ddcc99' : '#aa9977';
          this.createFootstepDust(pos, dustColor);
        }
        // Water ripples when on boat
        if (moveDist > 1 && p.mount === 'BOAT' && this.frameCount % 12 === 0) {
          this.createWaterRipple(pos);
        }

        // Driver updates mount position
        if (currentMount && isDriver) {
          currentMount.pos = { ...pos };
          if (move.x !== 0 || move.y !== 0) currentMount.angle = Math.atan2(move.y, move.x);
        }
      }

      const newBiome = this.world.getBiomeAt(pos.x, pos.y);

      // City auto-heal - full HP when entering city, 2min cooldown
      if (this.playerCityHealCooldowns[i] > 0) this.playerCityHealCooldowns[i]--;
      if (newBiome === 'TOWN' && this.playerCityHealCooldowns[i] <= 0 && p.hp < p.maxHp) {
        const healAmount = p.maxHp - p.hp;
        p.hp = p.maxHp;
        this.playerCityHealCooldowns[i] = CITY_HEAL_COOLDOWN;
        this.createHealEffect(pos, healAmount);
        this.addDamageNumber({ x: pos.x, y: pos.y - 30 }, 0, true, 'FULL HEAL');
      }

      for (let s = 0; s < 4; s++) {
        p.skillCooldowns[s]--;
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

      p.autoAttackCooldown--;
      if (p.autoAttackCooldown <= 0) {
          const aim = this.input.getAim(i);
          if (aim) {
              const ang = Math.atan2(aim.y, aim.x);
              p.lastAimAngle = ang;
              this.shoot(i, ang, ElementType.PHYSICAL, p.weaponType);
              p.autoAttackCooldown = 20;
          }
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
            if (p.magic >= manaCost && wheel.getState().stack.elements.length > 0) {
              p.magic -= manaCost;
              const aimAngle = rightStick.x !== 0 || rightStick.y !== 0
                ? Math.atan2(rightStick.y, rightStick.x)
                : p.lastAimAngle;

              const castMode = wheel.getState().castMode;
              const elements = wheel.getState().stack.elements;
              if (castMode === 'ATTACK') {
                const projs = wheel.cast(i, pos, aimAngle);
                projs.forEach(proj => this.magicProjectiles.push(proj));
                this.createMagicCastEffect(pos, aimAngle, elements[0]);
              } else if (castMode === 'SELF') {
                const result = wheel.castSelf(i, pos);
                if (result.heal > 0) {
                  p.hp = Math.min(p.maxHp, p.hp + result.heal);
                  this.addDamageNumber({ x: pos.x, y: pos.y - 20 }, result.heal, false, '+' + result.heal);
                }
                if (result.shield) p.isBlocking = true;
                this.createExplosion(pos, '#40ff90', 20, 3, 5);
              } else if (castMode === 'AREA') {
                const area = wheel.castArea(pos, aimAngle);
                if (area) {
                  this.fireAreas.push({
                    id: this.nextId++,
                    pos: area.pos,
                    radius: area.radius,
                    life: area.duration,
                    maxLife: area.duration,
                    damage: area.damage,
                    color: MAGIC_ELEMENT_COLORS[area.elements[0]] || '#cc33ff'
                  });
                }
              }
              wheel.closeWheel();
              this.wheelInputCooldowns[i] = 30;
            }
          }
        }
      }
    });

    this.updateMagicProjectiles();
    this.updateTraders();
    this.updateAttacks();
    this.updateWalls();
    this.updateTowers();
    this.updateEnemies();
    this.updateFireAreas();
    this.updateSlashEffects();
    this.updateFireTelegraphs();
    this.updateMounts();
    this.updatePickups();
    this.updateFactionCastles();
    this.updateAllies();
    this.updateEvents();
    this.updateAnnouncements();

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

    if (this.enemiesSpawned < this.enemiesToSpawn && this.frameCount % 100 === 0) {
        const spawnPos = this.getValidEnemySpawn();
        if (spawnPos) this.spawnEnemy(spawnPos);
    }

    if (this.enemiesKilledThisWave >= this.enemiesToSpawn && this.enemies.length === 0) {
        this.startWave(this.wave + 1);
    }

    this.particles.forEach(p => { p.pos.x += p.vel.x; p.pos.y += p.vel.y; p.vel.x *= 0.97; p.vel.y *= 0.97; p.life--; });
    this.particles = this.particles.filter(p => p.life > 0);
    this.spawnWeatherParticles();
    this.spawnAmbientFireParticles();
    this.spawnTownAmbientParticles();
    this.damageNumbers.forEach(dn => { dn.pos.y -= 1.0; dn.life--; });
    this.damageNumbers = this.damageNumbers.filter(dn => dn.life > 0);
    this.updateScreenShake();
    this.coins.forEach(c => {
        c.pos.x += c.vel.x; c.pos.y += c.vel.y;
        this.playerPositions.forEach((pp, i) => {
            if (this.distSq(c.pos, pp) < 120*120) {
                const dx = pp.x - c.pos.x, dy = pp.y - c.pos.y, d = Math.sqrt(dx*dx+dy*dy);
                c.vel.x += (dx/d)*0.4; c.vel.y += (dy/d)*0.4;
            }
            if (this.distSq(c.pos, pp) < 30*30) {
                this.money += c.value;
                this.createCoinPickupEffect(c.pos, c.value);
                c.life = 0;
            }
        });
    });
    this.coins = this.coins.filter(c => c.life > 0);

    this.players.forEach((p, i) => {
      if (!p.isDead && p.hp <= 0) {
        p.isDead = true;
        // Dramatic player death VFX
        const playerColors = ['#4d99ff', '#ff6644', '#44ff66', '#ffcc44'];
        this.createPlayerDeathEffect(this.playerPositions[i], playerColors[i % playerColors.length]);
      }
    });
    if (this.players.every(p => p.isDead)) {
      this.state = GameState.GAME_OVER;
      this.prepareNextWorld();
    }
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
      this.enemies.forEach(e => {
        if (!e.isAggressive) return;
        if (this.distSq(m.pos, e.pos) < (mountRadius + e.radius) ** 2) {
          m.hp -= e.damage * 0.5;
          e.knockbackVel = { x: (e.pos.x - m.pos.x) * 0.3, y: (e.pos.y - m.pos.y) * 0.3 };
        }
      });

      // Horses flee from aggressive enemies
      if (m.type === 'HORSE') {
        let fleeVec = { x: 0, y: 0 };
        this.enemies.forEach(e => {
          if (!e.isAggressive) return;
          const d = Math.sqrt(this.distSq(m.pos, e.pos));
          if (d < 300) {
            const strength = (300 - d) / 300;
            fleeVec.x += (m.pos.x - e.pos.x) / d * strength * 4;
            fleeVec.y += (m.pos.y - e.pos.y) / d * strength * 4;
          }
        });
        if (fleeVec.x !== 0 || fleeVec.y !== 0) {
          m.pos.x += fleeVec.x;
          m.pos.y += fleeVec.y;
          m.angle = Math.atan2(fleeVec.y, fleeVec.x);
          m.alerted = true;
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
                this.fireAreas.push({ id: this.nextId++, pos: fPos, radius: 40, life: 90, maxLife: 90, damage: 15, color: '#ff4400' });
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

  private spawnWorldPickups() {
    const pickupTypes: Pickup['type'][] = ['HEALTH_POTION', 'MANA_POTION', 'COIN_BAG', 'CHEST', 'SPEED_BOOST', 'DAMAGE_BOOST'];
    const weights = [30, 20, 25, 10, 8, 7]; // relative spawn weights

    // Spawn initial pickups across the world
    for (let i = 0; i < 80; i++) {
      const pos = this.world.getSpawnablePosition();
      const roll = Math.random() * 100;
      let cumulative = 0;
      let type: Pickup['type'] = 'HEALTH_POTION';
      for (let j = 0; j < pickupTypes.length; j++) {
        cumulative += weights[j];
        if (roll < cumulative) { type = pickupTypes[j]; break; }
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
        const distSq = this.distSq(pk.pos, pp);
        // Attraction sparkle when close but not collected
        if (distSq < 100 * 100 && distSq >= 40 * 40 && this.frameCount % 10 === 0) {
          this.createPickupAttractionParticle(pk.pos, pp, pk.type);
        }
        if (distSq < 40 * 40) {
          const p = this.players[i];
          switch (pk.type) {
            case 'HEALTH_POTION':
              p.hp = Math.min(p.maxHp, p.hp + 50);
              this.createExplosion(pk.pos, '#ff4444', 10, 2, 4);
              this.addDamageNumber(pk.pos, 50, false, '+50 HP');
              break;
            case 'MANA_POTION':
              p.magic = Math.min(p.maxMagic, p.magic + 40);
              this.createExplosion(pk.pos, '#4444ff', 10, 2, 4);
              this.addDamageNumber(pk.pos, 40, false, '+40 MP');
              break;
            case 'COIN_BAG':
              this.money += 100;
              this.createExplosion(pk.pos, '#ffd700', 12, 2, 4);
              this.addDamageNumber(pk.pos, 100, true, '+100 GOLD');
              break;
            case 'SPEED_BOOST':
              p.speed += 0.2;
              this.createPowerUpEffect(pk.pos, '#00ff88', 'SPEED');
              this.addDamageNumber(pk.pos, 0, true, '+SPEED');
              break;
            case 'DAMAGE_BOOST':
              p.damage += 5;
              this.createPowerUpEffect(pk.pos, '#ff8800', 'DAMAGE');
              this.addDamageNumber(pk.pos, 5, true, '+5 DMG');
              break;
            case 'CHEST':
              // Random reward from chest
              const rewards = ['gold', 'hp', 'damage', 'speed'];
              const reward = rewards[Math.floor(Math.random() * rewards.length)];
              if (reward === 'gold') { this.money += 250; this.addDamageNumber(pk.pos, 250, true, '+250 GOLD'); }
              else if (reward === 'hp') { p.maxHp += 25; p.hp += 25; this.addDamageNumber(pk.pos, 25, true, '+25 MAX HP'); }
              else if (reward === 'damage') { p.damage += 8; this.addDamageNumber(pk.pos, 8, true, '+8 DMG'); }
              else { p.speed += 0.3; this.addDamageNumber(pk.pos, 0, true, '+SPEED'); }
              this.createChestOpenEffect(pk.pos, reward);
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

      if (this.frameCount % 15 === 0) {
        this.enemies.forEach(e => {
          if (this.distSq(fa.pos, e.pos) < fa.radius**2) { e.hp -= fa.damage; e.burnTimer = 120; }
        });
        this.playerPositions.forEach((pp, i) => {
          if (this.distSq(fa.pos, pp) < fa.radius**2) {
            this.players[i].hp -= fa.damage * 0.4;
          }
        });
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

      // Magic projectile trail particles
      if (this.frameCount % 2 === 0 && this.isInSimRange(mp.pos, 100)) {
        const color = MAGIC_ELEMENT_COLORS[mp.elements[0]] || '#cc33ff';
        // Main trail particle
        this.particles.push({
          pos: { x: mp.pos.x + (Math.random() - 0.5) * 6, y: mp.pos.y + (Math.random() - 0.5) * 6 },
          vel: { x: -mp.vel.x * 0.1 + (Math.random() - 0.5) * 0.5, y: -mp.vel.y * 0.1 + (Math.random() - 0.5) * 0.5 },
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color,
          size: 2 + Math.random() * 2
        });
        // Element-specific trail effect
        if (mp.elements.includes(MagicElement.FIRE)) {
          this.particles.push({
            pos: { x: mp.pos.x + (Math.random() - 0.5) * 8, y: mp.pos.y },
            vel: { x: (Math.random() - 0.5) * 1, y: -1 - Math.random() * 2 },
            life: 20 + Math.random() * 10,
            maxLife: 30,
            color: Math.random() < 0.5 ? '#ff6600' : '#ffcc00',
            size: 2 + Math.random()
          });
        }
        if (mp.elements.includes(MagicElement.ICE)) {
          this.particles.push({
            pos: { x: mp.pos.x + (Math.random() - 0.5) * 8, y: mp.pos.y + (Math.random() - 0.5) * 8 },
            vel: { x: (Math.random() - 0.5) * 0.5, y: (Math.random() - 0.5) * 0.5 },
            life: 25 + Math.random() * 15,
            maxLife: 40,
            color: '#aaddff',
            size: 1 + Math.random() * 2
          });
        }
        if (mp.elements.includes(MagicElement.LIFE)) {
          this.particles.push({
            pos: { x: mp.pos.x + (Math.random() - 0.5) * 10, y: mp.pos.y },
            vel: { x: (Math.random() - 0.5) * 0.5, y: -0.5 - Math.random() * 1 },
            life: 18 + Math.random() * 10,
            maxLife: 28,
            color: '#44ff88',
            size: 2 + Math.random()
          });
        }
      }

      let hitEnemy: Enemy | null = null;
      for (const e of this.enemies) {
        if (this.distSq(mp.pos, e.pos) < (mp.radius + e.radius) ** 2) {
          hitEnemy = e;
          e.hp -= mp.damage;
          e.knockbackVel = { x: mp.vel.x * 0.3, y: mp.vel.y * 0.3 };

          for (const el of mp.elements) {
            if (el === MagicElement.FIRE) e.burnTimer = Math.max(e.burnTimer, 180);
            if (el === MagicElement.ICE) e.slowTimer = Math.max(e.slowTimer, 240);
            if (el === MagicElement.BLOOD || el === MagicElement.BLACK) e.poisonTimer = Math.max(e.poisonTimer, 150);
          }

          const color = MAGIC_ELEMENT_COLORS[mp.elements[0]] || '#cc33ff';
          this.createExplosion(mp.pos, color, 15, 3, 5);
          this.addDamageNumber(mp.pos, mp.damage, mp.damage > 100);

          if (mp.aoe) {
            this.enemies.forEach(ae => {
              if (ae.id !== e.id && this.distSq(mp.pos, ae.pos) < mp.aoeRadius ** 2) {
                ae.hp -= mp.damage * 0.5;
                this.addDamageNumber(ae.pos, Math.floor(mp.damage * 0.5), false);
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
        const cfg = WALL_CONFIGS[w.type];
        this.createStructureDestructionEffect(w.pos, cfg.width, cfg.height, '#8B4513', false);
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
        const cfg = WALL_CONFIGS.TOWER;
        this.createStructureDestructionEffect(t.pos, cfg.width, cfg.width, '#4a3a2f', true);
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

    // Check mana cost
    if (p.magic < spellData.manaCost) return;
    p.magic -= spellData.manaCost;
    p.skillCooldowns[sIdx] = spellData.cooldown;

    // Spell cast VFX
    const spellColors: Record<string, string> = {
      DASH: '#aaccff', NOVA: '#00ffff', HEAL: '#44ff88', LASER: '#cc33ff',
      FIREBALL: '#ff6600', FIRE_PILLAR: '#ff4400', ICE_STORM: '#88ddff', ICE_SHARD: '#aaddff',
      LIGHTNING_BOLT: '#ffff44', CHAIN_LIGHTNING: '#ffff00', METEOR: '#ff4400',
      POISON_CLOUD: '#66ff66', BLOOD_DRAIN: '#ff4466', TELEPORT: '#cc66ff',
      SHIELD: '#ffffff', EARTHQUAKE: '#8B4513', TIME_SLOW: '#aaccff', SUMMON: '#cc33ff'
    };
    this.createSpellCastEffect(pos, spellData.type, spellColors[spellData.type] || '#cc33ff');

    // Dragon mount override - fire breath
    if (p.mount === 'DRAGON') {
      const aim = this.input.getAim(pIdx) || { x: 1, y: 0 };
      const ang = Math.atan2(aim.y, aim.x);
      for (let i = 0; i < 15; i++) {
        const fPos = { x: pos.x + Math.cos(ang)*(100+i*40), y: pos.y + Math.sin(ang)*(100+i*40) };
        this.fireAreas.push({ id: this.nextId++, pos: fPos, radius: 55, life: 350, maxLife: 350, damage: 25, color: '#ff4400' });
      }
      return;
    }

    const aim = this.input.getAim(pIdx) || { x: 1, y: 0 };
    const ang = Math.atan2(aim.y, aim.x);

    switch (spellData.type) {
      case 'DASH':
        const move = this.input.getMovement(pIdx);
        const startPos = { x: pos.x, y: pos.y };
        pos.x += move.x * spellData.range;
        pos.y += move.y * spellData.range;
        this.createDashTrailEffect(startPos, pos, p.color || '#4d99ff');
        break;

      case 'NOVA':
        this.createExplosion(pos, '#0ff', 60, 8, 14);
        this.enemies.forEach(e => {
          if (this.distSq(pos, e.pos) < (spellData.radius || 380)**2) {
            e.hp -= spellData.damage;
            if (!e.isAggressive) {
              e.isAggressive = true;
              this.createAggroIndicator(e.pos);
            }
          }
        });
        break;

      case 'HEAL':
        p.hp = Math.min(p.maxHp, p.hp + Math.abs(spellData.damage));
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
          life: 60, maxLife: 60, damage: spellData.damage, color: ELEMENT_COLORS[ElementType.FIRE]
        });
        this.createExplosion(fbPos, '#ff4400', 30, 6, 10);
        break;

      case 'ICE_STORM':
        this.fireAreas.push({
          id: this.nextId++, pos: { ...pos }, radius: spellData.radius || 200,
          life: spellData.duration || 180, maxLife: spellData.duration || 180,
          damage: spellData.damage, color: ELEMENT_COLORS[ElementType.ICE]
        });
        this.enemies.forEach(e => {
          if (this.distSq(pos, e.pos) < (spellData.radius || 200)**2) e.slowTimer = 120;
        });
        break;

      case 'LIGHTNING_BOLT':
        const lbTarget = this.getNearestEnemy(pos, spellData.range);
        if (lbTarget) {
          lbTarget.hp -= spellData.damage;
          lbTarget.isAggressive = true;
          this.createExplosion(lbTarget.pos, '#ffff00', 25, 5, 8);
          this.addDamageNumber(lbTarget.pos, spellData.damage, true);
        }
        break;

      case 'METEOR':
        const mPos = { x: pos.x + Math.cos(ang) * 300, y: pos.y + Math.sin(ang) * 300 };
        this.fireAreas.push({
          id: this.nextId++, pos: mPos, radius: spellData.radius || 150,
          life: 90, maxLife: 90, damage: spellData.damage, color: '#ff2200'
        });
        this.createExplosion(mPos, '#ff6600', 80, 10, 16);
        this.enemies.forEach(e => {
          if (this.distSq(mPos, e.pos) < (spellData.radius || 150)**2) {
            e.hp -= spellData.damage;
            e.burnTimer = 180;
          }
        });
        break;

      case 'POISON_CLOUD':
        const pcPos = { x: pos.x + Math.cos(ang) * 200, y: pos.y + Math.sin(ang) * 200 };
        this.fireAreas.push({
          id: this.nextId++, pos: pcPos, radius: spellData.radius || 120,
          life: spellData.duration || 300, maxLife: spellData.duration || 300,
          damage: spellData.damage, color: ELEMENT_COLORS[ElementType.POISON]
        });
        break;

      case 'TELEPORT':
        const teleportStart = { x: pos.x, y: pos.y };
        pos.x += Math.cos(ang) * spellData.range;
        pos.y += Math.sin(ang) * spellData.range;
        this.createTeleportPortalEffect(teleportStart, pos);
        break;

      case 'SHIELD':
        p.isBlocking = true;
        // Shield duration handled in update loop
        break;

      case 'EARTHQUAKE':
        this.createExplosion(pos, '#8B4513', 50, 8, 12);
        this.enemies.forEach(e => {
          if (this.distSq(pos, e.pos) < (spellData.radius || 300)**2) {
            e.hp -= spellData.damage;
            e.slowTimer = 90;
            if (!e.isAggressive) {
              e.isAggressive = true;
              this.createAggroIndicator(e.pos);
            }
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
            next.hp -= spellData.damage;
            this.createExplosion(next.pos, '#ffff00', 10, 3, 5);
            lastPos = next.pos;
          }
        }
        break;

      case 'BLOOD_DRAIN':
        const drainTarget = this.getNearestEnemy(pos, spellData.range);
        if (drainTarget) {
          drainTarget.hp -= spellData.damage;
          p.hp = Math.min(p.maxHp, p.hp + spellData.damage * 0.5);
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
        break;

      case 'SUMMON':
        // Spawn a friendly "ghost" enemy that attacks other enemies
        const summonPos = { x: pos.x + Math.cos(ang) * 100, y: pos.y + Math.sin(ang) * 100 };
        this.createExplosion(summonPos, '#aa00ff', 30, 6, 10);
        break;
    }
  }

  private activateLimitBreak(pIdx: number) {
    const p = this.players[pIdx], pos = this.playerPositions[pIdx];
    // Player color determines limit break type: blue=samurai, pink=witch, green=ranger, yellow=paladin
    const colors = ['#4af', '#f4a', '#4fa', '#fa4'];
    const colorIdx = colors.indexOf(p.color);

    // Massive power surge effect
    this.createLimitBreakActivationEffect(pos, p.color);
    this.addDamageNumber({ x: pos.x, y: pos.y - 50 }, 0, false, 'LIMIT BREAK!');

    // Boost stats during limit break
    p.damage *= 2;
    p.speed *= 1.5;
  }

  private createLimitBreakActivationEffect(pos: Vec2, playerColor: string) {
    // Multi-stage explosion
    for (let stage = 0; stage < 4; stage++) {
      const count = 20 + stage * 5;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + stage * 0.2;
        const spd = 5 + stage * 3;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 25 + stage * 8,
          maxLife: 57,
          color: stage === 0 ? '#ffffff' : stage === 1 ? '#ff6622' : stage === 2 ? '#ffaa00' : playerColor,
          size: 5 - stage + Math.random() * 2
        });
      }
    }

    // Ascending energy pillars
    for (let pillar = 0; pillar < 8; pillar++) {
      const ang = (pillar / 8) * Math.PI * 2;
      const dist = 40;
      for (let i = 0; i < 6; i++) {
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
          vel: { x: 0, y: -6 - i * 2 },
          life: 30 + i * 5,
          maxLife: 60,
          color: i % 2 === 0 ? '#ff4400' : '#ffcc00',
          size: 4 - i * 0.5
        });
      }
    }

    // Ground shockwave
    for (let ring = 0; ring < 3; ring++) {
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const radius = 20 + ring * 20;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
          vel: { x: Math.cos(ang) * (6 + ring * 2), y: Math.sin(ang) * (6 + ring * 2) },
          life: 15 + ring * 5,
          maxLife: 30,
          color: ring === 0 ? '#ffffff' : ring === 1 ? '#ffaa00' : '#ff4400',
          size: 4 - ring
        });
      }
    }

    // Spiraling energy
    for (let i = 0; i < 30; i++) {
      const spiralAng = (i / 30) * Math.PI * 6;
      const radius = 10 + i * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(spiralAng) * radius, y: pos.y + Math.sin(spiralAng) * radius },
        vel: { x: Math.cos(spiralAng) * 2, y: -4 - Math.random() * 3 },
        life: 35 + Math.random() * 20,
        maxLife: 55,
        color: playerColor,
        size: 3 + Math.random() * 2
      });
    }

    // Central flash burst
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 15, y: Math.sin(ang) * 15 },
        life: 8,
        maxLife: 8,
        color: '#ffffff',
        size: 6
      });
    }

    // Heavy screen shake
    this.triggerScreenShake(15, 25);
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
          nearestEnemy.hp -= p.damage * 1.5;
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
        const aim = this.input.getAim(pIdx) || { x: 1, y: 0 };
        const ang = Math.atan2(aim.y, aim.x);
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
        p.hp = Math.min(p.maxHp, p.hp + 10);
        this.createExplosion(pos, '#ffff44', 50, 6, 10);
        this.enemies.forEach(e => {
          if (this.distSq(pos, e.pos) < 200 * 200) {
            e.hp -= p.damage * 0.8;
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

  private findNearestEnemy(pos: { x: number; y: number }, maxDist: number): { pos: { x: number; y: number }; hp: number } | null {
    let nearest = null;
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
      // Only fully simulate enemies in range
      const inRange = this.isInSimRange(e.pos, 800);

      // Always tick down timers
      if (e.slowTimer > 0) e.slowTimer--;
      if (e.burnTimer > 0) {
        e.burnTimer--;
        if (inRange && e.burnTimer % 30 === 0) {
          e.hp -= 10;
          this.createBurnTickEffect(e.pos);
        }
      }
      if (e.poisonTimer > 0) {
        e.poisonTimer--;
        if (inRange && e.poisonTimer % 40 === 0) {
          e.hp -= 15;
          this.createPoisonTickEffect(e.pos);
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
              const wasAggressive = e.isAggressive;
              e.isAggressive = true;
              // Aggro indicator VFX when enemy first spots player
              if (!wasAggressive) {
                this.createAggroIndicator(e.pos);
              }
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
          if (!other.isAggressive) {
            other.isAggressive = true;
            this.createAggroIndicator(other.pos);
          }
        }
      }

      e.pos.x += (dx/d)*e.speed; e.pos.y += (dy/d)*e.speed;
    });

    this.enemies = this.enemies.filter(e => {
        if (e.hp <= 0) {
            this.score += 600; this.enemiesKilledThisWave++;
            // Death explosion VFX with type-specific effects
            const deathColor = ENEMY_TYPES[e.type]?.color || '#ff4444';
            this.createDeathExplosion(e.pos, deathColor, e.radius);
            this.createEnemyTypeDeathEffect(e.pos, e.type, e.radius);
            this.spawnCoin(e.pos);
            const baseXp = 50 + Math.floor(e.maxHp / 5);
            this.players.forEach((p, i) => {
              p.xp += baseXp;
              this.processLevelUp(p, i);
            });

            // Special death effects
            if (e.type === 'BOMBER') {
              this.createExplosion(e.pos, '#ff6600', 40, 6, 10);
              this.playerPositions.forEach((pp, i) => {
                if (this.distSq(e.pos, pp) < 120*120) {
                  this.players[i].hp -= 80;
                }
              });
              const nearby = this.enemySpatialHash.getNearby(e.pos.x, e.pos.y, 120);
              for (const other of nearby) {
                if (other.id !== e.id) other.hp -= 40;
              }
            }

            if (e.type === 'SPLITTER') {
              for (let i = 0; i < 2; i++) {
                const ang = Math.random() * Math.PI * 2;
                const spawnPos = { x: e.pos.x + Math.cos(ang) * 30, y: e.pos.y + Math.sin(ang) * 30 };
                this.enemies.push({
                  id: this.nextId++, pos: spawnPos,
                  hp: 50, maxHp: 50, speed: 3.2, radius: 12, damage: 8,
                  type: 'SWARM', movement: 'CHASE', cooldown: 0,
                  knockbackVel: { x: 0, y: 0 }, slowTimer: 0, burnTimer: 0, poisonTimer: 0,
                  isAggressive: true, angle: ang, visionCone: 0, visionRange: 0
                });
              }
              this.createExplosion(e.pos, '#44cc88', 20, 4, 6);
            }

            if (e.type === 'DRAGON_BOSS') {
              const cfg = MOUNT_CONFIGS.DRAGON;
              this.mounts.push({
                id: this.nextId++,
                pos: { ...e.pos },
                type: 'DRAGON',
                hp: cfg.hp,
                maxHp: cfg.hp,
                angle: e.angle,
                alerted: false,
                riders: []
              });
              this.createExplosion(e.pos, '#ff2200', 60, 8, 12);
              this.announce('DRAGON TAMED! Mount available!', '#00ff44', 3);
            }

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
          this.players[i].hp -= 40;
          this.addDamageNumber(pp, 40, false);
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
        this.fireAreas.push({ id: this.nextId++, pos: fPos, radius: 50, life: 150, maxLife: 150, damage: 30, color: '#ff4400' });
      }
      this.createExplosion(e.pos, '#ff6600', 20, 4, 8);
      this.createFireBreathEffect(e.pos, ang);
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
            this.fireAreas.push({ id: this.nextId++, pos: fPos, radius: 40, life: 120, maxLife: 120, damage: 20, color: '#ff4400' });
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
            this.createChargeWindupEffect(e.pos);
          }
        } else if (e.chargeState === 'windup') {
          // Windup particles - energy gathering
          if (this.frameCount % 4 === 0) {
            const ang = Math.random() * Math.PI * 2;
            const dist = 30 + Math.random() * 20;
            this.particles.push({
              pos: { x: e.pos.x + Math.cos(ang) * dist, y: e.pos.y + Math.sin(ang) * dist },
              vel: { x: -Math.cos(ang) * 3, y: -Math.sin(ang) * 3 },
              life: 12,
              maxLife: 12,
              color: e.chargeTimer > 30 ? '#ff8844' : '#ff4444',
              size: 2 + Math.random()
            });
          }
          if (e.chargeTimer <= 0) {
            e.chargeState = 'charging';
            e.chargeTimer = 30;
            if (target) {
              const dx = target.x - e.pos.x, dy = target.y - e.pos.y;
              const d = Math.sqrt(dx*dx + dy*dy);
              e.chargeDir = { x: dx/d, y: dy/d };
            }
            // Charge launch burst
            this.createChargeLaunchEffect(e.pos, e.chargeDir || { x: 1, y: 0 });
          }
        } else if (e.chargeState === 'charging') {
          if (e.chargeDir) {
            e.pos.x += e.chargeDir.x * 12;
            e.pos.y += e.chargeDir.y * 12;
            // Charge trail particles
            if (this.frameCount % 2 === 0) {
              this.particles.push({
                pos: { x: e.pos.x + (Math.random() - 0.5) * 15, y: e.pos.y + (Math.random() - 0.5) * 15 },
                vel: { x: -e.chargeDir.x * 2 + (Math.random() - 0.5) * 2, y: -e.chargeDir.y * 2 + (Math.random() - 0.5) * 2 },
                life: 15 + Math.random() * 10,
                maxLife: 25,
                color: Math.random() < 0.5 ? '#ff4444' : '#ffaa44',
                size: 3 + Math.random() * 2
              });
            }
          }
          if (e.chargeTimer <= 0) {
            e.chargeState = 'idle';
            e.chargeTimer = 120;
            // Charge end skid effect
            this.createChargeEndEffect(e.pos);
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
              life: 90, maxLife: 90, damage: 20, color: '#cc33ff'
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
      // Player, tower, and ally bullets hit enemies - use spatial hash
      if (b.playerId >= 0 || b.playerId === -1 || b.playerId === -3) {
        const nearby = this.enemySpatialHash.getNearby(b.pos.x, b.pos.y, b.radius + 80);
        for (const e of nearby) {
          if (b.life <= 0) break;
          if (this.distSq(b.pos, e.pos) < (b.radius + e.radius)**2) {
            const wasAggressive = e.isAggressive;
            e.hp -= b.damage; e.isAggressive = true;
            this.addDamageNumber(e.pos, b.damage, false);
            // Elemental impact VFX
            this.createElementalImpact(b.pos, b.element, b.vel);
            // Aggro indicator for first hit
            if (!wasAggressive) this.createAggroIndicator(e.pos);
            b.life = 0;
          }
        }
      }
      // Enemy bullets hit players and allies
      if (b.playerId === -2) {
        this.playerPositions.forEach((pp, i) => {
          if (!this.players[i].isDead && this.distSq(b.pos, pp) < (b.radius + PLAYER_RADIUS)**2) {
            const p = this.players[i];
            if (p.isBlocking) {
              // Shield blocked - reduced damage and special VFX
              const blockedDamage = Math.floor(b.damage * 0.3);
              p.hp -= blockedDamage;
              this.addDamageNumber(pp, blockedDamage, false, 'BLOCKED');
              this.createShieldBlockEffect(pp, b.vel);
            } else {
              p.hp -= b.damage;
              this.addDamageNumber(pp, b.damage, false);
              this.createImpactSparks(b.pos, '#ff4444', b.vel);
              this.triggerScreenShake(3, 8);
            }
            b.life = 0;
          }
        });
        this.allies.forEach(a => {
          if (this.distSq(b.pos, a.pos) < (b.radius + 15)**2) {
            a.hp -= b.damage;
            this.addDamageNumber(a.pos, b.damage, false);
            b.life = 0;
          }
        });
      }
    });
    // Check for water splash when bullets expire
    this.bullets.forEach(b => {
      if (b.life <= 0) {
        const biome = this.world.getBiomeAt(b.pos.x, b.pos.y);
        if (biome === 'SEA' && this.isInSimRange(b.pos, 200)) {
          this.createWaterSplash(b.pos, 0.6);
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
            this.players[i].hp -= e.damage;
            this.addDamageNumber(pp, e.damage, false);
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
          color: '#ff4400'
        });
        this.createExplosion(ft.pos, '#ff6600', 20, 4, 8);
        // Damage players in blast
        this.playerPositions.forEach((pp, i) => {
          if (this.distSq(ft.pos, pp) < ft.radius * ft.radius) {
            this.players[i].hp -= ft.damage;
            this.addDamageNumber(pp, ft.damage, false);
          }
        });
      }
    });
    this.fireTelegraphs = this.fireTelegraphs.filter(ft => ft.life > 0);
  }

  private spawnCoin(pos: Vec2) {
      for(let i=0; i<4; i++) {
          const a = Math.random()*Math.PI*2, s = 2+Math.random()*5;
          this.coins.push({ id: this.nextId++, pos: {...pos}, vel: {x: Math.cos(a)*s, y: Math.sin(a)*s}, value: 25, life: 600 });
      }
  }

  private shoot(pIdx: number, angle: number, element: ElementType, type: PlayerStats['weaponType']) {
    const p = this.players[pIdx], pos = {...this.playerPositions[pIdx]};
    this.bullets.push({ id: this.nextId++, playerId: pIdx, pos, vel: {x: Math.cos(angle)*20, y: Math.sin(angle)*20}, damage: p.damage, element, radius: 9, life: 100, pierce: 1 });
    // Muzzle flash particles
    this.createMuzzleFlash(pos, angle, ELEMENT_COLORS[element]);
  }

  private createMuzzleFlash(pos: Vec2, angle: number, color: string) {
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 0.8;
      const ang = angle + spread;
      const spd = 4 + Math.random() * 4;
      this.particles.push({
        pos: { x: pos.x + Math.cos(angle) * 15, y: pos.y + Math.sin(angle) * 15 },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 6 + Math.random() * 4,
        maxLife: 10,
        color,
        size: 2 + Math.random() * 2
      });
    }
    // White core flash
    this.particles.push({
      pos: { x: pos.x + Math.cos(angle) * 12, y: pos.y + Math.sin(angle) * 12 },
      vel: { x: Math.cos(angle) * 2, y: Math.sin(angle) * 2 },
      life: 4,
      maxLife: 4,
      color: '#ffffff',
      size: 4
    });
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
    // Enemy spawn portal effect (occasional, not every spawn)
    if (Math.random() < 0.3) {
      this.createSpawnPortalEffect(pos, config.color);
    }
    this.enemiesSpawned++;
  }

  private createSpawnPortalEffect(pos: Vec2, color: string) {
    // Swirl effect
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const radius = 20 + Math.random() * 10;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: -Math.sin(ang) * 3, y: Math.cos(ang) * 3 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: color || '#880088',
        size: 2 + Math.random() * 2
      });
    }
    // Center flash
    for (let i = 0; i < 5; i++) {
      const ang = Math.random() * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 },
        life: 10,
        maxLife: 10,
        color: '#aa44aa',
        size: 3
      });
    }
  }

  private createFireBreathEffect(pos: Vec2, angle: number) {
    // Fire stream particles
    for (let i = 0; i < 40; i++) {
      const spread = (Math.random() - 0.5) * 0.8;
      const dist = 30 + Math.random() * 400;
      const spd = 8 + Math.random() * 6;
      const ang = angle + spread * (1 - dist / 500);
      this.particles.push({
        pos: { x: pos.x + Math.cos(angle) * 30, y: pos.y + Math.sin(angle) * 30 },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: i % 3 === 0 ? '#ff2200' : i % 3 === 1 ? '#ff8800' : '#ffcc00',
        size: 4 + Math.random() * 4
      });
    }
    // Smoke trail
    for (let i = 0; i < 15; i++) {
      const spread = (Math.random() - 0.5) * 0.5;
      const spd = 3 + Math.random() * 3;
      this.particles.push({
        pos: { x: pos.x + Math.cos(angle) * 50, y: pos.y + Math.sin(angle) * 50 },
        vel: { x: Math.cos(angle + spread) * spd, y: Math.sin(angle + spread) * spd - 1 },
        life: 40 + Math.random() * 20,
        maxLife: 60,
        color: '#444444',
        size: 6 + Math.random() * 4
      });
    }
    this.triggerScreenShake(6, 20);
  }

  private createWaterRipple(pos: Vec2) {
    // Multi-layer expanding rings
    for (let ring = 0; ring < 2; ring++) {
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2;
        const spd = 2 + ring;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * (5 + ring * 5), y: pos.y + Math.sin(ang) * (3 + ring * 3) },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd * 0.5 },
          life: 18 + ring * 5,
          maxLife: 28,
          color: ring === 0 ? '#88ccff' : '#4488aa',
          size: 2 + Math.random()
        });
      }
    }
    // Small water droplets
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 10, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 1.5, y: -1 - Math.random() * 1.5 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#aaddff',
        size: 1 + Math.random()
      });
    }
  }

  private createWaterSplash(pos: Vec2, intensity: number = 1) {
    // Water droplets spraying upward
    const dropletCount = Math.floor(8 * intensity);
    for (let i = 0; i < dropletCount; i++) {
      const ang = Math.PI * (0.5 + (Math.random() - 0.5) * 0.8);
      const spd = (2 + Math.random() * 4) * intensity;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: i % 2 === 0 ? '#88ccff' : '#aaddff',
        size: 2 + Math.random() * 2
      });
    }

    // Splash foam
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * 8, y: pos.y + Math.sin(ang) * 4 },
        vel: { x: Math.cos(ang) * 3, y: Math.sin(ang) * 1.5 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#ffffff',
        size: 3 + Math.random() * 2
      });
    }

    // Expanding splash ring
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 4, y: Math.sin(ang) * 2 },
        life: 15,
        maxLife: 15,
        color: '#66aadd',
        size: 2
      });
    }
  }

  private createChargeWindupEffect(pos: Vec2) {
    // Warning indicator - pulsing ring
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * 20, y: pos.y + Math.sin(ang) * 20 },
        vel: { x: Math.cos(ang) * 1.5, y: Math.sin(ang) * 1.5 },
        life: 20,
        maxLife: 20,
        color: '#ff6644',
        size: 3
      });
    }
    // Ground stomp effect
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * 10, y: pos.y + 10 + Math.sin(ang) * 5 },
        vel: { x: Math.cos(ang) * 3, y: -0.5 + Math.sin(ang) * 1.5 },
        life: 15,
        maxLife: 15,
        color: '#aa8866',
        size: 2 + Math.random()
      });
    }
  }

  private createChargeLaunchEffect(pos: Vec2, dir: Vec2) {
    // Burst behind charger
    const backAng = Math.atan2(-dir.y, -dir.x);
    for (let i = 0; i < 15; i++) {
      const ang = backAng + (Math.random() - 0.5) * 1.5;
      const spd = 4 + Math.random() * 4;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: i % 2 === 0 ? '#ff4444' : '#ffaa44',
        size: 3 + Math.random() * 2
      });
    }
    // Speed lines in direction of charge
    for (let i = 0; i < 6; i++) {
      const offset = (Math.random() - 0.5) * 20;
      const perpAng = Math.atan2(dir.y, dir.x) + Math.PI / 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(perpAng) * offset, y: pos.y + Math.sin(perpAng) * offset },
        vel: { x: dir.x * 8, y: dir.y * 8 },
        life: 10 + Math.random() * 5,
        maxLife: 15,
        color: '#ffffff',
        size: 2
      });
    }
    // Small screen shake on launch
    this.triggerScreenShake(4, 8);
  }

  private createChargeEndEffect(pos: Vec2) {
    // Skid dust cloud
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 3;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y + 10 },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd * 0.3 - 1 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#aa9977',
        size: 4 + Math.random() * 3
      });
    }
    // Ground impact sparks
    for (let i = 0; i < 8; i++) {
      const ang = Math.PI * (0.7 + Math.random() * 0.6);
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y + 5 },
        vel: { x: Math.cos(ang) * 3, y: Math.sin(ang) * 3 },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: '#ffaa44',
        size: 2 + Math.random()
      });
    }
  }

  private createAggroIndicator(pos: Vec2) {
    // Exclamation mark effect - rising particles
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 8, y: pos.y - 20 - i * 4 },
        vel: { x: 0, y: -3 },
        life: 15 + i * 2,
        maxLife: 27,
        color: '#ff4444',
        size: 3 - i * 0.3
      });
    }
    // Dot at bottom
    this.particles.push({
      pos: { x: pos.x, y: pos.y - 10 },
      vel: { x: 0, y: -1 },
      life: 20,
      maxLife: 20,
      color: '#ff4444',
      size: 4
    });
    // Expanding alert ring
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 4, y: Math.sin(ang) * 4 },
        life: 12,
        maxLife: 12,
        color: '#ff6666',
        size: 2
      });
    }
  }

  private createBurnTickEffect(pos: Vec2) {
    // Small fire burst
    for (let i = 0; i < 5; i++) {
      const ang = Math.random() * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y + (Math.random() - 0.5) * 15 },
        vel: { x: Math.cos(ang) * 1.5, y: -2 - Math.random() * 2 },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: i % 2 === 0 ? '#ff4400' : '#ffaa00',
        size: 2 + Math.random() * 2
      });
    }
  }

  private createPoisonTickEffect(pos: Vec2) {
    // Poison bubble particles
    for (let i = 0; i < 4; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * 10;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: (Math.random() - 0.5) * 1, y: -1.5 - Math.random() * 1.5 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: i % 2 === 0 ? '#a020f0' : '#cc66ff',
        size: 2 + Math.random() * 2
      });
    }
    // Dripping effect
    this.particles.push({
      pos: { x: pos.x, y: pos.y + 10 },
      vel: { x: 0, y: 1 },
      life: 15,
      maxLife: 15,
      color: '#8800aa',
      size: 3
    });
  }

  private createPickupAttractionParticle(pickupPos: Vec2, playerPos: Vec2, type: string) {
    const colors: Record<string, string> = {
      'HEALTH_POTION': '#ff4444',
      'MANA_POTION': '#4444ff',
      'COIN_BAG': '#ffd700',
      'SPEED_BOOST': '#00ff88',
      'DAMAGE_BOOST': '#ff8800',
      'CHEST': '#ffaa44'
    };
    const color = colors[type] || '#ffffff';
    // Particle moving toward player
    const dx = playerPos.x - pickupPos.x;
    const dy = playerPos.y - pickupPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    this.particles.push({
      pos: { x: pickupPos.x + (Math.random() - 0.5) * 15, y: pickupPos.y + (Math.random() - 0.5) * 15 },
      vel: { x: (dx / dist) * 3, y: (dy / dist) * 3 },
      life: 15,
      maxLife: 15,
      color,
      size: 2
    });
  }

  private createLandingDust(pos: Vec2, impactForce: number) {
    const count = Math.floor(6 + impactForce * 2);
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + impactForce * 0.5 + Math.random() * 2;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y + PLAYER_RADIUS },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * 0.3 - 0.5 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#aa9977',
        size: 2 + Math.random() * 2
      });
    }
    // Impact ring
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x, y: pos.y + PLAYER_RADIUS },
        vel: { x: Math.cos(ang) * (2 + impactForce * 0.3), y: Math.sin(ang) * 0.5 },
        life: 10,
        maxLife: 10,
        color: '#ccbbaa',
        size: 2
      });
    }
    this.triggerScreenShake(Math.min(impactForce * 0.5, 4), 6);
  }

  private createExplosion(pos: Vec2, color: string, count: number, force: number, maxSize: number) {
    for (let i = 0; i < count; i++) {
        const ang = Math.random()*Math.PI*2, spd = (1+Math.random()*4.5)*force;
        this.particles.push({ pos: {...pos}, vel: {x: Math.cos(ang)*spd, y: Math.sin(ang)*spd}, life: 35, maxLife: 35, color, size: 1+Math.random()*maxSize });
    }
  }

  public triggerScreenShake(intensity: number, duration: number = 15) {
    if (intensity > this.screenShake.intensity) {
      this.screenShake.intensity = intensity;
      this.screenShake.duration = duration;
    }
  }

  private updateScreenShake() {
    if (this.screenShake.duration > 0) {
      this.screenShake.duration--;
      this.screenShake.intensity *= this.screenShake.decay;
    } else {
      this.screenShake.intensity = 0;
    }
  }

  private createDeathExplosion(pos: Vec2, color: string, radius: number) {
    const count = Math.floor(15 + radius * 0.5);
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const spd = 2 + Math.random() * 5;
      const size = 2 + Math.random() * 4;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius * 0.3, y: pos.y + Math.sin(ang) * radius * 0.3 },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 25 + Math.random() * 20,
        maxLife: 45,
        color,
        size
      });
    }
    // Add inner burst
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 8, y: Math.sin(ang) * 8 },
        life: 15,
        maxLife: 15,
        color: '#ffffff',
        size: 3
      });
    }
    this.triggerScreenShake(Math.min(radius * 0.15, 8), 10);
  }

  private createEnemyTypeDeathEffect(pos: Vec2, enemyType: string, radius: number) {
    switch (enemyType) {
      case 'MAGE':
      case 'SPINNER':
        // Magic dissipation
        for (let i = 0; i < 12; i++) {
          const ang = Math.random() * Math.PI * 2;
          this.particles.push({
            pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y + (Math.random() - 0.5) * 20 },
            vel: { x: Math.cos(ang) * 2, y: -2 - Math.random() * 3 },
            life: 30 + Math.random() * 20,
            maxLife: 50,
            color: ['#cc33ff', '#ff66ff', '#aa44ff'][Math.floor(Math.random() * 3)],
            size: 3 + Math.random() * 2
          });
        }
        break;

      case 'GHOST':
      case 'PHASER':
        // Ethereal fade
        for (let i = 0; i < 15; i++) {
          this.particles.push({
            pos: { x: pos.x + (Math.random() - 0.5) * 30, y: pos.y + (Math.random() - 0.5) * 30 },
            vel: { x: (Math.random() - 0.5) * 1, y: -1.5 - Math.random() * 2 },
            life: 40 + Math.random() * 30,
            maxLife: 70,
            color: '#aaccff',
            size: 4 + Math.random() * 3
          });
        }
        break;

      case 'WOLF':
      case 'DEER':
      case 'SERPENT':
        // Fur/scale particles
        for (let i = 0; i < 8; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 2 + Math.random() * 3;
          this.particles.push({
            pos: { ...pos },
            vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 1 },
            life: 25 + Math.random() * 15,
            maxLife: 40,
            color: enemyType === 'WOLF' ? '#664433' : enemyType === 'DEER' ? '#aa8866' : '#446644',
            size: 2 + Math.random() * 2
          });
        }
        break;

      case 'TANK':
      case 'ELITE':
      case 'SHIELDER':
        // Armor shatter
        for (let i = 0; i < 10; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 3 + Math.random() * 4;
          this.particles.push({
            pos: { ...pos },
            vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 2 },
            life: 30 + Math.random() * 20,
            maxLife: 50,
            color: i % 2 === 0 ? '#888888' : '#666666',
            size: 3 + Math.random() * 3
          });
        }
        // Metal sparks
        for (let i = 0; i < 6; i++) {
          const ang = Math.random() * Math.PI * 2;
          this.particles.push({
            pos: { ...pos },
            vel: { x: Math.cos(ang) * 5, y: Math.sin(ang) * 5 },
            life: 10 + Math.random() * 8,
            maxLife: 18,
            color: '#ffcc44',
            size: 2
          });
        }
        break;

      case 'HEALER':
        // Healing energy release
        for (let i = 0; i < 15; i++) {
          this.particles.push({
            pos: { x: pos.x + (Math.random() - 0.5) * 25, y: pos.y + (Math.random() - 0.5) * 25 },
            vel: { x: (Math.random() - 0.5) * 2, y: -3 - Math.random() * 3 },
            life: 35 + Math.random() * 20,
            maxLife: 55,
            color: i % 2 === 0 ? '#44ff88' : '#88ffaa',
            size: 3 + Math.random() * 2
          });
        }
        break;

      case 'DRAGON_BOSS':
        // Massive fire explosion
        for (let i = 0; i < 30; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 4 + Math.random() * 8;
          this.particles.push({
            pos: { ...pos },
            vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
            life: 40 + Math.random() * 30,
            maxLife: 70,
            color: ['#ff4400', '#ff6600', '#ffaa00', '#ffcc00'][Math.floor(Math.random() * 4)],
            size: 5 + Math.random() * 5
          });
        }
        // Smoke cloud
        for (let i = 0; i < 15; i++) {
          this.particles.push({
            pos: { x: pos.x + (Math.random() - 0.5) * 50, y: pos.y + (Math.random() - 0.5) * 50 },
            vel: { x: (Math.random() - 0.5) * 2, y: -1 - Math.random() * 2 },
            life: 60 + Math.random() * 40,
            maxLife: 100,
            color: '#555555',
            size: 8 + Math.random() * 6
          });
        }
        this.triggerScreenShake(15, 25);
        break;
    }
  }

  private createPlayerDeathEffect(pos: Vec2, playerColor: string) {
    // Dramatic expanding shockwave ring
    for (let ring = 0; ring < 3; ring++) {
      for (let i = 0; i < 20; i++) {
        const ang = (i / 20) * Math.PI * 2;
        const delay = ring * 5;
        const spd = 4 + ring * 2;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 25 + delay,
          maxLife: 25 + delay,
          color: ring === 0 ? '#ffffff' : ring === 1 ? playerColor : '#ff4444',
          size: 4 - ring
        });
      }
    }
    // Soul fragments rising upward
    for (let i = 0; i < 15; i++) {
      const offsetX = (Math.random() - 0.5) * 40;
      this.particles.push({
        pos: { x: pos.x + offsetX, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 2, y: -5 - Math.random() * 4 },
        life: 50 + Math.random() * 30,
        maxLife: 80,
        color: '#aaccff',
        size: 2 + Math.random() * 3
      });
    }
    // Explosive burst of player color
    for (let i = 0; i < 25; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 8;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: playerColor,
        size: 3 + Math.random() * 4
      });
    }
    // Ground impact sparks
    for (let i = 0; i < 12; i++) {
      const ang = Math.PI * (0.8 + Math.random() * 0.4);
      const spd = 4 + Math.random() * 4;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y + 10 },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#ffaa44',
        size: 2 + Math.random() * 2
      });
    }
    // Dramatic white flash at center
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 10, y: Math.sin(ang) * 10 },
        life: 8,
        maxLife: 8,
        color: '#ffffff',
        size: 5
      });
    }
    // Heavy screen shake for dramatic effect
    this.triggerScreenShake(15, 20);
  }

  private createImpactSparks(pos: Vec2, color: string, direction: Vec2) {
    const count = 5 + Math.floor(Math.random() * 4);
    const baseAngle = Math.atan2(direction.y, direction.x);
    for (let i = 0; i < count; i++) {
      const ang = baseAngle + Math.PI + (Math.random() - 0.5) * 1.2;
      const spd = 3 + Math.random() * 4;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color,
        size: 1 + Math.random() * 2
      });
    }
  }

  private createElementalImpact(pos: Vec2, element: ElementType, direction: Vec2) {
    const baseAngle = Math.atan2(direction.y, direction.x);

    switch (element) {
      case ElementType.FIRE:
        // Fire burst with ember particles rising
        for (let i = 0; i < 10; i++) {
          const ang = Math.random() * Math.PI * 2;
          this.particles.push({
            pos: { ...pos },
            vel: { x: Math.cos(ang) * 3, y: -2 - Math.random() * 4 },
            life: 25 + Math.random() * 15,
            maxLife: 40,
            color: i % 3 === 0 ? '#ff6600' : (i % 3 === 1 ? '#ffcc00' : '#ff4400'),
            size: 2 + Math.random() * 3
          });
        }
        break;

      case ElementType.ICE:
        // Ice shards shattering
        for (let i = 0; i < 8; i++) {
          const ang = baseAngle + Math.PI + (Math.random() - 0.5) * 2;
          const spd = 4 + Math.random() * 4;
          this.particles.push({
            pos: { ...pos },
            vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
            life: 20 + Math.random() * 10,
            maxLife: 30,
            color: i % 2 === 0 ? '#88ddff' : '#ffffff',
            size: 2 + Math.random() * 3
          });
        }
        // Frost mist
        for (let i = 0; i < 6; i++) {
          this.particles.push({
            pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y + (Math.random() - 0.5) * 20 },
            vel: { x: (Math.random() - 0.5) * 1, y: -0.5 - Math.random() * 1 },
            life: 30 + Math.random() * 20,
            maxLife: 50,
            color: '#aaddff',
            size: 4 + Math.random() * 3
          });
        }
        break;

      case ElementType.LIGHTNING:
        // Electric sparks flying erratically
        for (let i = 0; i < 12; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 5 + Math.random() * 5;
          this.particles.push({
            pos: { ...pos },
            vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
            life: 8 + Math.random() * 8,
            maxLife: 16,
            color: i % 2 === 0 ? '#ffff44' : '#ffffff',
            size: 1 + Math.random() * 2
          });
        }
        break;

      case ElementType.POISON:
        // Toxic droplets splashing
        for (let i = 0; i < 10; i++) {
          const ang = baseAngle + Math.PI + (Math.random() - 0.5) * 1.5;
          const spd = 2 + Math.random() * 3;
          this.particles.push({
            pos: { ...pos },
            vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd + 1 },
            life: 30 + Math.random() * 20,
            maxLife: 50,
            color: i % 2 === 0 ? '#44ff44' : '#88ff88',
            size: 2 + Math.random() * 2
          });
        }
        // Poison mist lingering
        for (let i = 0; i < 5; i++) {
          this.particles.push({
            pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y + (Math.random() - 0.5) * 15 },
            vel: { x: (Math.random() - 0.5) * 0.5, y: -0.3 - Math.random() * 0.5 },
            life: 40 + Math.random() * 20,
            maxLife: 60,
            color: '#66ff66',
            size: 5 + Math.random() * 3
          });
        }
        break;

      case ElementType.MAGIC:
        // Arcane sparkles spiraling
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2;
          const spd = 3 + Math.random() * 2;
          this.particles.push({
            pos: { ...pos },
            vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
            life: 20 + Math.random() * 15,
            maxLife: 35,
            color: i % 3 === 0 ? '#cc33ff' : (i % 3 === 1 ? '#ff66ff' : '#ffffff'),
            size: 2 + Math.random() * 2
          });
        }
        break;

      default:
        // Physical impact - simple sparks
        for (let i = 0; i < 6; i++) {
          const ang = baseAngle + Math.PI + (Math.random() - 0.5) * 1.2;
          const spd = 3 + Math.random() * 3;
          this.particles.push({
            pos: { ...pos },
            vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
            life: 10 + Math.random() * 8,
            maxLife: 18,
            color: '#ffeeaa',
            size: 1 + Math.random() * 2
          });
        }
    }
  }

  private createTeleportPortalEffect(startPos: Vec2, endPos: Vec2) {
    // Entry portal - imploding
    for (let ring = 0; ring < 2; ring++) {
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2 + ring * 0.2;
        const radius = 30 - ring * 10;
        this.particles.push({
          pos: { x: startPos.x + Math.cos(ang) * radius, y: startPos.y + Math.sin(ang) * radius },
          vel: { x: -Math.cos(ang) * 3, y: -Math.sin(ang) * 3 },
          life: 20 + ring * 5,
          maxLife: 30,
          color: ring === 0 ? '#cc33ff' : '#ffffff',
          size: 3 - ring
        });
      }
    }

    // Entry portal swirl
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 4;
      const dist = 10 + i;
      this.particles.push({
        pos: { x: startPos.x + Math.cos(ang) * dist, y: startPos.y + Math.sin(ang) * dist },
        vel: { x: -Math.cos(ang) * 2, y: -Math.sin(ang) * 2 - 1 },
        life: 15 + i,
        maxLife: 35,
        color: '#ff88ff',
        size: 2
      });
    }

    // Entry flash
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      this.particles.push({
        pos: { ...startPos },
        vel: { x: Math.cos(ang) * 6, y: Math.sin(ang) * 6 },
        life: 8,
        maxLife: 8,
        color: '#ffffff',
        size: 4
      });
    }

    // Exit portal - exploding
    for (let ring = 0; ring < 3; ring++) {
      for (let i = 0; i < 18; i++) {
        const ang = (i / 18) * Math.PI * 2 + ring * 0.15;
        const spd = 3 + ring * 2;
        this.particles.push({
          pos: { ...endPos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 20 + ring * 8,
          maxLife: 44,
          color: ring === 0 ? '#ffffff' : ring === 1 ? '#cc33ff' : '#8822cc',
          size: 4 - ring
        });
      }
    }

    // Exit portal spiral
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 4;
      this.particles.push({
        pos: { ...endPos },
        vel: { x: Math.cos(ang) * (2 + i * 0.2), y: Math.sin(ang) * (2 + i * 0.2) - 2 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#ff66ff',
        size: 2 + Math.random()
      });
    }

    // Arcane runes around exit
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const dist = 40;
      this.particles.push({
        pos: { x: endPos.x + Math.cos(ang) * dist, y: endPos.y + Math.sin(ang) * dist },
        vel: { x: 0, y: -3 },
        life: 30,
        maxLife: 30,
        color: '#cc33ff',
        size: 4
      });
    }

    // Connecting line particles (fast moving from start to end)
    const dx = endPos.x - startPos.x;
    const dy = endPos.y - startPos.y;
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        pos: { x: startPos.x + dx * 0.2, y: startPos.y + dy * 0.2 },
        vel: { x: dx * 0.15, y: dy * 0.15 },
        life: 8,
        maxLife: 8,
        color: '#ffffff',
        size: 2
      });
    }

    // Screen shake on teleport
    this.triggerScreenShake(5, 10);
  }

  private createSpellCastEffect(pos: Vec2, spellType: string, color: string) {
    // Magic circle forming
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const radius = 25;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 },
        life: 15,
        maxLife: 15,
        color,
        size: 3
      });
    }

    // Central energy gathering
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 20;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: -Math.cos(ang) * 4, y: -Math.sin(ang) * 4 },
        life: 10 + Math.random() * 5,
        maxLife: 15,
        color: '#ffffff',
        size: 2
      });
    }

    // Spell-type specific effects
    if (spellType === 'FIREBALL' || spellType === 'FIRE_PILLAR') {
      // Fire wisps
      for (let i = 0; i < 6; i++) {
        this.particles.push({
          pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y },
          vel: { x: (Math.random() - 0.5) * 2, y: -3 - Math.random() * 3 },
          life: 20 + Math.random() * 10,
          maxLife: 30,
          color: i % 2 === 0 ? '#ff6600' : '#ffcc00',
          size: 3 + Math.random() * 2
        });
      }
    } else if (spellType === 'FROST_NOVA' || spellType === 'ICE_SHARD') {
      // Ice crystals forming
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * 3, y: Math.sin(ang) * 3 - 1 },
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color: '#88ddff',
          size: 2 + Math.random() * 2
        });
      }
    } else if (spellType === 'CHAIN_LIGHTNING' || spellType === 'LIGHTNING_BOLT') {
      // Electric sparks
      for (let i = 0; i < 10; i++) {
        const ang = Math.random() * Math.PI * 2;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * 5, y: Math.sin(ang) * 5 },
          life: 6 + Math.random() * 6,
          maxLife: 12,
          color: '#ffff44',
          size: 1 + Math.random() * 2
        });
      }
    } else if (spellType === 'HEAL') {
      // Healing glow
      for (let i = 0; i < 12; i++) {
        this.particles.push({
          pos: { x: pos.x + (Math.random() - 0.5) * 30, y: pos.y + (Math.random() - 0.5) * 30 },
          vel: { x: (Math.random() - 0.5) * 1, y: -2 - Math.random() * 2 },
          life: 25 + Math.random() * 15,
          maxLife: 40,
          color: '#44ff88',
          size: 3 + Math.random() * 2
        });
      }
    }

    // Rising energy trail
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -4 - Math.random() * 2 },
        life: 15 + i * 3,
        maxLife: 30,
        color,
        size: 2
      });
    }
  }

  private createDashTrailEffect(startPos: Vec2, endPos: Vec2, color: string) {
    const dx = endPos.x - startPos.x;
    const dy = endPos.y - startPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.floor(dist / 15);
    const angle = Math.atan2(dy, dx);

    // Afterimages along the path
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = startPos.x + dx * t;
      const y = startPos.y + dy * t;

      // Ghostly afterimage particles
      for (let j = 0; j < 3; j++) {
        const perpAng = angle + Math.PI / 2;
        const offset = (Math.random() - 0.5) * 20;
        this.particles.push({
          pos: { x: x + Math.cos(perpAng) * offset, y: y + Math.sin(perpAng) * offset },
          vel: { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 },
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color: j === 0 ? color : (j === 1 ? '#aaccff' : '#ffffff'),
          size: 4 - j + Math.random()
        });
      }
    }

    // Speed lines from start point
    for (let i = 0; i < 12; i++) {
      const spreadAng = angle + (Math.random() - 0.5) * 0.6;
      const spd = 8 + Math.random() * 6;
      this.particles.push({
        pos: { ...startPos },
        vel: { x: Math.cos(spreadAng) * spd, y: Math.sin(spreadAng) * spd },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: '#ffffff',
        size: 2 + Math.random()
      });
    }

    // Arrival burst at end point
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const spd = 3 + Math.random() * 3;
      this.particles.push({
        pos: { ...endPos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: i % 2 === 0 ? color : '#ffffff',
        size: 3 + Math.random() * 2
      });
    }

    // Wispy trail remnants
    for (let i = 0; i < 8; i++) {
      const t = Math.random();
      this.particles.push({
        pos: { x: startPos.x + dx * t + (Math.random() - 0.5) * 15, y: startPos.y + dy * t + (Math.random() - 0.5) * 15 },
        vel: { x: (Math.random() - 0.5) * 1, y: -1 - Math.random() * 2 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#aaccff',
        size: 3 + Math.random() * 2
      });
    }

    // Small screen shake on dash
    this.triggerScreenShake(3, 6);
  }

  private spawnWeatherParticles() {
    // Only spawn weather particles periodically to avoid performance issues
    if (this.frameCount % 3 !== 0) return;

    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;
    const camX = this.camera.x;
    const camY = this.camera.y;

    // Sample biome at center of camera
    const centerBiome = this.world.getBiomeAt(camX + viewWidth / 2, camY + viewHeight / 2);

    // Weather effects based on biome
    if (centerBiome === 'SNOW' || centerBiome === 'TUNDRA') {
      // Snow particles
      for (let i = 0; i < 3; i++) {
        const x = camX + Math.random() * viewWidth;
        const y = camY - 20;
        this.particles.push({
          pos: { x, y },
          vel: { x: (Math.random() - 0.5) * 0.8, y: 1 + Math.random() * 1.5 },
          life: 180 + Math.random() * 60,
          maxLife: 240,
          color: '#ffffff',
          size: 2 + Math.random() * 2
        });
      }
    } else if (centerBiome === 'SWAMP' || centerBiome === 'JUNGLE') {
      // Fireflies / glowing particles
      if (Math.random() < 0.3) {
        const x = camX + Math.random() * viewWidth;
        const y = camY + Math.random() * viewHeight;
        this.particles.push({
          pos: { x, y },
          vel: { x: (Math.random() - 0.5) * 0.5, y: (Math.random() - 0.5) * 0.5 },
          life: 60 + Math.random() * 60,
          maxLife: 120,
          color: centerBiome === 'SWAMP' ? '#88ff44' : '#ffff44',
          size: 2 + Math.random()
        });
      }
    } else if (centerBiome === 'DESERT') {
      // Sand particles drifting
      if (Math.random() < 0.4) {
        const x = camX + Math.random() * viewWidth;
        const y = camY + Math.random() * viewHeight;
        this.particles.push({
          pos: { x, y },
          vel: { x: 1 + Math.random() * 2, y: (Math.random() - 0.3) * 0.5 },
          life: 90 + Math.random() * 60,
          maxLife: 150,
          color: '#d4a84b',
          size: 1 + Math.random() * 1.5
        });
      }
    } else if (centerBiome === 'VOLCANIC') {
      // Embers rising
      if (Math.random() < 0.4) {
        const x = camX + Math.random() * viewWidth;
        const y = camY + viewHeight + 20;
        this.particles.push({
          pos: { x, y },
          vel: { x: (Math.random() - 0.5) * 1, y: -2 - Math.random() * 2 },
          life: 90 + Math.random() * 60,
          maxLife: 150,
          color: Math.random() < 0.5 ? '#ff6600' : '#ff4400',
          size: 2 + Math.random() * 2
        });
      }
    } else if (centerBiome === 'SEA') {
      // Sea spray / bubbles
      if (Math.random() < 0.2) {
        const x = camX + Math.random() * viewWidth;
        const y = camY + viewHeight - 50 + Math.random() * 50;
        this.particles.push({
          pos: { x, y },
          vel: { x: (Math.random() - 0.5) * 0.5, y: -0.5 - Math.random() * 1 },
          life: 40 + Math.random() * 30,
          maxLife: 70,
          color: '#88ccff',
          size: 2 + Math.random() * 2
        });
      }
    } else if (centerBiome === 'FOREST' || centerBiome === 'ENCHANTED') {
      // Floating leaves / pollen
      if (Math.random() < 0.15) {
        const x = camX + Math.random() * viewWidth;
        const y = camY - 10;
        this.particles.push({
          pos: { x, y },
          vel: { x: 0.3 + Math.random() * 0.5, y: 0.5 + Math.random() * 0.8 },
          life: 120 + Math.random() * 80,
          maxLife: 200,
          color: centerBiome === 'ENCHANTED' ? '#ff88ff' : (Math.random() < 0.5 ? '#66aa44' : '#cc8844'),
          size: 2 + Math.random() * 2
        });
      }
    }
  }

  private spawnAmbientFireParticles() {
    // Only spawn fire particles periodically
    if (this.frameCount % 5 !== 0) return;

    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;
    const margin = 100;

    // Campfire embers and smoke
    this.campfires.forEach(cf => {
      // Check if campfire is in view
      if (cf.pos.x < this.camera.x - margin || cf.pos.x > this.camera.x + viewWidth + margin ||
          cf.pos.y < this.camera.y - margin || cf.pos.y > this.camera.y + viewHeight + margin) return;

      // Floating embers
      if (Math.random() < 0.6) {
        this.particles.push({
          pos: { x: cf.pos.x + (Math.random() - 0.5) * 20, y: cf.pos.y },
          vel: { x: (Math.random() - 0.5) * 1.5, y: -2 - Math.random() * 3 },
          life: 40 + Math.random() * 30,
          maxLife: 70,
          color: Math.random() < 0.3 ? '#ff6600' : (Math.random() < 0.5 ? '#ffcc00' : '#ff4400'),
          size: 1 + Math.random() * 2
        });
      }

      // Smoke particles
      if (Math.random() < 0.3) {
        this.particles.push({
          pos: { x: cf.pos.x + (Math.random() - 0.5) * 15, y: cf.pos.y - 10 },
          vel: { x: (Math.random() - 0.5) * 0.5, y: -0.8 - Math.random() * 0.8 },
          life: 80 + Math.random() * 40,
          maxLife: 120,
          color: '#666666',
          size: 4 + Math.random() * 4
        });
      }

      // Occasional spark burst
      if (Math.random() < 0.05) {
        for (let i = 0; i < 4; i++) {
          const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1;
          this.particles.push({
            pos: { x: cf.pos.x + (Math.random() - 0.5) * 10, y: cf.pos.y },
            vel: { x: Math.cos(ang) * (2 + Math.random() * 3), y: Math.sin(ang) * (2 + Math.random() * 3) },
            life: 20 + Math.random() * 15,
            maxLife: 35,
            color: '#ffff44',
            size: 1 + Math.random()
          });
        }
      }
    });

    // Torch flames
    this.torches.forEach(t => {
      if (t.pos.x < this.camera.x - margin || t.pos.x > this.camera.x + viewWidth + margin ||
          t.pos.y < this.camera.y - margin || t.pos.y > this.camera.y + viewHeight + margin) return;

      // Flame particles
      if (Math.random() < 0.5) {
        this.particles.push({
          pos: { x: t.pos.x + (Math.random() - 0.5) * 8, y: t.pos.y - 10 },
          vel: { x: (Math.random() - 0.5) * 1, y: -1.5 - Math.random() * 2 },
          life: 25 + Math.random() * 15,
          maxLife: 40,
          color: Math.random() < 0.5 ? '#ff6600' : '#ffcc00',
          size: 2 + Math.random() * 2
        });
      }

      // Small smoke
      if (Math.random() < 0.15) {
        this.particles.push({
          pos: { x: t.pos.x + (Math.random() - 0.5) * 5, y: t.pos.y - 15 },
          vel: { x: (Math.random() - 0.5) * 0.3, y: -0.5 - Math.random() * 0.5 },
          life: 40 + Math.random() * 20,
          maxLife: 60,
          color: '#888888',
          size: 2 + Math.random() * 2
        });
      }
    });
  }

  private spawnTownAmbientParticles() {
    // Only spawn town particles periodically
    if (this.frameCount % 8 !== 0) return;

    const townPos = this.town.pos;
    const distToTownSq = this.distSq({ x: this.camera.x + window.innerWidth / 2, y: this.camera.y + window.innerHeight / 2 }, townPos);

    // Only spawn if camera is near town
    if (distToTownSq > 500 * 500) return;

    // Chimney smoke from town buildings
    if (Math.random() < 0.4) {
      const offsetX = (Math.random() - 0.5) * 200;
      const offsetY = (Math.random() - 0.5) * 200;
      this.particles.push({
        pos: { x: townPos.x + offsetX, y: townPos.y + offsetY - 30 },
        vel: { x: (Math.random() - 0.5) * 0.3, y: -0.6 - Math.random() * 0.4 },
        life: 80 + Math.random() * 40,
        maxLife: 120,
        color: '#aaaaaa',
        size: 3 + Math.random() * 3
      });
    }

    // Market activity sparkles
    if (Math.random() < 0.3) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * 150;
      this.particles.push({
        pos: { x: townPos.x + Math.cos(ang) * dist, y: townPos.y + Math.sin(ang) * dist },
        vel: { x: (Math.random() - 0.5) * 1, y: -1 - Math.random() * 1.5 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: Math.random() < 0.5 ? '#ffd700' : '#ffee88',
        size: 1 + Math.random() * 1.5
      });
    }

    // Wandering dust motes
    if (Math.random() < 0.2) {
      const offsetX = (Math.random() - 0.5) * 250;
      const offsetY = (Math.random() - 0.5) * 250;
      this.particles.push({
        pos: { x: townPos.x + offsetX, y: townPos.y + offsetY },
        vel: { x: 0.5 + Math.random() * 0.5, y: (Math.random() - 0.5) * 0.3 },
        life: 60 + Math.random() * 40,
        maxLife: 100,
        color: '#ccaa88',
        size: 1 + Math.random()
      });
    }

    // Occasional banner flutter particles (colorful)
    if (Math.random() < 0.15) {
      const colors = ['#ff4444', '#4444ff', '#44ff44', '#ffff44', '#ff44ff'];
      this.particles.push({
        pos: { x: townPos.x + (Math.random() - 0.5) * 180, y: townPos.y + (Math.random() - 0.5) * 50 - 40 },
        vel: { x: 1 + Math.random() * 1.5, y: (Math.random() - 0.5) * 0.5 },
        life: 40 + Math.random() * 20,
        maxLife: 60,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random()
      });
    }
  }

  private addDamageNumber(pos: Vec2, val: number, isCrit: boolean, text?: string) {
    this.damageNumbers.push({ id: this.nextId++, pos: {...pos}, value: Math.floor(val), color: isCrit ? '#ffcc00' : '#fff', life: 45, maxLife: 45, isCrit, text });
    // Extra particles for critical hits
    if (isCrit && val > 0) {
      this.createCritParticles(pos);
    }
  }

  private createCritParticles(pos: Vec2) {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const spd = 3 + Math.random() * 3;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 2 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#ffcc00',
        size: 2 + Math.random() * 2
      });
    }
    // Starburst effect
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 8, y: Math.sin(ang) * 8 },
        life: 10,
        maxLife: 10,
        color: '#ffffff',
        size: 3
      });
    }
  }

  public createHealEffect(pos: Vec2, amount: number) {
    const count = Math.min(15, 5 + Math.floor(amount / 10));
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * 20;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: (Math.random() - 0.5) * 2, y: -2 - Math.random() * 3 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#00ff88',
        size: 2 + Math.random() * 3
      });
    }
    // Rising cross/plus effect
    for (let i = 0; i < 4; i++) {
      const offsets = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
      const off = offsets[i];
      this.particles.push({
        pos: { x: pos.x + off.x * 8, y: pos.y + off.y * 8 },
        vel: { x: off.x * 0.5, y: -3 + off.y * 0.5 },
        life: 20,
        maxLife: 20,
        color: '#88ffaa',
        size: 4
      });
    }
  }

  private createFootstepDust(pos: Vec2, color: string) {
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const offsetX = (Math.random() - 0.5) * 8;
      const offsetY = Math.random() * 4;
      this.particles.push({
        pos: { x: pos.x + offsetX, y: pos.y + PLAYER_RADIUS + offsetY },
        vel: { x: (Math.random() - 0.5) * 1.5, y: -0.5 - Math.random() * 1 },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color,
        size: 1 + Math.random() * 1.5
      });
    }
  }

  private createCoinPickupEffect(pos: Vec2, value: number) {
    // Golden sparkles
    const count = 6 + Math.floor(value / 20);
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 3;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 2 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: i % 2 === 0 ? '#ffd700' : '#ffee88',
        size: 2 + Math.random() * 2
      });
    }
    // Rising sparkle trail
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 10, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -4 - Math.random() * 2 },
        life: 20 + i * 3,
        maxLife: 32,
        color: '#ffffff',
        size: 2
      });
    }
  }

  private createChestOpenEffect(pos: Vec2, rewardType: string) {
    // Treasure chest lid opening burst
    for (let i = 0; i < 8; i++) {
      const ang = Math.PI * (0.9 + Math.random() * 0.2);
      const spd = 3 + Math.random() * 3;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y - 10 },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#8B4513',
        size: 3 + Math.random() * 2
      });
    }
    // Golden light column eruption
    for (let i = 0; i < 25; i++) {
      const xOff = (Math.random() - 0.5) * 30;
      this.particles.push({
        pos: { x: pos.x + xOff, y: pos.y },
        vel: { x: xOff * 0.05, y: -6 - Math.random() * 5 },
        life: 35 + Math.random() * 25,
        maxLife: 60,
        color: i % 3 === 0 ? '#ffffff' : '#ffd700',
        size: 2 + Math.random() * 3
      });
    }
    // Treasure sparkles radiating outward
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2;
      const spd = 2 + Math.random() * 4;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#ffee88',
        size: 2 + Math.random() * 2
      });
    }
    // Reward-specific colored particles
    const rewardColors: Record<string, string> = {
      gold: '#ffd700',
      hp: '#ff4488',
      damage: '#ff6644',
      speed: '#44ddff'
    };
    const rewardColor = rewardColors[rewardType] || '#ffd700';
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y - 5 },
        vel: { x: Math.cos(ang) * 3, y: -4 + Math.sin(ang) * 2 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: rewardColor,
        size: 3 + Math.random() * 2
      });
    }
    // Central white flash
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 7, y: Math.sin(ang) * 7 },
        life: 10,
        maxLife: 10,
        color: '#ffffff',
        size: 4
      });
    }
    // Gentle screen shake
    this.triggerScreenShake(4, 10);
  }

  private createPowerUpEffect(pos: Vec2, color: string, type: string) {
    // Spiral ascending particles
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 4;
      const radius = 5 + i * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * 5 },
        vel: { x: Math.cos(ang) * 1.5, y: -3 - Math.random() * 2 },
        life: 30 + i * 2,
        maxLife: 50,
        color,
        size: 3 - i * 0.1
      });
    }
    // Central burst
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 5, y: Math.sin(ang) * 5 },
        life: 20,
        maxLife: 20,
        color: '#ffffff',
        size: 3
      });
    }
    // Outer ring
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * 30, y: pos.y + Math.sin(ang) * 30 },
        vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 },
        life: 25,
        maxLife: 25,
        color,
        size: 4
      });
    }
    this.triggerScreenShake(4, 10);
  }

  private createMountEffect(pos: Vec2, mountType: MountType) {
    const mountColors: Record<MountType, string> = {
      HORSE: '#8B4513',
      CHARIOT: '#cd853f',
      DRAGON: '#ff4400',
      BOAT: '#4488aa'
    };
    const color = mountColors[mountType];
    // Swirling mounting particles
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const spd = 2 + Math.random() * 3;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 1 },
        life: 18 + Math.random() * 10,
        maxLife: 28,
        color,
        size: 2 + Math.random() * 2
      });
    }
    // Ground dust from jump
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 30, y: pos.y + 10 },
        vel: { x: Math.cos(ang) * 2, y: -1 - Math.random() * 2 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#aa9977',
        size: 3 + Math.random() * 2
      });
    }
    // Upward sparkles for successful mount
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 2, y: -4 - Math.random() * 3 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#ffffff',
        size: 2
      });
    }
    // Dragon mount gets extra fire effect
    if (mountType === 'DRAGON') {
      for (let i = 0; i < 12; i++) {
        const ang = Math.random() * Math.PI * 2;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * 4, y: Math.sin(ang) * 4 - 2 },
          life: 20 + Math.random() * 15,
          maxLife: 35,
          color: i % 2 === 0 ? '#ff6600' : '#ffcc00',
          size: 3 + Math.random() * 3
        });
      }
      this.triggerScreenShake(5, 8);
    }
  }

  private createDismountEffect(pos: Vec2, mountType: MountType) {
    const mountColors: Record<MountType, string> = {
      HORSE: '#8B4513',
      CHARIOT: '#cd853f',
      DRAGON: '#ff4400',
      BOAT: '#4488aa'
    };
    const color = mountColors[mountType];
    // Landing dust impact
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const spd = 3 + Math.random() * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * 10, y: pos.y + 8 },
        vel: { x: Math.cos(ang) * spd, y: -0.5 + Math.sin(ang) * spd * 0.3 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#aa9977',
        size: 2 + Math.random() * 2
      });
    }
    // Colored particles dispersing
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 3, y: Math.sin(ang) * 3 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color,
        size: 2 + Math.random() * 2
      });
    }
    // Water splash for boat dismount
    if (mountType === 'BOAT') {
      for (let i = 0; i < 15; i++) {
        const ang = Math.PI * (0.6 + Math.random() * 0.8);
        this.particles.push({
          pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y },
          vel: { x: Math.cos(ang) * 3, y: Math.sin(ang) * 4 },
          life: 20 + Math.random() * 15,
          maxLife: 35,
          color: i % 2 === 0 ? '#66aadd' : '#88ccff',
          size: 2 + Math.random() * 2
        });
      }
    }
    // Dragon dismount fire trail
    if (mountType === 'DRAGON') {
      for (let i = 0; i < 8; i++) {
        this.particles.push({
          pos: { x: pos.x + (Math.random() - 0.5) * 30, y: pos.y - 20 + Math.random() * 40 },
          vel: { x: (Math.random() - 0.5) * 2, y: 2 + Math.random() * 2 },
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color: '#ff4400',
          size: 3 + Math.random() * 2
        });
      }
    }
  }

  private createShieldBlockEffect(pos: Vec2, incomingVel: Vec2) {
    const hitAngle = Math.atan2(incomingVel.y, incomingVel.x);
    const impactPos = { x: pos.x + Math.cos(hitAngle + Math.PI) * 15, y: pos.y + Math.sin(hitAngle + Math.PI) * 15 };

    // Shield ring flash
    for (let i = 0; i < 12; i++) {
      const ang = hitAngle + Math.PI + (i - 6) * 0.15;
      const spd = 4 + Math.random() * 3;
      this.particles.push({
        pos: { ...impactPos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: i % 2 === 0 ? '#4df4ff' : '#88ffff',
        size: 2 + Math.random() * 2
      });
    }

    // Expanding ripple rings
    for (let ring = 0; ring < 3; ring++) {
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const baseRadius = 10 + ring * 12;
        this.particles.push({
          pos: { x: impactPos.x + Math.cos(ang) * baseRadius, y: impactPos.y + Math.sin(ang) * baseRadius },
          vel: { x: Math.cos(ang) * (3 + ring), y: Math.sin(ang) * (3 + ring) },
          life: 12 + ring * 4,
          maxLife: 24,
          color: ring === 0 ? '#ffffff' : ring === 1 ? '#88ffff' : '#4df4ff',
          size: 3 - ring
        });
      }
    }

    // Central impact flash
    this.particles.push({
      pos: { ...impactPos },
      vel: { x: 0, y: 0 },
      life: 10,
      maxLife: 10,
      color: '#ffffff',
      size: 10
    });

    // Energy absorption effect - particles flowing into shield
    for (let i = 0; i < 10; i++) {
      const ang = hitAngle + (Math.random() - 0.5) * 1;
      const dist = 40 + Math.random() * 30;
      this.particles.push({
        pos: { x: impactPos.x + Math.cos(ang) * dist, y: impactPos.y + Math.sin(ang) * dist },
        vel: { x: -Math.cos(ang) * 5, y: -Math.sin(ang) * 5 },
        life: 12 + Math.random() * 6,
        maxLife: 18,
        color: '#aaddff',
        size: 2 + Math.random()
      });
    }

    // Deflection sparks
    for (let i = 0; i < 8; i++) {
      const deflectAng = hitAngle + Math.PI + (Math.random() - 0.5) * 1.5;
      const spd = 6 + Math.random() * 5;
      this.particles.push({
        pos: { ...impactPos },
        vel: { x: Math.cos(deflectAng) * spd, y: Math.sin(deflectAng) * spd },
        life: 10 + Math.random() * 5,
        maxLife: 15,
        color: '#ffffff',
        size: 2
      });
    }

    // Small screen shake on block
    this.triggerScreenShake(2, 5);
  }

  private createMagicCastEffect(pos: Vec2, angle: number, element: MagicElement) {
    const color = MAGIC_ELEMENT_COLORS[element] || '#cc33ff';
    // Burst in cast direction
    for (let i = 0; i < 12; i++) {
      const spread = (Math.random() - 0.5) * 0.8;
      const spd = 5 + Math.random() * 4;
      this.particles.push({
        pos: { x: pos.x + Math.cos(angle) * 15, y: pos.y + Math.sin(angle) * 15 },
        vel: { x: Math.cos(angle + spread) * spd, y: Math.sin(angle + spread) * spd },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color,
        size: 3 + Math.random() * 2
      });
    }
    // Ring around caster
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * 20, y: pos.y + Math.sin(ang) * 20 },
        vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 },
        life: 12,
        maxLife: 12,
        color: '#ffffff',
        size: 2
      });
    }
    this.triggerScreenShake(2, 5);
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
      this.createLevelUpCelebration(this.playerPositions[pIdx], p.color);
    }
  }

  private createLevelUpCelebration(pos: Vec2, color: string) {
    // Multi-layer radial burst with staggered timing
    for (let layer = 0; layer < 3; layer++) {
      const burstCount = 16 + layer * 8;
      for (let i = 0; i < burstCount; i++) {
        const ang = (i / burstCount) * Math.PI * 2 + layer * 0.1;
        const spd = 4 + layer * 2 + Math.random() * 3;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 25 + layer * 10 + Math.random() * 15,
          maxLife: 50,
          color: layer === 0 ? '#ffffff' : layer === 1 ? '#00ff44' : color,
          size: 4 - layer + Math.random() * 2
        });
      }
    }
    // Starburst effect - 8 pointed star
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      for (let j = 0; j < 5; j++) {
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * (6 + j * 2), y: Math.sin(ang) * (6 + j * 2) },
          life: 12 + j * 3,
          maxLife: 27,
          color: '#ffff44',
          size: 3
        });
      }
    }
    // Rising sparkles with spiral motion
    for (let i = 0; i < 25; i++) {
      const spiralAng = (i / 25) * Math.PI * 4;
      const offset = Math.sin(spiralAng) * 20;
      this.particles.push({
        pos: { x: pos.x + offset, y: pos.y },
        vel: { x: Math.cos(spiralAng) * 1.5, y: -5 - Math.random() * 4 },
        life: 45 + Math.random() * 25,
        maxLife: 70,
        color: i % 3 === 0 ? '#ffff88' : i % 3 === 1 ? '#88ffaa' : '#ffffff',
        size: 2 + Math.random() * 2
      });
    }
    // Expanding rings
    for (let ring = 0; ring < 3; ring++) {
      for (let i = 0; i < 20; i++) {
        const ang = (i / 20) * Math.PI * 2;
        const baseRadius = 15 + ring * 15;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * baseRadius, y: pos.y + Math.sin(ang) * baseRadius },
          vel: { x: Math.cos(ang) * (4 + ring), y: Math.sin(ang) * (4 + ring) },
          life: 15 + ring * 5,
          maxLife: 30,
          color: ring === 0 ? '#00ff88' : ring === 1 ? '#88ff88' : '#ffffff',
          size: 3
        });
      }
    }
    // Golden confetti falling
    for (let i = 0; i < 15; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 60, y: pos.y - 30 - Math.random() * 20 },
        vel: { x: (Math.random() - 0.5) * 3, y: 1 + Math.random() * 2 },
        life: 60 + Math.random() * 30,
        maxLife: 90,
        color: i % 2 === 0 ? '#ffd700' : '#ffee88',
        size: 3 + Math.random() * 2
      });
    }
    // Screen shake for celebration
    this.triggerScreenShake(6, 15);
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

  private distSq(v1: Vec2, v2: Vec2) { return (v1.x-v2.x)**2 + (v1.y-v2.y)**2; }

  private isInSimRange(pos: Vec2, margin: number = 600): boolean {
    return pos.x >= this.camera.x - margin &&
           pos.x <= this.camera.x + window.innerWidth + margin &&
           pos.y >= this.camera.y - margin &&
           pos.y <= this.camera.y + window.innerHeight + margin;
  }

  private createSiegeStartEffect(pos: Vec2, enemyAttack: boolean) {
    const color = enemyAttack ? '#ff4444' : '#ffaa00';

    // Warning pulses expanding outward
    for (let ring = 0; ring < 4; ring++) {
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const radius = 40 + ring * 30;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
          vel: { x: Math.cos(ang) * (5 + ring), y: Math.sin(ang) * (5 + ring) },
          life: 20 + ring * 5,
          maxLife: 40,
          color: ring % 2 === 0 ? color : '#ffffff',
          size: 4 - ring * 0.5
        });
      }
    }

    // Rising war banners effect
    for (let i = 0; i < 15; i++) {
      const ang = (i / 15) * Math.PI * 2;
      const dist = 60;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: 0, y: -4 - Math.random() * 3 },
        life: 50 + Math.random() * 30,
        maxLife: 80,
        color,
        size: 4 + Math.random() * 2
      });
    }

    // Ground crack effect
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      for (let j = 0; j < 5; j++) {
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * (20 + j * 15), y: pos.y + Math.sin(ang) * (20 + j * 15) },
          vel: { x: Math.cos(ang) * (1 + j * 0.5), y: Math.sin(ang) * (1 + j * 0.5) },
          life: 25 + j * 5,
          maxLife: 50,
          color: '#8B4513',
          size: 3 + Math.random() * 2
        });
      }
    }

    // Heavy screen shake
    this.triggerScreenShake(12, 20);
  }

  private createCastleCaptureEffect(pos: Vec2) {
    // Victory explosion
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < 30; i++) {
        const ang = (i / 30) * Math.PI * 2 + layer * 0.1;
        const spd = 6 + layer * 3 + Math.random() * 3;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 35 + layer * 10,
          maxLife: 55,
          color: layer === 0 ? '#ffffff' : layer === 1 ? '#4d99ff' : '#88ccff',
          size: 5 - layer + Math.random() * 2
        });
      }
    }

    // Blue banner rising
    for (let i = 0; i < 20; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 80, y: pos.y + 20 },
        vel: { x: (Math.random() - 0.5) * 2, y: -5 - Math.random() * 4 },
        life: 60 + Math.random() * 30,
        maxLife: 90,
        color: i % 2 === 0 ? '#4d99ff' : '#ffffff',
        size: 3 + Math.random() * 3
      });
    }

    // Confetti celebration
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 100, y: pos.y - 50 + Math.random() * 50 },
        vel: { x: Math.cos(ang) * 2, y: 1 + Math.random() * 2 },
        life: 80 + Math.random() * 40,
        maxLife: 120,
        color: ['#4d99ff', '#ffd700', '#ffffff', '#88ccff'][Math.floor(Math.random() * 4)],
        size: 2 + Math.random() * 2
      });
    }

    // Expanding rings
    for (let ring = 0; ring < 3; ring++) {
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const radius = 30 + ring * 25;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
          vel: { x: Math.cos(ang) * (4 + ring * 2), y: Math.sin(ang) * (4 + ring * 2) },
          life: 18 + ring * 6,
          maxLife: 36,
          color: '#4d99ff',
          size: 4
        });
      }
    }

    // Big celebration screen shake
    this.triggerScreenShake(10, 18);
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
    if (this.buildMode === 'TOWER') {
      const cfg = WALL_CONFIGS.TOWER;
      this.towers.push({ id: this.nextId++, pos, hp: cfg.hp, maxHp: cfg.hp, height: WALL_HEIGHT,
        range: cfg.range, damage: cfg.damage, cooldown: 0, maxCooldown: cfg.cooldown, level: 1 });
    } else {
      const cfg = WALL_CONFIGS[this.buildMode];
      this.walls.push({ id: this.nextId++, pos, type: this.buildMode, hp: cfg.hp, maxHp: cfg.hp,
        height: WALL_HEIGHT, rotation: this.buildRotation, isOpen: false });
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
    this.createSiegeStartEffect(castle.pos, enemyAttacks);
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
            this.createCastleCaptureEffect(castle.pos);
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
      color: config.color
    });

    this.createAllySpawnEffect(pos, config.color, t);
  }

  private createAllySpawnEffect(pos: Vec2, color: string, type: string) {
    // Magic summoning circle
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const radius = 20;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 },
        life: 20,
        maxLife: 20,
        color,
        size: 3
      });
    }
    // Rising sparkles
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 2, y: -3 - Math.random() * 3 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: i % 2 === 0 ? color : '#ffffff',
        size: 2 + Math.random() * 2
      });
    }
    // Type-specific effect
    if (type === 'MAGE') {
      // Magic runes
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * 30, y: pos.y + Math.sin(ang) * 30 },
          vel: { x: 0, y: -2 },
          life: 30,
          maxLife: 30,
          color: '#cc33ff',
          size: 4
        });
      }
    } else if (type === 'KNIGHT') {
      // Golden flash
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * 5, y: Math.sin(ang) * 5 },
          life: 15,
          maxLife: 15,
          color: '#ffd700',
          size: 4
        });
      }
    }
  }

  private createStructureDestructionEffect(pos: Vec2, width: number, height: number, color: string, isTower: boolean) {
    // Large debris particles flying outward
    const debrisCount = isTower ? 25 : 15;
    for (let i = 0; i < debrisCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 6;
      const offsetX = (Math.random() - 0.5) * width;
      const offsetY = (Math.random() - 0.5) * height;
      this.particles.push({
        pos: { x: pos.x + offsetX, y: pos.y + offsetY },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 2 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: i % 3 === 0 ? '#5c4033' : color,
        size: 3 + Math.random() * 4
      });
    }
    // Dust cloud
    const dustCount = isTower ? 20 : 12;
    for (let i = 0; i < dustCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * (isTower ? 25 : 15);
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: (Math.random() - 0.5) * 3, y: -1 - Math.random() * 2 },
        life: 40 + Math.random() * 20,
        maxLife: 60,
        color: '#8b7355',
        size: 4 + Math.random() * 4
      });
    }
    // Ground impact ring
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const radius = isTower ? 20 : 15;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang) * 4, y: Math.sin(ang) * 4 },
        life: 15,
        maxLife: 15,
        color: '#a0826d',
        size: 3
      });
    }
    // White flash at center
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 6, y: Math.sin(ang) * 6 },
        life: 8,
        maxLife: 8,
        color: '#ffffff',
        size: 4
      });
    }
    // Falling debris (gravity affected look)
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * width, y: pos.y - height * 0.3 },
        vel: { x: (Math.random() - 0.5) * 2, y: 2 + Math.random() * 3 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: color,
        size: 2 + Math.random() * 3
      });
    }
    // Screen shake - bigger for towers
    this.triggerScreenShake(isTower ? 10 : 6, isTower ? 15 : 10);
  }

  private updateAllies() {
    this.allies.forEach(ally => {
      if (!this.isInSimRange(ally.pos, 800)) return;

      ally.cooldown--;
      const cfg = ALLY_CONFIGS[ally.type];

      // Find nearest player to potentially follow
      let nearestPlayer: { idx: number; dist: number } | null = null;
      this.playerPositions.forEach((pp, i) => {
        if (this.players[i].isDead) return;
        const d = Math.sqrt(this.distSq(ally.pos, pp));
        if (d < 400 && (!nearestPlayer || d < nearestPlayer.dist)) {
          nearestPlayer = { idx: i, dist: d };
        }
      });

      // Decide behavior
      if (nearestPlayer && nearestPlayer.dist < 200) {
        ally.behavior = 'FOLLOW';
        ally.followPlayerId = nearestPlayer.idx;
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
      if (targetEnemy) {
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

    this.allies = this.allies.filter(a => {
      if (a.hp <= 0) {
        this.createExplosion(a.pos, a.color, 15, 3, 5);
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

  private createCriticalHitEffect(pos: Vec2, damage: number) {
    // Golden starburst explosion
    const starPoints = 16;
    for (let i = 0; i < starPoints; i++) {
      const ang = (i / starPoints) * Math.PI * 2;
      const spd = 6 + Math.random() * 4;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#ffd700',
        size: 4 + Math.random() * 2
      });
    }

    // Inner white flash
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 3;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 8 + Math.random() * 6,
        maxLife: 14,
        color: '#ffffff',
        size: 3 + Math.random() * 2
      });
    }

    // Sparkle trails outward
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 10 + Math.random() * 20;
      const spd = 2 + Math.random() * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 1 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#ffee88',
        size: 2 + Math.random()
      });
    }

    // Ascending golden sparks based on damage
    const sparkCount = Math.min(Math.floor(damage / 10), 12);
    for (let i = 0; i < sparkCount; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 3, y: -4 - Math.random() * 4 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#ffa500',
        size: 2 + Math.random() * 2
      });
    }

    // Small screen shake for impact
    this.triggerScreenShake(4, 8);
  }

  private createResourcePickupTrail(pos: Vec2, targetPos: Vec2, resourceType: string) {
    const dx = targetPos.x - pos.x;
    const dy = targetPos.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(5, Math.floor(dist / 20));

    // Color based on resource type
    const colors: Record<string, string[]> = {
      coin: ['#ffd700', '#ffee88', '#ffffff'],
      health: ['#ff4444', '#ff8888', '#ffcccc'],
      mana: ['#4488ff', '#88ccff', '#ccffff'],
      xp: ['#44ff44', '#88ff88', '#ccffcc']
    };
    const colorSet = colors[resourceType] || colors.coin;

    // Trail particles along the arc
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Create arc trajectory
      const arcHeight = dist * 0.3 * Math.sin(t * Math.PI);
      const x = pos.x + dx * t;
      const y = pos.y + dy * t - arcHeight;

      // Main trail particles
      for (let j = 0; j < 2; j++) {
        this.particles.push({
          pos: { x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8 },
          vel: { x: (Math.random() - 0.5) * 1, y: -1 - Math.random() },
          life: 15 + Math.random() * 10 + (steps - i) * 2,
          maxLife: 35,
          color: colorSet[Math.floor(Math.random() * colorSet.length)],
          size: 3 + Math.random() * 2
        });
      }
    }

    // Sparkle burst at collection point
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const spd = 2 + Math.random() * 2;
      this.particles.push({
        pos: { ...targetPos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: colorSet[0],
        size: 2 + Math.random()
      });
    }

    // Ascending "+1" style particles
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        pos: { x: targetPos.x + (Math.random() - 0.5) * 15, y: targetPos.y },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -2.5 - Math.random() },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#ffffff',
        size: 2 + Math.random()
      });
    }
  }

  private createComboFeedbackEffect(pos: Vec2, comboCount: number, color: string) {
    // Intensity scales with combo
    const intensity = Math.min(comboCount / 10, 2);

    // Combo ring burst
    const ringPoints = 16 + Math.floor(comboCount / 2);
    for (let i = 0; i < ringPoints; i++) {
      const ang = (i / ringPoints) * Math.PI * 2;
      const spd = 4 + intensity * 3;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 15 + intensity * 10,
        maxLife: 25 + intensity * 10,
        color,
        size: 3 + intensity
      });
    }

    // Inner power glow
    for (let i = 0; i < 8 + comboCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 10 + Math.random() * 10,
        maxLife: 20,
        color: '#ffffff',
        size: 2 + Math.random() * intensity
      });
    }

    // Energy streaks based on combo multiplier
    if (comboCount >= 5) {
      const streakCount = Math.min(Math.floor(comboCount / 5), 6);
      for (let i = 0; i < streakCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 20 + Math.random() * 30;
        const targetAng = ang + Math.PI;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
          vel: { x: Math.cos(targetAng) * 6, y: Math.sin(targetAng) * 6 },
          life: 12 + Math.random() * 8,
          maxLife: 20,
          color: comboCount >= 15 ? '#ffd700' : color,
          size: 4 + Math.random() * 2
        });
      }
    }

    // Combo milestone effects
    if (comboCount === 10 || comboCount === 25 || comboCount === 50) {
      // Multi-ring explosion for milestones
      for (let ring = 0; ring < 3; ring++) {
        for (let i = 0; i < 20; i++) {
          const ang = (i / 20) * Math.PI * 2;
          const spd = 5 + ring * 3;
          this.particles.push({
            pos: { ...pos },
            vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
            life: 20 + ring * 5,
            maxLife: 35,
            color: ring === 0 ? '#ffffff' : (ring === 1 ? '#ffd700' : color),
            size: 5 - ring + Math.random() * 2
          });
        }
      }

      // Ascending celebration sparks
      for (let i = 0; i < 20; i++) {
        this.particles.push({
          pos: { x: pos.x + (Math.random() - 0.5) * 40, y: pos.y },
          vel: { x: (Math.random() - 0.5) * 4, y: -5 - Math.random() * 5 },
          life: 35 + Math.random() * 25,
          maxLife: 60,
          color: ['#ffd700', '#ffffff', color][Math.floor(Math.random() * 3)],
          size: 3 + Math.random() * 2
        });
      }

      this.triggerScreenShake(6, 15);
    }
  }

  private createHazardWarningEffect(pos: Vec2, radius: number, hazardType: string) {
    // Pulsing danger ring
    for (let pulse = 0; pulse < 3; pulse++) {
      const pulseDelay = pulse * 5;
      for (let i = 0; i < 32; i++) {
        const ang = (i / 32) * Math.PI * 2;
        const r = radius * (0.8 + pulse * 0.2);
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
          vel: { x: Math.cos(ang) * (1 + pulse * 0.5), y: Math.sin(ang) * (1 + pulse * 0.5) },
          life: 20 + pulseDelay,
          maxLife: 30,
          color: hazardType === 'fire' ? '#ff4400' : (hazardType === 'poison' ? '#44ff00' : '#ff0000'),
          size: 3 - pulse * 0.5
        });
      }
    }

    // Warning exclamation particles rising
    for (let i = 0; i < 8; i++) {
      const offsetX = (Math.random() - 0.5) * radius;
      this.particles.push({
        pos: { x: pos.x + offsetX, y: pos.y },
        vel: { x: offsetX * 0.02, y: -3 - Math.random() * 2 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#ffff00',
        size: 4 + Math.random() * 2
      });
    }

    // Ground shimmer effect
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius * 0.8;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: (Math.random() - 0.5) * 1, y: -1 - Math.random() * 2 },
        life: 15 + Math.random() * 20,
        maxLife: 35,
        color: '#ffaa00',
        size: 2 + Math.random() * 2
      });
    }
  }

  private createRevivalEffect(pos: Vec2, playerColor: string) {
    // Angelic light beam descending
    for (let i = 0; i < 20; i++) {
      const x = pos.x + (Math.random() - 0.5) * 30;
      this.particles.push({
        pos: { x, y: pos.y - 100 - Math.random() * 50 },
        vel: { x: (Math.random() - 0.5) * 0.5, y: 4 + Math.random() * 2 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#ffffff',
        size: 3 + Math.random() * 2
      });
    }

    // Golden revival ring expanding
    for (let ring = 0; ring < 3; ring++) {
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const spd = 3 + ring * 2;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 20 + ring * 8,
          maxLife: 36 + ring * 8,
          color: ring === 0 ? '#ffffff' : (ring === 1 ? '#ffd700' : playerColor),
          size: 4 - ring + Math.random()
        });
      }
    }

    // Soul particles reforming (converging inward)
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 40;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: -Math.cos(ang) * 3, y: -Math.sin(ang) * 3 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: playerColor,
        size: 3 + Math.random() * 2
      });
    }

    // Rising hope sparkles
    for (let i = 0; i < 15; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 40, y: pos.y + (Math.random() - 0.5) * 20 },
        vel: { x: (Math.random() - 0.5) * 2, y: -2 - Math.random() * 3 },
        life: 35 + Math.random() * 25,
        maxLife: 60,
        color: '#ffee88',
        size: 2 + Math.random()
      });
    }

    // Gentle screen shake
    this.triggerScreenShake(4, 12);
  }

  private createFactionBannerClaimEffect(pos: Vec2, factionColor: string) {
    // Banner unfurling - vertical cascade
    for (let i = 0; i < 30; i++) {
      const delay = Math.floor(i / 3);
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y - 40 },
        vel: { x: (Math.random() - 0.5) * 1, y: 2 + Math.random() * 2 },
        life: 25 + delay * 3 + Math.random() * 10,
        maxLife: 50,
        color: factionColor,
        size: 4 + Math.random() * 2
      });
    }

    // Territorial burst ring
    for (let i = 0; i < 40; i++) {
      const ang = (i / 40) * Math.PI * 2;
      const spd = 4 + Math.random() * 3;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: i % 2 === 0 ? factionColor : '#ffffff',
        size: 3 + Math.random() * 2
      });
    }

    // Victory confetti
    const confettiColors = [factionColor, '#ffffff', '#ffd700'];
    for (let i = 0; i < 25; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 4;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 30, y: pos.y - 20 },
        vel: { x: Math.cos(ang) * spd, y: -2 - Math.random() * 3 },
        life: 40 + Math.random() * 30,
        maxLife: 70,
        color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
        size: 2 + Math.random() * 2
      });
    }

    // Ground claim pulse
    for (let ring = 0; ring < 2; ring++) {
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const radius = 30 + ring * 25;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
          vel: { x: Math.cos(ang) * 1.5, y: Math.sin(ang) * 1.5 },
          life: 20 + ring * 10,
          maxLife: 35,
          color: factionColor,
          size: 3 - ring
        });
      }
    }

    this.triggerScreenShake(5, 12);
  }

  private createAllyBuffAuraEffect(pos: Vec2, buffType: string) {
    // Buff-specific colors
    const buffColors: Record<string, string[]> = {
      attack: ['#ff4444', '#ff8888', '#ffcccc'],
      defense: ['#4488ff', '#88aaff', '#aaccff'],
      speed: ['#ffff44', '#ffff88', '#ffffcc'],
      heal: ['#44ff44', '#88ff88', '#aaffaa'],
      mana: ['#aa44ff', '#cc88ff', '#ddaaff']
    };
    const colors = buffColors[buffType] || buffColors.attack;

    // Rotating aura particles
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const radius = 20;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang + Math.PI / 2) * 2, y: Math.sin(ang + Math.PI / 2) * 2 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: colors[0],
        size: 3 + Math.random()
      });
    }

    // Rising buff energy
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 30, y: pos.y + 10 },
        vel: { x: (Math.random() - 0.5) * 1, y: -2 - Math.random() * 2 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: colors[1],
        size: 2 + Math.random() * 2
      });
    }

    // Inner glow pulse
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random();
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: colors[2],
        size: 2 + Math.random()
      });
    }
  }

  private createPortalActivationEffect(pos: Vec2, portalColor: string, isEntry: boolean) {
    // Swirling vortex particles
    for (let i = 0; i < 30; i++) {
      const ang = (i / 30) * Math.PI * 2;
      const radius = 15 + Math.random() * 25;
      const rotSpeed = isEntry ? 3 : -3;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang + Math.PI / 2) * rotSpeed, y: Math.sin(ang + Math.PI / 2) * rotSpeed },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: portalColor,
        size: 3 + Math.random() * 2
      });
    }

    // Central energy implosion/explosion
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = isEntry ? 40 : 0;
      const targetDist = isEntry ? 0 : 40;
      const speed = 4;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: {
          x: isEntry ? -Math.cos(ang) * speed : Math.cos(ang) * speed,
          y: isEntry ? -Math.sin(ang) * speed : Math.sin(ang) * speed
        },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#ffffff',
        size: 2 + Math.random() * 2
      });
    }

    // Arcane runes orbiting
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const radius = 35;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang + Math.PI / 2) * 2, y: Math.sin(ang + Math.PI / 2) * 2 - 1 },
        life: 30 + Math.random() * 10,
        maxLife: 40,
        color: '#aa88ff',
        size: 4 + Math.random()
      });
    }

    // Dimensional shimmer
    for (let i = 0; i < 12; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 50, y: pos.y + (Math.random() - 0.5) * 50 },
        vel: { x: (Math.random() - 0.5) * 2, y: -1 - Math.random() * 2 },
        life: 20 + Math.random() * 20,
        maxLife: 40,
        color: i % 2 === 0 ? portalColor : '#ccccff',
        size: 2 + Math.random()
      });
    }

    this.triggerScreenShake(3, 8);
  }

  private createBulletDeflectionEffect(pos: Vec2, incomingDir: Vec2, outgoingDir: Vec2) {
    // Impact flash
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 3;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 8 + Math.random() * 6,
        maxLife: 14,
        color: '#ffffff',
        size: 2 + Math.random() * 2
      });
    }

    // Incoming trail sparks
    const inAng = Math.atan2(incomingDir.y, incomingDir.x);
    for (let i = 0; i < 6; i++) {
      const spreadAng = inAng + (Math.random() - 0.5) * 0.5;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(spreadAng) * 4, y: Math.sin(spreadAng) * 4 },
        life: 10 + Math.random() * 6,
        maxLife: 16,
        color: '#ffaa44',
        size: 2 + Math.random()
      });
    }

    // Outgoing reflection trail
    const outAng = Math.atan2(outgoingDir.y, outgoingDir.x);
    for (let i = 0; i < 8; i++) {
      const spreadAng = outAng + (Math.random() - 0.5) * 0.4;
      const spd = 5 + Math.random() * 3;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(spreadAng) * spd, y: Math.sin(spreadAng) * spd },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: '#88ccff',
        size: 2 + Math.random() * 2
      });
    }

    // Shield/deflector ring pulse
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const spd = 2 + Math.random();
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 10 + Math.random() * 5,
        maxLife: 15,
        color: '#aaddff',
        size: 2 + Math.random()
      });
    }
  }

  private spawnPoisonPuddleAmbient(pos: Vec2, radius: number) {
    // Bubbling effect
    for (let i = 0; i < 3; i++) {
      const offsetX = (Math.random() - 0.5) * radius;
      const offsetY = (Math.random() - 0.5) * radius * 0.5;
      // Only spawn within puddle
      if (offsetX * offsetX + offsetY * offsetY * 4 > radius * radius) continue;

      this.particles.push({
        pos: { x: pos.x + offsetX, y: pos.y + offsetY },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -0.8 - Math.random() * 0.6 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: Math.random() > 0.5 ? '#44ff00' : '#88ff44',
        size: 2 + Math.random() * 3
      });
    }

    // Toxic mist rising
    if (Math.random() < 0.3) {
      const offsetX = (Math.random() - 0.5) * radius * 0.8;
      this.particles.push({
        pos: { x: pos.x + offsetX, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 0.3, y: -0.5 - Math.random() * 0.5 },
        life: 40 + Math.random() * 30,
        maxLife: 70,
        color: '#66aa22',
        size: 4 + Math.random() * 3
      });
    }
  }

  private createMeteorStrikeEffect(pos: Vec2, radius: number) {
    // Pre-impact warning glow
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: -Math.cos(ang) * 2, y: -Math.sin(ang) * 2 },
        life: 15,
        maxLife: 15,
        color: '#ff6600',
        size: 3
      });
    }

    // Meteor trail descending
    for (let i = 0; i < 25; i++) {
      const height = 80 + i * 8;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y - height },
        vel: { x: (Math.random() - 0.5) * 3, y: 10 + Math.random() * 5 },
        life: 8 + i * 0.8,
        maxLife: 28,
        color: i % 3 === 0 ? '#ff2200' : (i % 3 === 1 ? '#ff6600' : '#ffaa00'),
        size: 5 + Math.random() * 3
      });
    }

    // Impact explosion
    for (let i = 0; i < 50; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 4 + Math.random() * 8;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 2 },
        life: 25 + Math.random() * 20,
        maxLife: 45,
        color: i % 4 === 0 ? '#ffffff' : (i % 2 === 0 ? '#ff4400' : '#ff8800'),
        size: 4 + Math.random() * 4
      });
    }

    // Ground debris
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 4;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * radius, y: pos.y },
        vel: { x: Math.cos(ang) * spd, y: -3 - Math.random() * 4 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#8b7355',
        size: 3 + Math.random() * 2
      });
    }

    // Expanding shockwave rings
    for (let ring = 0; ring < 3; ring++) {
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const spd = 5 + ring * 3;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 15 + ring * 5,
          maxLife: 25 + ring * 5,
          color: ring === 0 ? '#ffffff' : (ring === 1 ? '#ffaa00' : '#ff4400'),
          size: 3 - ring * 0.5
        });
      }
    }

    // Heavy screen shake
    this.triggerScreenShake(12, 25);
  }

  private createFreezeEffect(pos: Vec2, radius: number) {
    // Ice crystal formation
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const dist = radius * 0.8;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: Math.cos(ang) * 0.5, y: Math.sin(ang) * 0.5 - 0.5 },
        life: 40 + Math.random() * 20,
        maxLife: 60,
        color: '#88ddff',
        size: 3 + Math.random() * 2
      });
    }

    // Frost particles spreading
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: (Math.random() - 0.5) * 1, y: -0.5 - Math.random() * 1 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: Math.random() > 0.5 ? '#aaeeff' : '#ffffff',
        size: 2 + Math.random() * 2
      });
    }

    // Ice shards jutting out
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 3, y: Math.sin(ang) * 3 - 1 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#66ccff',
        size: 4 + Math.random() * 2
      });
    }

    // Central freeze flash
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: '#ffffff',
        size: 3 + Math.random()
      });
    }
  }

  private createGroundSlamEffect(pos: Vec2, radius: number, intensity: number = 1) {
    // Expanding shockwave rings
    for (let ring = 0; ring < 4; ring++) {
      const pointCount = 32 - ring * 4;
      for (let i = 0; i < pointCount; i++) {
        const ang = (i / pointCount) * Math.PI * 2;
        const spd = (4 + ring * 2) * intensity;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 12 + ring * 4,
          maxLife: 20 + ring * 4,
          color: ring === 0 ? '#ffffff' : (ring < 3 ? '#ffdd88' : '#aa8866'),
          size: 4 - ring * 0.5
        });
      }
    }

    // Ground debris flying up
    for (let i = 0; i < 25 * intensity; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      const upForce = 4 + Math.random() * 4;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: (Math.random() - 0.5) * 3, y: -upForce },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#8b7355',
        size: 2 + Math.random() * 3
      });
    }

    // Dust cloud
    for (let i = 0; i < 15 * intensity; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius * 0.5;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: Math.cos(ang) * 2, y: -1 - Math.random() * 2 },
        life: 35 + Math.random() * 25,
        maxLife: 60,
        color: '#aa9977',
        size: 5 + Math.random() * 4
      });
    }

    // Impact cracks radiating
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      for (let j = 0; j < 4; j++) {
        const dist = 10 + j * 15;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
          vel: { x: Math.cos(ang) * 1, y: Math.sin(ang) * 1 },
          life: 25 - j * 3,
          maxLife: 25,
          color: '#776655',
          size: 3 - j * 0.5
        });
      }
    }

    this.triggerScreenShake(8 * intensity, 20 * intensity);
  }

  private createMagicMissileTrail(pos: Vec2, dir: Vec2, color: string) {
    // Main sparkle trail
    const perpX = -dir.y;
    const perpY = dir.x;

    for (let i = 0; i < 5; i++) {
      const offset = (Math.random() - 0.5) * 10;
      this.particles.push({
        pos: { x: pos.x + perpX * offset, y: pos.y + perpY * offset },
        vel: { x: -dir.x * 2 + (Math.random() - 0.5) * 1, y: -dir.y * 2 + (Math.random() - 0.5) * 1 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color,
        size: 2 + Math.random() * 2
      });
    }

    // Inner glow particles
    for (let i = 0; i < 3; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 6, y: pos.y + (Math.random() - 0.5) * 6 },
        vel: { x: -dir.x * 1.5, y: -dir.y * 1.5 },
        life: 8 + Math.random() * 6,
        maxLife: 14,
        color: '#ffffff',
        size: 2 + Math.random()
      });
    }

    // Occasional larger spark
    if (Math.random() < 0.3) {
      this.particles.push({
        pos: { ...pos },
        vel: { x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3 },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color,
        size: 3 + Math.random() * 2
      });
    }
  }

  private createMeleeBloodSplatter(pos: Vec2, direction: Vec2, intensity: number = 1) {
    const ang = Math.atan2(direction.y, direction.x);

    // Blood droplets in hit direction
    for (let i = 0; i < 8 * intensity; i++) {
      const spreadAng = ang + (Math.random() - 0.5) * 1.2;
      const spd = 3 + Math.random() * 4;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(spreadAng) * spd, y: Math.sin(spreadAng) * spd },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.3 ? '#cc2222' : '#880000',
        size: 2 + Math.random() * 2
      });
    }

    // Mist spray
    for (let i = 0; i < 5 * intensity; i++) {
      const spreadAng = ang + (Math.random() - 0.5) * 0.8;
      const spd = 2 + Math.random() * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(spreadAng) * spd, y: Math.sin(spreadAng) * spd },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#aa3333',
        size: 3 + Math.random() * 2
      });
    }

    // Dripping particles (fall with gravity)
    for (let i = 0; i < 4 * intensity; i++) {
      const offsetAng = ang + (Math.random() - 0.5) * 0.6;
      const dist = 5 + Math.random() * 10;
      this.particles.push({
        pos: { x: pos.x + Math.cos(offsetAng) * dist, y: pos.y + Math.sin(offsetAng) * dist },
        vel: { x: (Math.random() - 0.5) * 1, y: 1 + Math.random() * 2 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#991111',
        size: 2 + Math.random()
      });
    }
  }

  private spawnHealingFountainAmbient(pos: Vec2) {
    // Rising healing mist
    for (let i = 0; i < 3; i++) {
      const offsetX = (Math.random() - 0.5) * 25;
      this.particles.push({
        pos: { x: pos.x + offsetX, y: pos.y + 5 },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -0.8 - Math.random() * 0.6 },
        life: 35 + Math.random() * 25,
        maxLife: 60,
        color: '#44ff88',
        size: 4 + Math.random() * 3
      });
    }

    // Water droplets splashing
    if (Math.random() < 0.4) {
      const dropX = pos.x + (Math.random() - 0.5) * 20;
      this.particles.push({
        pos: { x: dropX, y: pos.y - 10 },
        vel: { x: (Math.random() - 0.5) * 2, y: -2 - Math.random() * 2 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#88ffcc',
        size: 2 + Math.random() * 2
      });
    }

    // Sparkles of healing energy
    if (Math.random() < 0.3) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 10 + Math.random() * 15;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: (Math.random() - 0.5) * 1, y: -1 - Math.random() },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#ffffff',
        size: 2 + Math.random()
      });
    }
  }

  private createLegendaryLootGlow(pos: Vec2, rarity: string) {
    // Rarity-based colors
    const rarityColors: Record<string, string[]> = {
      rare: ['#4488ff', '#88aaff', '#ffffff'],
      epic: ['#aa44ff', '#cc88ff', '#ffffff'],
      legendary: ['#ffa500', '#ffd700', '#ffffff']
    };
    const colors = rarityColors[rarity] || rarityColors.rare;

    // Pulsing aura ring
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const radius = 15 + Math.sin(Date.now() * 0.005) * 5;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang) * 0.5, y: Math.sin(ang) * 0.5 },
        life: 15 + Math.random() * 5,
        maxLife: 20,
        color: colors[0],
        size: 2 + Math.random()
      });
    }

    // Rising sparkles
    for (let i = 0; i < 4; i++) {
      const offsetX = (Math.random() - 0.5) * 20;
      this.particles.push({
        pos: { x: pos.x + offsetX, y: pos.y + 5 },
        vel: { x: (Math.random() - 0.5) * 0.8, y: -1.5 - Math.random() * 1.5 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: colors[1],
        size: 2 + Math.random() * 2
      });
    }

    // Inner core glow
    for (let i = 0; i < 3; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.5 + Math.random() * 0.5;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 10, y: pos.y + (Math.random() - 0.5) * 10 },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 0.5 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: colors[2],
        size: 3 + Math.random()
      });
    }
  }

  private createChainLightningArc(startPos: Vec2, endPos: Vec2) {
    const dx = endPos.x - startPos.x;
    const dy = endPos.y - startPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const segments = Math.max(4, Math.floor(dist / 30));

    // Main lightning bolt with jagged path
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const baseX = startPos.x + dx * t;
      const baseY = startPos.y + dy * t;

      // Add jagged offset (less at endpoints)
      const jitterMult = Math.sin(t * Math.PI);
      const jitterX = (Math.random() - 0.5) * 20 * jitterMult;
      const jitterY = (Math.random() - 0.5) * 20 * jitterMult;

      // Core bright particles
      this.particles.push({
        pos: { x: baseX + jitterX, y: baseY + jitterY },
        vel: { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 },
        life: 6 + Math.random() * 4,
        maxLife: 10,
        color: '#ffffff',
        size: 3 + Math.random() * 2
      });

      // Surrounding electric glow
      for (let j = 0; j < 2; j++) {
        this.particles.push({
          pos: { x: baseX + jitterX + (Math.random() - 0.5) * 10, y: baseY + jitterY + (Math.random() - 0.5) * 10 },
          vel: { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4 },
          life: 8 + Math.random() * 6,
          maxLife: 14,
          color: '#88ddff',
          size: 2 + Math.random()
        });
      }
    }

    // Endpoint sparks
    for (const p of [startPos, endPos]) {
      for (let i = 0; i < 6; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 3;
        this.particles.push({
          pos: { ...p },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 10 + Math.random() * 8,
          maxLife: 18,
          color: '#ffff88',
          size: 2 + Math.random()
        });
      }
    }
  }

  private createPerfectParryEffect(pos: Vec2) {
    // Bright flash burst
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2;
      const spd = 5 + Math.random() * 4;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 10 + Math.random() * 6,
        maxLife: 16,
        color: '#ffffff',
        size: 4 + Math.random() * 2
      });
    }

    // Golden ring expanding
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      const spd = 6 + Math.random() * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 12 + Math.random() * 4,
        maxLife: 16,
        color: '#ffd700',
        size: 3 + Math.random()
      });
    }

    // Radiant sparkles
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 15 + Math.random() * 25;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: (Math.random() - 0.5) * 2, y: -2 - Math.random() * 2 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#ffee88',
        size: 2 + Math.random() * 2
      });
    }

    // Inner power glow
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 8 + Math.random() * 6,
        maxLife: 14,
        color: '#ffff00',
        size: 3 + Math.random() * 2
      });
    }

    // Strong screen flash effect
    this.triggerScreenShake(5, 10);
  }

  private createExplosiveBarrelEffect(pos: Vec2, radius: number) {
    // Massive explosion ball
    for (let i = 0; i < 60; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 10;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 2 },
        life: 25 + Math.random() * 20,
        maxLife: 45,
        color: i % 4 === 0 ? '#ffffff' : (i % 3 === 0 ? '#ffaa00' : (i % 2 === 0 ? '#ff6600' : '#ff2200')),
        size: 4 + Math.random() * 5
      });
    }

    // Barrel debris/shrapnel
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 5 + Math.random() * 8;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 4 },
        life: 35 + Math.random() * 25,
        maxLife: 60,
        color: '#8b4513',
        size: 3 + Math.random() * 3
      });
    }

    // Smoke plume rising
    for (let i = 0; i < 25; i++) {
      const offsetAng = Math.random() * Math.PI * 2;
      const offsetDist = Math.random() * radius * 0.5;
      this.particles.push({
        pos: { x: pos.x + Math.cos(offsetAng) * offsetDist, y: pos.y + Math.sin(offsetAng) * offsetDist },
        vel: { x: (Math.random() - 0.5) * 2, y: -2 - Math.random() * 3 },
        life: 50 + Math.random() * 40,
        maxLife: 90,
        color: i % 2 === 0 ? '#444444' : '#666666',
        size: 6 + Math.random() * 5
      });
    }

    // Ground scorch marks
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      for (let j = 0; j < 3; j++) {
        const dist = radius * 0.3 + j * 15;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
          vel: { x: Math.cos(ang) * 0.5, y: Math.sin(ang) * 0.5 },
          life: 40 - j * 8,
          maxLife: 40,
          color: '#331100',
          size: 4 - j
        });
      }
    }

    // Shockwave ring
    for (let i = 0; i < 32; i++) {
      const ang = (i / 32) * Math.PI * 2;
      const spd = 8 + Math.random() * 3;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 12 + Math.random() * 4,
        maxLife: 16,
        color: '#ffcc00',
        size: 3 + Math.random()
      });
    }

    this.triggerScreenShake(15, 30);
  }

  private createStealthShimmerEffect(pos: Vec2, isActivating: boolean) {
    if (isActivating) {
      // Fade-in shimmer - particles converging
      for (let i = 0; i < 20; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 20;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
          vel: { x: -Math.cos(ang) * 2, y: -Math.sin(ang) * 2 },
          life: 20 + Math.random() * 10,
          maxLife: 30,
          color: '#aabbcc',
          size: 2 + Math.random() * 2
        });
      }

      // Central dissolve effect
      for (let i = 0; i < 15; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 1 + Math.random() * 2;
        this.particles.push({
          pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y + (Math.random() - 0.5) * 30 },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color: '#778899',
          size: 3 + Math.random() * 2
        });
      }
    } else {
      // Deactivating - particles dispersing outward
      for (let i = 0; i < 25; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 3;
        this.particles.push({
          pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y + (Math.random() - 0.5) * 30 },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 20 + Math.random() * 15,
          maxLife: 35,
          color: '#99aabb',
          size: 2 + Math.random() * 2
        });
      }

      // Reforming silhouette sparkles
      for (let i = 0; i < 12; i++) {
        this.particles.push({
          pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y + (Math.random() - 0.5) * 25 },
          vel: { x: (Math.random() - 0.5) * 1, y: -1 - Math.random() },
          life: 18 + Math.random() * 12,
          maxLife: 30,
          color: '#ffffff',
          size: 2 + Math.random()
        });
      }
    }
  }

  private createTrapTriggerWarning(pos: Vec2, trapType: string) {
    // Warning flash rings
    for (let ring = 0; ring < 3; ring++) {
      for (let i = 0; i < 20; i++) {
        const ang = (i / 20) * Math.PI * 2;
        const radius = 15 + ring * 10;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
          vel: { x: Math.cos(ang) * (1 + ring * 0.5), y: Math.sin(ang) * (1 + ring * 0.5) },
          life: 12 + ring * 4,
          maxLife: 20,
          color: '#ff0000',
          size: 3 - ring * 0.5
        });
      }
    }

    // Trap-specific effects
    if (trapType === 'spike') {
      // Spikes rising warning
      for (let i = 0; i < 8; i++) {
        const offsetX = (Math.random() - 0.5) * 30;
        this.particles.push({
          pos: { x: pos.x + offsetX, y: pos.y + 10 },
          vel: { x: 0, y: -4 - Math.random() * 3 },
          life: 10 + Math.random() * 6,
          maxLife: 16,
          color: '#888888',
          size: 2 + Math.random()
        });
      }
    } else if (trapType === 'fire') {
      // Fire trap ignition warning
      for (let i = 0; i < 12; i++) {
        this.particles.push({
          pos: { x: pos.x + (Math.random() - 0.5) * 25, y: pos.y },
          vel: { x: (Math.random() - 0.5) * 2, y: -3 - Math.random() * 3 },
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color: i % 2 === 0 ? '#ff4400' : '#ffaa00',
          size: 3 + Math.random() * 2
        });
      }
    } else if (trapType === 'poison') {
      // Poison gas warning
      for (let i = 0; i < 10; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = Math.random() * 20;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
          vel: { x: (Math.random() - 0.5) * 1.5, y: -1 - Math.random() * 1.5 },
          life: 20 + Math.random() * 15,
          maxLife: 35,
          color: '#44ff00',
          size: 4 + Math.random() * 3
        });
      }
    }

    // Danger indicator particles
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y - 5 },
        vel: { x: (Math.random() - 0.5) * 1, y: -2 - Math.random() * 2 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#ffff00',
        size: 3 + Math.random()
      });
    }
  }

  private createWindGustEffect(pos: Vec2, direction: Vec2, width: number) {
    const perpX = -direction.y;
    const perpY = direction.x;

    // Main wind streaks
    for (let i = 0; i < 20; i++) {
      const offsetPerp = (Math.random() - 0.5) * width;
      const offsetDir = Math.random() * 50;
      this.particles.push({
        pos: {
          x: pos.x + perpX * offsetPerp - direction.x * offsetDir,
          y: pos.y + perpY * offsetPerp - direction.y * offsetDir
        },
        vel: { x: direction.x * (8 + Math.random() * 4), y: direction.y * (8 + Math.random() * 4) },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#ccddee',
        size: 2 + Math.random() * 2
      });
    }

    // Leaf/debris carried by wind
    for (let i = 0; i < 8; i++) {
      const offsetPerp = (Math.random() - 0.5) * width;
      this.particles.push({
        pos: { x: pos.x + perpX * offsetPerp, y: pos.y + perpY * offsetPerp },
        vel: {
          x: direction.x * (5 + Math.random() * 3) + (Math.random() - 0.5) * 2,
          y: direction.y * (5 + Math.random() * 3) + (Math.random() - 0.5) * 2 - 1
        },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: Math.random() > 0.5 ? '#8b7355' : '#6b8e23',
        size: 2 + Math.random() * 2
      });
    }

    // Dust particles swirling
    for (let i = 0; i < 12; i++) {
      const offsetPerp = (Math.random() - 0.5) * width * 0.8;
      const offsetDir = Math.random() * 30;
      this.particles.push({
        pos: {
          x: pos.x + perpX * offsetPerp - direction.x * offsetDir,
          y: pos.y + perpY * offsetPerp - direction.y * offsetDir
        },
        vel: {
          x: direction.x * (4 + Math.random() * 2),
          y: direction.y * (4 + Math.random() * 2) - 0.5
        },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#aa9977',
        size: 3 + Math.random() * 2
      });
    }
  }

  private createRageModeActivation(pos: Vec2) {
    // Fiery aura explosion
    for (let i = 0; i < 40; i++) {
      const ang = (i / 40) * Math.PI * 2;
      const spd = 5 + Math.random() * 5;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: i % 3 === 0 ? '#ff0000' : (i % 2 === 0 ? '#ff6600' : '#ffaa00'),
        size: 4 + Math.random() * 3
      });
    }

    // Rising rage flames
    for (let i = 0; i < 25; i++) {
      const offsetX = (Math.random() - 0.5) * 40;
      this.particles.push({
        pos: { x: pos.x + offsetX, y: pos.y + 10 },
        vel: { x: (Math.random() - 0.5) * 2, y: -4 - Math.random() * 4 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: Math.random() > 0.3 ? '#ff4400' : '#ff0000',
        size: 4 + Math.random() * 3
      });
    }

    // Ground crack effect
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      for (let j = 0; j < 5; j++) {
        const dist = 10 + j * 12;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
          vel: { x: Math.cos(ang) * 1, y: Math.sin(ang) * 1 },
          life: 30 - j * 4,
          maxLife: 30,
          color: '#880000',
          size: 3 - j * 0.4
        });
      }
    }

    // Red energy vortex
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 30;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: -Math.cos(ang) * 4, y: -Math.sin(ang) * 4 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#ff2200',
        size: 3 + Math.random() * 2
      });
    }

    this.triggerScreenShake(10, 25);
  }

  private createMagicShieldBubble(pos: Vec2, radius: number, color: string) {
    // Bubble surface particles
    for (let i = 0; i < 30; i++) {
      const ang = (i / 30) * Math.PI * 2;
      const wobble = Math.sin(i * 0.5) * 3;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * (radius + wobble), y: pos.y + Math.sin(ang) * (radius + wobble) },
        vel: { x: Math.cos(ang) * 0.3, y: Math.sin(ang) * 0.3 },
        life: 15 + Math.random() * 5,
        maxLife: 20,
        color,
        size: 2 + Math.random()
      });
    }

    // Inner energy shimmer
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius * 0.7;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: (Math.random() - 0.5) * 1, y: (Math.random() - 0.5) * 1 },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: '#ffffff',
        size: 2 + Math.random()
      });
    }

    // Hexagonal pattern effect
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius * 0.8, y: pos.y + Math.sin(ang) * radius * 0.8 },
        vel: { x: Math.cos(ang) * 0.5, y: Math.sin(ang) * 0.5 },
        life: 18 + Math.random() * 4,
        maxLife: 22,
        color,
        size: 3 + Math.random()
      });
    }
  }

  private createSummoningCircleEffect(pos: Vec2, radius: number, color: string) {
    // Outer circle formation
    for (let i = 0; i < 32; i++) {
      const ang = (i / 32) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang + Math.PI / 2) * 1, y: Math.sin(ang + Math.PI / 2) * 1 },
        life: 30 + Math.random() * 10,
        maxLife: 40,
        color,
        size: 3 + Math.random()
      });
    }

    // Inner circle
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2;
      const innerRadius = radius * 0.5;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * innerRadius, y: pos.y + Math.sin(ang) * innerRadius },
        vel: { x: -Math.cos(ang + Math.PI / 2) * 0.8, y: -Math.sin(ang + Math.PI / 2) * 0.8 },
        life: 25 + Math.random() * 10,
        maxLife: 35,
        color,
        size: 2 + Math.random()
      });
    }

    // Arcane symbols at cardinal points
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      const symbolPos = { x: pos.x + Math.cos(ang) * radius * 0.75, y: pos.y + Math.sin(ang) * radius * 0.75 };
      for (let j = 0; j < 5; j++) {
        const sparkAng = Math.random() * Math.PI * 2;
        const spd = 1 + Math.random();
        this.particles.push({
          pos: { ...symbolPos },
          vel: { x: Math.cos(sparkAng) * spd, y: Math.sin(sparkAng) * spd - 1 },
          life: 20 + Math.random() * 10,
          maxLife: 30,
          color: '#ffffff',
          size: 2 + Math.random()
        });
      }
    }

    // Rising energy pillar
    for (let i = 0; i < 15; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 1, y: -3 - Math.random() * 3 },
        life: 35 + Math.random() * 20,
        maxLife: 55,
        color,
        size: 3 + Math.random() * 2
      });
    }

    // Convergent particles
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = radius + Math.random() * 30;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: -Math.cos(ang) * 2.5, y: -Math.sin(ang) * 2.5 },
        life: 18 + Math.random() * 12,
        maxLife: 30,
        color: '#ccccff',
        size: 2 + Math.random() * 2
      });
    }
  }

  private createBossDeathExplosion(pos: Vec2, radius: number) {
    // Massive multi-stage explosion
    for (let stage = 0; stage < 4; stage++) {
      const delay = stage * 3;
      const stageRadius = radius * (0.5 + stage * 0.2);

      for (let i = 0; i < 40; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 4 + Math.random() * 8 + stage * 2;
        this.particles.push({
          pos: { x: pos.x + (Math.random() - 0.5) * 30, y: pos.y + (Math.random() - 0.5) * 30 },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 2 },
          life: 30 + delay + Math.random() * 20,
          maxLife: 50 + delay,
          color: stage < 2 ? (i % 2 === 0 ? '#ffffff' : '#ffff00') : (i % 2 === 0 ? '#ff6600' : '#ff0000'),
          size: 5 + Math.random() * 4 - stage * 0.5
        });
      }
    }

    // Body disintegration particles
    for (let i = 0; i < 80; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      const spd = 2 + Math.random() * 5;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 1 },
        life: 40 + Math.random() * 30,
        maxLife: 70,
        color: Math.random() > 0.5 ? '#880000' : '#440000',
        size: 3 + Math.random() * 3
      });
    }

    // Soul essence escaping
    for (let i = 0; i < 30; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * radius, y: pos.y + (Math.random() - 0.5) * radius },
        vel: { x: (Math.random() - 0.5) * 3, y: -4 - Math.random() * 4 },
        life: 50 + Math.random() * 40,
        maxLife: 90,
        color: Math.random() > 0.5 ? '#aa00ff' : '#ff00ff',
        size: 4 + Math.random() * 3
      });
    }

    // Expanding shockwave rings
    for (let ring = 0; ring < 5; ring++) {
      for (let i = 0; i < 32; i++) {
        const ang = (i / 32) * Math.PI * 2;
        const spd = 6 + ring * 3;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 15 + ring * 6,
          maxLife: 30 + ring * 6,
          color: ring < 2 ? '#ffffff' : (ring < 4 ? '#ffaa00' : '#ff4400'),
          size: 4 - ring * 0.5
        });
      }
    }

    // Ground impact debris
    for (let i = 0; i < 40; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 5;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 50, y: pos.y + 20 },
        vel: { x: Math.cos(ang) * spd, y: -4 - Math.random() * 6 },
        life: 40 + Math.random() * 30,
        maxLife: 70,
        color: '#8b7355',
        size: 3 + Math.random() * 3
      });
    }

    // Intense screen shake
    this.triggerScreenShake(20, 50);
  }

  private createArrowTrailEffect(pos: Vec2, dir: Vec2, arrowType: string) {
    // Type-based colors
    const typeColors: Record<string, string[]> = {
      normal: ['#8b7355', '#aa9977', '#ccbbaa'],
      fire: ['#ff4400', '#ff8800', '#ffcc00'],
      ice: ['#88ddff', '#aaeeff', '#ffffff'],
      poison: ['#44ff00', '#88ff44', '#aaffaa'],
      explosive: ['#ff6600', '#ffaa00', '#ffff00']
    };
    const colors = typeColors[arrowType] || typeColors.normal;

    // Main trail particles
    for (let i = 0; i < 4; i++) {
      const perpX = -dir.y;
      const perpY = dir.x;
      const offset = (Math.random() - 0.5) * 8;
      this.particles.push({
        pos: { x: pos.x + perpX * offset, y: pos.y + perpY * offset },
        vel: { x: -dir.x * 2 + (Math.random() - 0.5) * 1, y: -dir.y * 2 + (Math.random() - 0.5) * 1 },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: colors[0],
        size: 2 + Math.random()
      });
    }

    // Elemental trail effects
    if (arrowType === 'fire') {
      for (let i = 0; i < 2; i++) {
        this.particles.push({
          pos: { x: pos.x + (Math.random() - 0.5) * 6, y: pos.y + (Math.random() - 0.5) * 6 },
          vel: { x: -dir.x * 1.5 + (Math.random() - 0.5) * 2, y: -dir.y * 1.5 - 1 - Math.random() },
          life: 12 + Math.random() * 8,
          maxLife: 20,
          color: colors[1],
          size: 3 + Math.random()
        });
      }
    } else if (arrowType === 'ice') {
      if (Math.random() < 0.5) {
        this.particles.push({
          pos: { ...pos },
          vel: { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 },
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color: colors[2],
          size: 2 + Math.random()
        });
      }
    } else if (arrowType === 'poison') {
      for (let i = 0; i < 2; i++) {
        this.particles.push({
          pos: { x: pos.x + (Math.random() - 0.5) * 8, y: pos.y + (Math.random() - 0.5) * 8 },
          vel: { x: (Math.random() - 0.5) * 1, y: -0.5 - Math.random() * 0.5 },
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 2 + Math.random() * 2
        });
      }
    }
  }

  private createSpellFizzleEffect(pos: Vec2, spellColor: string) {
    // Failed casting sparks
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 4;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: spellColor,
        size: 2 + Math.random() * 2
      });
    }

    // Smoke puff from failed spell
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 2;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y + (Math.random() - 0.5) * 15 },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 1 },
        life: 25 + Math.random() * 20,
        maxLife: 45,
        color: '#666666',
        size: 4 + Math.random() * 3
      });
    }

    // Dissipating energy particles
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y + (Math.random() - 0.5) * 20 },
        vel: { x: (Math.random() - 0.5) * 2, y: -1 - Math.random() * 2 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#aaaaaa',
        size: 2 + Math.random() * 2
      });
    }

    // Small fizzle sound effect indicator
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 3, y: Math.sin(ang) * 3 },
        life: 8 + Math.random() * 4,
        maxLife: 12,
        color: '#ffffff',
        size: 2 + Math.random()
      });
    }
  }

  private spawnTreasurePileShimmer(pos: Vec2, radius: number) {
    // Golden sparkles
    if (Math.random() < 0.4) {
      const offsetX = (Math.random() - 0.5) * radius;
      const offsetY = (Math.random() - 0.5) * radius * 0.5;
      this.particles.push({
        pos: { x: pos.x + offsetX, y: pos.y + offsetY },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -0.8 - Math.random() * 0.6 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: Math.random() > 0.3 ? '#ffd700' : '#ffffff',
        size: 2 + Math.random() * 2
      });
    }

    // Occasional bright flash
    if (Math.random() < 0.1) {
      const offsetX = (Math.random() - 0.5) * radius;
      const offsetY = (Math.random() - 0.5) * radius * 0.5;
      for (let i = 0; i < 4; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 1 + Math.random();
        this.particles.push({
          pos: { x: pos.x + offsetX, y: pos.y + offsetY },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 8 + Math.random() * 6,
          maxLife: 14,
          color: '#ffffff',
          size: 2 + Math.random()
        });
      }
    }

    // Coin glint
    if (Math.random() < 0.2) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * radius, y: pos.y + (Math.random() - 0.5) * radius * 0.5 },
        vel: { x: 0, y: -0.3 },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: '#ffee88',
        size: 3 + Math.random()
      });
    }
  }

  private createFootstepDust(pos: Vec2, isRunning: boolean = false) {
    const intensity = isRunning ? 1.5 : 1;
    const particleCount = isRunning ? 6 : 3;

    // Dust puff
    for (let i = 0; i < particleCount; i++) {
      const ang = Math.random() * Math.PI - Math.PI / 2; // Mostly horizontal spread
      const spd = (0.5 + Math.random() * 1) * intensity;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 10, y: pos.y + 5 },
        vel: { x: Math.cos(ang) * spd, y: -0.5 - Math.random() * 0.5 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#aa9977',
        size: 2 + Math.random() * (isRunning ? 2 : 1)
      });
    }

    // Tiny dirt particles
    for (let i = 0; i < particleCount - 1; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.5 + Math.random() * 1.5;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 8, y: pos.y + 3 },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 1 },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: '#8b7355',
        size: 1 + Math.random()
      });
    }
  }

  private createSoulAbsorptionEffect(sourcePos: Vec2, targetPos: Vec2, soulColor: string) {
    // Soul wisps traveling to absorber
    for (let i = 0; i < 15; i++) {
      const startOffset = { x: (Math.random() - 0.5) * 30, y: (Math.random() - 0.5) * 30 };
      const dx = targetPos.x - (sourcePos.x + startOffset.x);
      const dy = targetPos.y - (sourcePos.y + startOffset.y);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = 3 + Math.random() * 2;

      this.particles.push({
        pos: { x: sourcePos.x + startOffset.x, y: sourcePos.y + startOffset.y },
        vel: { x: (dx / dist) * speed + (Math.random() - 0.5) * 1, y: (dy / dist) * speed + (Math.random() - 0.5) * 1 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: soulColor,
        size: 3 + Math.random() * 2
      });
    }

    // Ethereal trail particles
    for (let i = 0; i < 10; i++) {
      const t = Math.random();
      const x = sourcePos.x + (targetPos.x - sourcePos.x) * t + (Math.random() - 0.5) * 20;
      const y = sourcePos.y + (targetPos.y - sourcePos.y) * t + (Math.random() - 0.5) * 20;
      this.particles.push({
        pos: { x, y },
        vel: { x: (Math.random() - 0.5) * 1, y: -1 - Math.random() },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#aaccff',
        size: 2 + Math.random() * 2
      });
    }

    // Source dispersion effect
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 2;
      this.particles.push({
        pos: { ...sourcePos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#ffffff',
        size: 2 + Math.random()
      });
    }
  }

  private createEarthquakeRumbleEffect(centerPos: Vec2, radius: number, intensity: number) {
    // Ground shake debris rising
    for (let i = 0; i < 30 * intensity; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      this.particles.push({
        pos: { x: centerPos.x + Math.cos(ang) * dist, y: centerPos.y + Math.sin(ang) * dist },
        vel: { x: (Math.random() - 0.5) * 3, y: -2 - Math.random() * 4 },
        life: 25 + Math.random() * 20,
        maxLife: 45,
        color: '#8b7355',
        size: 2 + Math.random() * 3
      });
    }

    // Dust clouds
    for (let i = 0; i < 15 * intensity; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius;
      this.particles.push({
        pos: { x: centerPos.x + Math.cos(ang) * dist, y: centerPos.y + Math.sin(ang) * dist },
        vel: { x: (Math.random() - 0.5) * 2, y: -1 - Math.random() * 2 },
        life: 40 + Math.random() * 30,
        maxLife: 70,
        color: '#aa9977',
        size: 5 + Math.random() * 4
      });
    }

    // Crack line effects
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + Math.random() * 0.3;
      for (let j = 0; j < 4; j++) {
        const dist = 20 + j * 20;
        this.particles.push({
          pos: { x: centerPos.x + Math.cos(ang) * dist, y: centerPos.y + Math.sin(ang) * dist },
          vel: { x: Math.cos(ang) * 0.5, y: Math.sin(ang) * 0.5 },
          life: 35 - j * 5,
          maxLife: 35,
          color: '#665544',
          size: 3 - j * 0.5
        });
      }
    }

    // Rumble shockwave
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      const spd = 4 + Math.random() * 2;
      this.particles.push({
        pos: { ...centerPos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 10 + Math.random() * 5,
        maxLife: 15,
        color: '#998877',
        size: 3 + Math.random()
      });
    }

    this.triggerScreenShake(8 * intensity, 30 * intensity);
  }

  private createAreaDenialPulse(pos: Vec2, radius: number, dangerColor: string) {
    // Pulsing danger ring
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang) * 0.5, y: Math.sin(ang) * 0.5 },
        life: 15 + Math.random() * 5,
        maxLife: 20,
        color: dangerColor,
        size: 3 + Math.random()
      });
    }

    // Inner warning particles
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius * 0.7;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: (Math.random() - 0.5) * 1, y: -0.5 - Math.random() * 1 },
        life: 18 + Math.random() * 12,
        maxLife: 30,
        color: '#ffaa00',
        size: 2 + Math.random() * 2
      });
    }

    // Edge glow effect
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const innerRadius = radius * 0.85;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * innerRadius, y: pos.y + Math.sin(ang) * innerRadius },
        vel: { x: Math.cos(ang) * 1, y: Math.sin(ang) * 1 },
        life: 12 + Math.random() * 4,
        maxLife: 16,
        color: '#ffffff',
        size: 2 + Math.random()
      });
    }
  }

  private createBuffDurationIndicator(pos: Vec2, buffColor: string, percentRemaining: number) {
    // Orbiting particles showing remaining duration
    const particleCount = Math.max(3, Math.floor(12 * percentRemaining));
    for (let i = 0; i < particleCount; i++) {
      const ang = (i / particleCount) * Math.PI * 2 * percentRemaining;
      const radius = 18;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius - 10 },
        vel: { x: Math.cos(ang + Math.PI / 2) * 1.5, y: Math.sin(ang + Math.PI / 2) * 1.5 },
        life: 10 + Math.random() * 5,
        maxLife: 15,
        color: buffColor,
        size: 2 + Math.random()
      });
    }

    // Central glow intensity based on remaining time
    const glowIntensity = Math.min(3, Math.floor(5 * percentRemaining));
    for (let i = 0; i < glowIntensity; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.5 + Math.random() * 0.5;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 10, y: pos.y - 10 },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 0.5 },
        life: 8 + Math.random() * 6,
        maxLife: 14,
        color: '#ffffff',
        size: 2 + Math.random()
      });
    }

    // Warning flicker when low
    if (percentRemaining < 0.25 && Math.random() < 0.5) {
      for (let i = 0; i < 4; i++) {
        const ang = Math.random() * Math.PI * 2;
        this.particles.push({
          pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y - 10 + (Math.random() - 0.5) * 10 },
          vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 },
          life: 6 + Math.random() * 4,
          maxLife: 10,
          color: '#ff4444',
          size: 2 + Math.random()
        });
      }
    }
  }

  private createEnemySpawnPortalEffect(pos: Vec2, portalColor: string) {
    // Dark rift opening
    for (let i = 0; i < 25; i++) {
      const ang = (i / 25) * Math.PI * 2;
      const radius = 30;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: -Math.cos(ang) * 2, y: -Math.sin(ang) * 2 },
        life: 25 + Math.random() * 10,
        maxLife: 35,
        color: portalColor,
        size: 3 + Math.random() * 2
      });
    }

    // Ominous particles emerging
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * 20;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: Math.cos(ang) * 3, y: Math.sin(ang) * 3 - 1 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#440044',
        size: 4 + Math.random() * 2
      });
    }

    // Ground shadow effect
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const radius = 25;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius * 0.3 + 15 },
        vel: { x: Math.cos(ang) * 0.5, y: 0 },
        life: 20 + Math.random() * 5,
        maxLife: 25,
        color: '#220022',
        size: 4 + Math.random() * 2
      });
    }

    // Emergence flash
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 3;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 10 + Math.random() * 6,
        maxLife: 16,
        color: '#ff00ff',
        size: 2 + Math.random() * 2
      });
    }

    this.triggerScreenShake(3, 8);
  }

  private createUltimateChargingEffect(pos: Vec2, chargePercent: number, color: string) {
    // Intensity scales with charge
    const intensity = chargePercent;

    // Power gathering vortex
    const vortexParticles = Math.floor(15 * intensity);
    for (let i = 0; i < vortexParticles; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 30;
      const speed = 2 + intensity * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: -Math.cos(ang) * speed + Math.cos(ang + Math.PI / 2) * 1, y: -Math.sin(ang) * speed + Math.sin(ang + Math.PI / 2) * 1 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color,
        size: 2 + intensity * 2 + Math.random()
      });
    }

    // Rising energy pillar
    if (chargePercent > 0.3) {
      const pillarParticles = Math.floor(8 * intensity);
      for (let i = 0; i < pillarParticles; i++) {
        this.particles.push({
          pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y + 10 },
          vel: { x: (Math.random() - 0.5) * 1, y: -3 - intensity * 3 },
          life: 25 + Math.random() * 15,
          maxLife: 40,
          color: i % 2 === 0 ? color : '#ffffff',
          size: 3 + intensity * 2 + Math.random()
        });
      }
    }

    // Ground energy circle
    if (chargePercent > 0.5) {
      const circleRadius = 25 + intensity * 15;
      for (let i = 0; i < 20; i++) {
        const ang = (i / 20) * Math.PI * 2;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * circleRadius, y: pos.y + Math.sin(ang) * circleRadius * 0.3 + 10 },
          vel: { x: Math.cos(ang + Math.PI / 2) * 1, y: 0 },
          life: 10 + Math.random() * 5,
          maxLife: 15,
          color,
          size: 2 + Math.random()
        });
      }
    }

    // Power overflow at max charge
    if (chargePercent >= 0.95) {
      for (let i = 0; i < 8; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 3 + Math.random() * 4;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 12 + Math.random() * 8,
          maxLife: 20,
          color: '#ffffff',
          size: 4 + Math.random() * 2
        });
      }
    }
  }

  private spawnRainParticles(camX: number, camY: number, viewWidth: number, viewHeight: number, intensity: number = 1) {
    const particleCount = Math.floor(8 * intensity);
    for (let i = 0; i < particleCount; i++) {
      const x = camX + Math.random() * viewWidth;
      const y = camY - 20;
      this.particles.push({
        pos: { x, y },
        vel: { x: -1 - Math.random() * 0.5, y: 12 + Math.random() * 4 },
        life: 40 + Math.random() * 20,
        maxLife: 60,
        color: '#88aacc',
        size: 1 + Math.random()
      });
    }

    // Ground splash effects
    if (Math.random() < 0.2 * intensity) {
      const splashX = camX + Math.random() * viewWidth;
      const splashY = camY + viewHeight - 20 + Math.random() * 40;
      for (let i = 0; i < 4; i++) {
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1;
        const spd = 1 + Math.random() * 1.5;
        this.particles.push({
          pos: { x: splashX, y: splashY },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 8 + Math.random() * 6,
          maxLife: 14,
          color: '#aaccee',
          size: 1 + Math.random()
        });
      }
    }
  }

  private spawnStormLightning(camX: number, camY: number, viewWidth: number, viewHeight: number) {
    // Random lightning strike location
    const strikeX = camX + Math.random() * viewWidth;
    const strikeY = camY + 50 + Math.random() * (viewHeight * 0.5);

    // Lightning bolt descending
    for (let i = 0; i < 8; i++) {
      const segmentY = strikeY - 50 - i * 30;
      const jitter = (Math.random() - 0.5) * 30;
      this.particles.push({
        pos: { x: strikeX + jitter, y: segmentY },
        vel: { x: (Math.random() - 0.5) * 5, y: 10 + Math.random() * 5 },
        life: 4 + i,
        maxLife: 12,
        color: '#ffffff',
        size: 4 + Math.random() * 2
      });
    }

    // Ground impact flash
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 4;
      this.particles.push({
        pos: { x: strikeX, y: strikeY },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 2 },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: i % 2 === 0 ? '#ffffff' : '#88ddff',
        size: 3 + Math.random() * 2
      });
    }

    // Surrounding glow
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 20 + Math.random() * 40;
      this.particles.push({
        pos: { x: strikeX + Math.cos(ang) * dist, y: strikeY + Math.sin(ang) * dist },
        vel: { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 },
        life: 8 + Math.random() * 6,
        maxLife: 14,
        color: '#aaccff',
        size: 2 + Math.random() * 2
      });
    }

    this.triggerScreenShake(6, 12);
  }

  private createTimeWarpEffect(pos: Vec2, radius: number, isActivating: boolean) {
    // Circular distortion ring
    const ringParticles = 24;
    for (let i = 0; i < ringParticles; i++) {
      const ang = (i / ringParticles) * Math.PI * 2;
      const dist = isActivating ? 0 : radius;
      const targetDist = isActivating ? radius : 0;
      const spd = (targetDist - dist) / 20;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 25,
        maxLife: 25,
        color: '#88ccff',
        size: 3 + Math.random() * 2
      });
    }

    // Spiral time particles
    for (let layer = 0; layer < 3; layer++) {
      const spiralCount = 8;
      for (let i = 0; i < spiralCount; i++) {
        const ang = (i / spiralCount) * Math.PI * 2 + layer * 0.3;
        const r = radius * (0.3 + layer * 0.3);
        const rotSpeed = isActivating ? 0.15 : -0.15;

        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
          vel: { x: Math.sin(ang) * rotSpeed * r, y: -Math.cos(ang) * rotSpeed * r },
          life: 30 + Math.random() * 10,
          maxLife: 40,
          color: layer === 0 ? '#ffffff' : layer === 1 ? '#aaddff' : '#6699cc',
          size: 4 - layer
        });
      }
    }

    // Center flash
    if (isActivating) {
      for (let i = 0; i < 12; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 1 + Math.random() * 2;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color: '#ffffff',
          size: 2 + Math.random() * 2
        });
      }
    }

    // Floating clock-like particles
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: -0.5 - Math.random() * 0.5 },
        life: 40 + Math.random() * 20,
        maxLife: 60,
        color: '#ccddff',
        size: 1.5 + Math.random()
      });
    }

    this.triggerScreenShake(isActivating ? 5 : 3, 15);
  }

  private createChainLightningEffect(positions: Vec2[], color: string = '#44ddff') {
    // Create lightning between each pair of positions
    for (let i = 0; i < positions.length - 1; i++) {
      const start = positions[i];
      const end = positions[i + 1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const segments = Math.max(4, Math.floor(dist / 20));

      // Jagged lightning path
      let prevX = start.x;
      let prevY = start.y;
      for (let j = 1; j <= segments; j++) {
        const t = j / segments;
        let x = start.x + dx * t;
        let y = start.y + dy * t;

        // Add jagged offset except for endpoints
        if (j < segments) {
          const perpX = -dy / dist;
          const perpY = dx / dist;
          const offset = (Math.random() - 0.5) * 30;
          x += perpX * offset;
          y += perpY * offset;
        }

        // Main bolt particles
        for (let k = 0; k < 3; k++) {
          const segDx = x - prevX;
          const segDy = y - prevY;
          const pt = Math.random();
          this.particles.push({
            pos: { x: prevX + segDx * pt, y: prevY + segDy * pt },
            vel: { x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3 },
            life: 6 + Math.random() * 4,
            maxLife: 10,
            color: k === 0 ? '#ffffff' : color,
            size: k === 0 ? 3 : 2 + Math.random()
          });
        }

        prevX = x;
        prevY = y;
      }

      // Branch sparks at connection points
      const branchCount = 3 + Math.floor(Math.random() * 3);
      for (let b = 0; b < branchCount; b++) {
        const t = Math.random();
        const branchX = start.x + dx * t;
        const branchY = start.y + dy * t;
        const branchAng = Math.random() * Math.PI * 2;
        const branchLen = 15 + Math.random() * 25;

        for (let s = 0; s < 4; s++) {
          const st = s / 4;
          this.particles.push({
            pos: {
              x: branchX + Math.cos(branchAng) * branchLen * st,
              y: branchY + Math.sin(branchAng) * branchLen * st
            },
            vel: {
              x: Math.cos(branchAng) * 2 + (Math.random() - 0.5) * 2,
              y: Math.sin(branchAng) * 2 + (Math.random() - 0.5) * 2
            },
            life: 4 + Math.random() * 3,
            maxLife: 7,
            color: color,
            size: 1.5 + Math.random()
          });
        }
      }

      // Impact sparks at each node
      for (let s = 0; s < 8; s++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 3;
        this.particles.push({
          pos: { ...end },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 8 + Math.random() * 6,
          maxLife: 14,
          color: '#ffffff',
          size: 2 + Math.random()
        });
      }
    }

    this.triggerScreenShake(4, 8);
  }

  private createHealingAuraEffect(pos: Vec2, radius: number, intensity: number = 1) {
    // Rising healing particles
    const particleCount = Math.floor(12 * intensity);
    for (let i = 0; i < particleCount; i++) {
      const ang = (i / particleCount) * Math.PI * 2 + Math.random() * 0.3;
      const r = radius * (0.3 + Math.random() * 0.7);
      const colors = ['#44ff88', '#88ffaa', '#aaffcc', '#ffffff'];

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -1 - Math.random() * 1.5 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 2
      });
    }

    // Gentle ring pulse
    const ringParticles = 16;
    for (let i = 0; i < ringParticles; i++) {
      const ang = (i / ringParticles) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang) * 0.3, y: Math.sin(ang) * 0.3 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#66ffaa',
        size: 1.5 + Math.random()
      });
    }

    // Center glow particles
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.5 + Math.random() * 0.5;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 0.5 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#ffffff',
        size: 3 + Math.random() * 2
      });
    }

    // Sparkle crosses
    for (let i = 0; i < 4; i++) {
      const sparkleAng = Math.random() * Math.PI * 2;
      const sparkleR = Math.random() * radius * 0.8;
      const sparklePos = {
        x: pos.x + Math.cos(sparkleAng) * sparkleR,
        y: pos.y + Math.sin(sparkleAng) * sparkleR
      };

      // Create cross pattern
      for (let d = 0; d < 4; d++) {
        const dir = (d / 4) * Math.PI * 2;
        this.particles.push({
          pos: { ...sparklePos },
          vel: { x: Math.cos(dir) * 1.5, y: Math.sin(dir) * 1.5 },
          life: 10 + Math.random() * 5,
          maxLife: 15,
          color: '#ffffff',
          size: 1.5
        });
      }
    }
  }

  private createVortexPullEffect(pos: Vec2, radius: number, intensity: number = 1) {
    // Particles spiraling inward
    const spiralCount = 20;
    for (let i = 0; i < spiralCount; i++) {
      const ang = (i / spiralCount) * Math.PI * 4 + Math.random() * 0.5;
      const r = radius * (0.8 + Math.random() * 0.2);
      const pullSpeed = 3 + intensity * 2;

      // Calculate spiral velocity (inward + tangential)
      const towardCenter = { x: -Math.cos(ang), y: -Math.sin(ang) };
      const tangent = { x: -Math.sin(ang), y: Math.cos(ang) };

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: {
          x: towardCenter.x * pullSpeed + tangent.x * pullSpeed * 0.5,
          y: towardCenter.y * pullSpeed + tangent.y * pullSpeed * 0.5
        },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: i % 3 === 0 ? '#9944ff' : i % 3 === 1 ? '#6622cc' : '#4411aa',
        size: 2 + Math.random() * 2
      });
    }

    // Outer debris ring
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * (1 + Math.random() * 0.3);
      const pullSpeed = 2 + intensity;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: -Math.cos(ang) * pullSpeed, y: -Math.sin(ang) * pullSpeed },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#775599',
        size: 1.5 + Math.random()
      });
    }

    // Central dark core
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.5 + Math.random();
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: '#220044',
        size: 3 + Math.random() * 2
      });
    }

    // Bright center flash
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 10, y: pos.y + (Math.random() - 0.5) * 10 },
        vel: { x: 0, y: 0 },
        life: 8 + Math.random() * 5,
        maxLife: 13,
        color: '#ffffff',
        size: 2 + Math.random()
      });
    }

    this.triggerScreenShake(3 * intensity, 10);
  }

  private createBladeWhirlwindEffect(pos: Vec2, radius: number, rotation: number = 0) {
    // Spinning blade arc particles
    const bladeCount = 6;
    for (let b = 0; b < bladeCount; b++) {
      const baseAng = (b / bladeCount) * Math.PI * 2 + rotation;
      const bladeLength = radius * 0.8;

      // Each blade is a line of particles
      for (let i = 0; i < 8; i++) {
        const t = i / 8;
        const r = radius * 0.2 + bladeLength * t;
        const wobble = Math.sin(t * Math.PI) * 0.1;

        this.particles.push({
          pos: { x: pos.x + Math.cos(baseAng + wobble) * r, y: pos.y + Math.sin(baseAng + wobble) * r },
          vel: {
            x: Math.cos(baseAng + Math.PI / 2) * 3 + (Math.random() - 0.5),
            y: Math.sin(baseAng + Math.PI / 2) * 3 + (Math.random() - 0.5)
          },
          life: 8 + Math.random() * 4,
          maxLife: 12,
          color: i < 2 ? '#ffffff' : i < 5 ? '#cccccc' : '#999999',
          size: 3 - t * 1.5
        });
      }
    }

    // Metallic sparks flying off
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * (0.5 + Math.random() * 0.5);
      const tangent = ang + Math.PI / 2;
      const spd = 4 + Math.random() * 3;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: Math.cos(tangent) * spd, y: Math.sin(tangent) * spd },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: Math.random() > 0.5 ? '#ffeecc' : '#ffffff',
        size: 1.5 + Math.random()
      });
    }

    // Wind swoosh particles
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * (0.8 + Math.random() * 0.4);

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: Math.cos(ang + Math.PI / 2) * 2, y: Math.sin(ang + Math.PI / 2) * 2 },
        life: 12 + Math.random() * 6,
        maxLife: 18,
        color: '#aabbcc',
        size: 2 + Math.random()
      });
    }

    this.triggerScreenShake(2, 5);
  }

  private createPoisonCloudEffect(pos: Vec2, radius: number, density: number = 1) {
    // Billowing cloud particles
    const cloudCount = Math.floor(20 * density);
    for (let i = 0; i < cloudCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      const drift = {
        x: (Math.random() - 0.5) * 1.5,
        y: -0.3 - Math.random() * 0.7 // Slow rise
      };

      const greenShade = Math.floor(Math.random() * 100) + 100;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: drift,
        life: 40 + Math.random() * 30,
        maxLife: 70,
        color: `rgb(${Math.floor(greenShade * 0.3)}, ${greenShade}, ${Math.floor(greenShade * 0.2)})`,
        size: 4 + Math.random() * 4
      });
    }

    // Bubbling particles at bottom
    for (let i = 0; i < 8; i++) {
      const x = pos.x + (Math.random() - 0.5) * radius * 1.5;
      this.particles.push({
        pos: { x, y: pos.y + radius * 0.3 },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -2 - Math.random() * 2 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#88ff44',
        size: 2 + Math.random() * 2
      });
    }

    // Toxic drips
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * (0.3 + Math.random() * 0.7);
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: 1.5 + Math.random() },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#44aa22',
        size: 1.5 + Math.random()
      });
    }

    // Skull/danger sparkles (rare bright particles)
    for (let i = 0; i < 3; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.6;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: -0.5 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#ccff88',
        size: 2
      });
    }
  }

  private createFireTornadoEffect(pos: Vec2, radius: number, height: number = 100) {
    // Spiraling fire particles rising upward
    const spiralLayers = 5;
    for (let layer = 0; layer < spiralLayers; layer++) {
      const layerY = pos.y - (layer / spiralLayers) * height;
      const layerRadius = radius * (1 - layer / spiralLayers * 0.6);
      const particlesInLayer = 8;

      for (let i = 0; i < particlesInLayer; i++) {
        const ang = (i / particlesInLayer) * Math.PI * 2 + layer * 0.5;
        const colors = ['#ff4400', '#ff8800', '#ffcc00', '#ffffff'];
        const colorIndex = Math.min(layer, colors.length - 1);

        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * layerRadius, y: layerY },
          vel: {
            x: Math.cos(ang + Math.PI / 2) * 4 + (Math.random() - 0.5) * 2,
            y: -3 - Math.random() * 3
          },
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color: colors[colorIndex],
          size: 4 - layer * 0.5 + Math.random()
        });
      }
    }

    // Core column fire
    for (let i = 0; i < 12; i++) {
      const y = pos.y - Math.random() * height;
      const radiusAtHeight = radius * 0.3 * (1 - (pos.y - y) / height * 0.5);
      const ang = Math.random() * Math.PI * 2;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radiusAtHeight, y },
        vel: { x: (Math.random() - 0.5) * 3, y: -4 - Math.random() * 3 },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: Math.random() > 0.3 ? '#ffaa00' : '#ffffff',
        size: 3 + Math.random() * 2
      });
    }

    // Ember sparks flying out
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 4;
      const startY = pos.y - Math.random() * height * 0.7;

      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * radius, y: startY },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 2 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#ff6600',
        size: 1.5 + Math.random()
      });
    }

    // Ground fire ring
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 + Math.random() * 0.2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y },
        vel: { x: Math.cos(ang) * 1.5, y: -1 - Math.random() },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: '#ff4400',
        size: 3 + Math.random()
      });
    }

    this.triggerScreenShake(4, 12);
  }

  private createIceShatterEffect(pos: Vec2, radius: number, shardCount: number = 12) {
    // Ice shards flying outward
    for (let i = 0; i < shardCount; i++) {
      const ang = (i / shardCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const spd = 4 + Math.random() * 4;

      // Each shard is multiple particles in a line
      for (let j = 0; j < 3; j++) {
        const offset = j * 3;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * offset, y: pos.y + Math.sin(ang) * offset },
          vel: {
            x: Math.cos(ang) * spd * (1 - j * 0.2),
            y: Math.sin(ang) * spd * (1 - j * 0.2) + j * 0.5 // Gravity effect
          },
          life: 20 + Math.random() * 10,
          maxLife: 30,
          color: j === 0 ? '#ffffff' : j === 1 ? '#aaeeff' : '#66ccff',
          size: 3 - j * 0.5
        });
      }
    }

    // Central burst
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 3;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: '#ffffff',
        size: 2 + Math.random() * 2
      });
    }

    // Frost mist spreading
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.5;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: Math.cos(ang) * 1, y: Math.sin(ang) * 1 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#88ddff',
        size: 4 + Math.random() * 3
      });
    }

    // Sparkle glints
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: -0.5 + Math.random() * 0.3 },
        life: 15 + Math.random() * 20,
        maxLife: 35,
        color: '#ffffff',
        size: 1.5
      });
    }

    // Ground frost ring
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang) * 0.5, y: Math.sin(ang) * 0.5 },
        life: 30 + Math.random() * 15,
        maxLife: 45,
        color: '#aaddff',
        size: 2 + Math.random()
      });
    }

    this.triggerScreenShake(6, 10);
  }

  private createMagicBeamEffect(startPos: Vec2, endPos: Vec2, beamColor: string, width: number = 8) {
    const dx = endPos.x - startPos.x;
    const dy = endPos.y - startPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const segments = Math.max(5, Math.floor(dist / 25));

    // Core beam particles
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = startPos.x + dx * t;
      const y = startPos.y + dy * t;

      // Central bright particles
      for (let j = 0; j < 3; j++) {
        const perpX = -dy / dist;
        const perpY = dx / dist;
        const offset = (Math.random() - 0.5) * width;
        this.particles.push({
          pos: { x: x + perpX * offset, y: y + perpY * offset },
          vel: { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 },
          life: 8 + Math.random() * 6,
          maxLife: 14,
          color: j === 0 ? '#ffffff' : beamColor,
          size: j === 0 ? 3 + Math.random() : 2 + Math.random() * 2
        });
      }
    }

    // Energy sparks along beam
    for (let i = 0; i < 12; i++) {
      const t = Math.random();
      const x = startPos.x + dx * t;
      const y = startPos.y + dy * t;
      const perpX = -dy / dist;
      const perpY = dx / dist;
      const offset = (Math.random() - 0.5) * width * 1.5;

      this.particles.push({
        pos: { x: x + perpX * offset, y: y + perpY * offset },
        vel: { x: perpX * (2 + Math.random() * 2), y: perpY * (2 + Math.random() * 2) },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: beamColor,
        size: 2 + Math.random()
      });
    }

    // Impact point effect
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 3;
      this.particles.push({
        pos: { ...endPos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: '#ffffff',
        size: 2 + Math.random() * 2
      });
    }

    // Source glow
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 2;
      this.particles.push({
        pos: { ...startPos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 8 + Math.random() * 6,
        maxLife: 14,
        color: beamColor,
        size: 2 + Math.random()
      });
    }
  }

  private createBloodSplatterEffect(pos: Vec2, impactDir: Vec2, intensity: number = 1) {
    const normalizedDir = {
      x: impactDir.x / (Math.sqrt(impactDir.x * impactDir.x + impactDir.y * impactDir.y) || 1),
      y: impactDir.y / (Math.sqrt(impactDir.x * impactDir.x + impactDir.y * impactDir.y) || 1)
    };

    // Main splatter in impact direction
    const splatterCount = Math.floor(8 * intensity);
    for (let i = 0; i < splatterCount; i++) {
      const spreadAngle = (Math.random() - 0.5) * Math.PI * 0.6;
      const baseAngle = Math.atan2(normalizedDir.y, normalizedDir.x);
      const angle = baseAngle + spreadAngle;
      const spd = 3 + Math.random() * 4 * intensity;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(angle) * spd, y: Math.sin(angle) * spd + 1 }, // Slight gravity
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.3 ? '#cc2222' : '#881111',
        size: 2 + Math.random() * 2 * intensity
      });
    }

    // Droplets falling
    for (let i = 0; i < 5; i++) {
      const offsetX = (Math.random() - 0.5) * 20;
      this.particles.push({
        pos: { x: pos.x + offsetX, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 0.5, y: 2 + Math.random() * 2 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#aa1111',
        size: 1.5 + Math.random()
      });
    }

    // Mist particles
    for (let i = 0; i < 4; i++) {
      const ang = Math.random() * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 1, y: Math.sin(ang) * 1 },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: '#cc4444',
        size: 3 + Math.random() * 2
      });
    }
  }

  private createShockwaveStompEffect(pos: Vec2, radius: number, power: number = 1) {
    // Expanding shockwave rings
    const ringCount = 3;
    for (let ring = 0; ring < ringCount; ring++) {
      const ringRadius = radius * (0.3 + ring * 0.35);
      const particlesInRing = 16 + ring * 4;

      for (let i = 0; i < particlesInRing; i++) {
        const ang = (i / particlesInRing) * Math.PI * 2;
        const spd = (2 + ring) * power;

        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * ringRadius * 0.3, y: pos.y + Math.sin(ang) * ringRadius * 0.3 },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 12 + ring * 4,
          maxLife: 12 + ring * 4,
          color: ring === 0 ? '#ffffff' : ring === 1 ? '#ffddaa' : '#aa8866',
          size: 3 - ring * 0.5
        });
      }
    }

    // Ground debris flying up
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.5;
      const upVel = 3 + Math.random() * 4 * power;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 3, y: -upVel },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: Math.random() > 0.5 ? '#886644' : '#665533',
        size: 2 + Math.random() * 2
      });
    }

    // Dust cloud at impact
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 2;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 0.5 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#998877',
        size: 4 + Math.random() * 4
      });
    }

    // Central flash
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 4, y: Math.sin(ang) * 4 },
        life: 6,
        maxLife: 6,
        color: '#ffffff',
        size: 4
      });
    }

    this.triggerScreenShake(8 * power, 15);
  }

  private createArcaneRuneCircleEffect(pos: Vec2, radius: number, color: string = '#aa44ff') {
    // Outer rune ring
    const outerParticles = 24;
    for (let i = 0; i < outerParticles; i++) {
      const ang = (i / outerParticles) * Math.PI * 2;
      const wobble = Math.sin(i * 3) * 0.1;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang + wobble) * 0.3, y: Math.sin(ang + wobble) * 0.3 },
        life: 35 + Math.random() * 10,
        maxLife: 45,
        color: i % 3 === 0 ? '#ffffff' : color,
        size: i % 4 === 0 ? 3 : 2
      });
    }

    // Inner geometric patterns (hexagram-like)
    const innerPoints = 6;
    for (let i = 0; i < innerPoints; i++) {
      const ang1 = (i / innerPoints) * Math.PI * 2;
      const ang2 = ((i + 2) / innerPoints) * Math.PI * 2;
      const start = { x: pos.x + Math.cos(ang1) * radius * 0.7, y: pos.y + Math.sin(ang1) * radius * 0.7 };
      const end = { x: pos.x + Math.cos(ang2) * radius * 0.7, y: pos.y + Math.sin(ang2) * radius * 0.7 };

      // Line between points
      for (let j = 0; j < 5; j++) {
        const t = j / 4;
        this.particles.push({
          pos: { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t },
          vel: { x: 0, y: -0.3 },
          life: 30 + Math.random() * 10,
          maxLife: 40,
          color: color,
          size: 2
        });
      }
    }

    // Center glow
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.3;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: -0.5 - Math.random() * 0.5 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#ffffff',
        size: 2 + Math.random() * 2
      });
    }

    // Floating arcane symbols
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + Math.random() * 0.3;
      const r = radius * (0.4 + Math.random() * 0.3);
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: -1 - Math.random() * 0.5 },
        life: 40 + Math.random() * 20,
        maxLife: 60,
        color: color,
        size: 3 + Math.random()
      });
    }
  }

  private createDivineSmiteEffect(pos: Vec2, radius: number) {
    // Descending light beam
    const beamHeight = 200;
    for (let y = 0; y < beamHeight; y += 10) {
      const width = radius * (0.3 + (beamHeight - y) / beamHeight * 0.7);
      const particlesAtHeight = 6;

      for (let i = 0; i < particlesAtHeight; i++) {
        const x = (Math.random() - 0.5) * width;
        this.particles.push({
          pos: { x: pos.x + x, y: pos.y - y },
          vel: { x: (Math.random() - 0.5) * 0.5, y: 3 + Math.random() * 2 },
          life: 12 + Math.random() * 8,
          maxLife: 20,
          color: Math.random() > 0.3 ? '#ffff88' : '#ffffff',
          size: 2 + Math.random() * 2
        });
      }
    }

    // Impact radial burst
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2;
      const spd = 4 + Math.random() * 3;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#ffdd44',
        size: 3 + Math.random()
      });
    }

    // Holy cross pattern
    const crossDirections = [
      { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }
    ];
    for (const dir of crossDirections) {
      for (let i = 0; i < 8; i++) {
        const dist = (i / 8) * radius;
        this.particles.push({
          pos: { x: pos.x + dir.x * dist, y: pos.y + dir.y * dist },
          vel: { x: dir.x * 2, y: dir.y * 2 - 0.5 },
          life: 20 + Math.random() * 10,
          maxLife: 30,
          color: '#ffffff',
          size: 3 - i * 0.2
        });
      }
    }

    // Ground sanctified ring
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: 0, y: -0.5 },
        life: 30 + Math.random() * 15,
        maxLife: 45,
        color: '#ffeeaa',
        size: 2 + Math.random()
      });
    }

    // Ascending sparkles
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.8;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -2 - Math.random() * 2 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#ffffff',
        size: 1.5 + Math.random()
      });
    }

    this.triggerScreenShake(10, 20);
  }

  private createShadowDashEffect(startPos: Vec2, endPos: Vec2, color: string = '#442266') {
    const dx = endPos.x - startPos.x;
    const dy = endPos.y - startPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const segments = Math.max(8, Math.floor(dist / 15));

    // Shadow trail between positions
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = startPos.x + dx * t;
      const y = startPos.y + dy * t;
      const fadeSize = 1 - Math.abs(t - 0.5) * 0.5;

      // Core shadow particles
      for (let j = 0; j < 3; j++) {
        const offset = (Math.random() - 0.5) * 15;
        const perpX = -dy / dist * offset;
        const perpY = dx / dist * offset;

        this.particles.push({
          pos: { x: x + perpX, y: y + perpY },
          vel: { x: (Math.random() - 0.5) * 1, y: -0.5 - Math.random() * 0.5 },
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color: j === 0 ? '#110022' : color,
          size: (3 + Math.random() * 2) * fadeSize
        });
      }
    }

    // Shadow wisps floating up
    for (let i = 0; i < 10; i++) {
      const t = Math.random();
      const x = startPos.x + dx * t;
      const y = startPos.y + dy * t;

      this.particles.push({
        pos: { x, y },
        vel: { x: (Math.random() - 0.5) * 2, y: -1.5 - Math.random() * 1.5 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#553377',
        size: 2 + Math.random() * 2
      });
    }

    // Entry and exit burst
    for (const pos of [startPos, endPos]) {
      for (let i = 0; i < 8; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 2;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 12 + Math.random() * 8,
          maxLife: 20,
          color: '#220044',
          size: 2 + Math.random()
        });
      }
    }
  }

  private createArcaneExplosionEffect(pos: Vec2, radius: number, color: string = '#8844ff') {
    // Central bright flash
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 10 + Math.random() * 5,
        maxLife: 15,
        color: '#ffffff',
        size: 3 + Math.random() * 3
      });
    }

    // Expanding arcane rings
    for (let ring = 0; ring < 3; ring++) {
      const ringRadius = radius * (0.3 + ring * 0.35);
      const particleCount = 12 + ring * 6;

      for (let i = 0; i < particleCount; i++) {
        const ang = (i / particleCount) * Math.PI * 2;
        const spd = 3 + ring * 1.5;

        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * 5, y: pos.y + Math.sin(ang) * 5 },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 18 + ring * 5,
          maxLife: 18 + ring * 5,
          color: ring === 0 ? '#ffffff' : ring === 1 ? '#bb88ff' : color,
          size: 3 - ring * 0.5
        });
      }
    }

    // Arcane runes flying outward
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      const spd = 2 + Math.random() * 2;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 1 },
        life: 30 + Math.random() * 15,
        maxLife: 45,
        color: color,
        size: 2 + Math.random()
      });
    }

    // Energy tendrils
    for (let i = 0; i < 6; i++) {
      const baseAng = (i / 6) * Math.PI * 2;
      for (let j = 0; j < 5; j++) {
        const dist = (j / 5) * radius;
        const wobble = Math.sin(j * 1.5) * 0.2;

        this.particles.push({
          pos: { x: pos.x + Math.cos(baseAng + wobble) * dist, y: pos.y + Math.sin(baseAng + wobble) * dist },
          vel: { x: Math.cos(baseAng) * 2, y: Math.sin(baseAng) * 2 },
          life: 12 + j * 3,
          maxLife: 12 + j * 3,
          color: '#aa66ff',
          size: 2.5 - j * 0.3
        });
      }
    }

    this.triggerScreenShake(7, 12);
  }

  private createSpiritProjectionEffect(sourcePos: Vec2, targetPos: Vec2, color: string = '#88ccff') {
    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Ghostly trail between source and target
    const segments = Math.max(10, Math.floor(dist / 20));
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = sourcePos.x + dx * t;
      const y = sourcePos.y + dy * t;
      const opacity = Math.sin(t * Math.PI); // Fade at ends

      // Main spirit body
      for (let j = 0; j < 2; j++) {
        const offset = (Math.random() - 0.5) * 10;
        this.particles.push({
          pos: { x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8 },
          vel: { x: (Math.random() - 0.5) * 0.5, y: -0.5 - Math.random() * 0.5 },
          life: (20 + Math.random() * 10) * opacity,
          maxLife: 30,
          color: j === 0 ? '#ffffff' : color,
          size: (3 + Math.random() * 2) * opacity
        });
      }
    }

    // Spirit form at target
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 20;
      this.particles.push({
        pos: { x: targetPos.x + Math.cos(ang) * r, y: targetPos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 1, y: -1 - Math.random() },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: color,
        size: 2 + Math.random() * 2
      });
    }

    // Ethereal wisps around target
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const r = 25 + Math.random() * 10;
      this.particles.push({
        pos: { x: targetPos.x + Math.cos(ang) * r, y: targetPos.y + Math.sin(ang) * r },
        vel: { x: Math.cos(ang + Math.PI / 2) * 1.5, y: Math.sin(ang + Math.PI / 2) * 1.5 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#aaddff',
        size: 2
      });
    }

    // Connection sparkles
    for (let i = 0; i < 8; i++) {
      const t = Math.random();
      const x = sourcePos.x + dx * t;
      const y = sourcePos.y + dy * t;
      this.particles.push({
        pos: { x, y },
        vel: { x: 0, y: -0.3 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#ffffff',
        size: 1.5
      });
    }
  }

  private createEnergyAbsorptionEffect(pos: Vec2, radius: number, color: string = '#ffaa44') {
    // Particles spiraling inward from the edge
    const spiralCount = 24;
    for (let i = 0; i < spiralCount; i++) {
      const ang = (i / spiralCount) * Math.PI * 2;
      const startR = radius * (0.8 + Math.random() * 0.4);

      // Calculate spiral velocity toward center
      const inwardSpeed = 4 + Math.random() * 2;
      const tangentSpeed = 2 + Math.random();

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * startR, y: pos.y + Math.sin(ang) * startR },
        vel: {
          x: -Math.cos(ang) * inwardSpeed + Math.cos(ang + Math.PI / 2) * tangentSpeed,
          y: -Math.sin(ang) * inwardSpeed + Math.sin(ang + Math.PI / 2) * tangentSpeed
        },
        life: 18 + Math.random() * 8,
        maxLife: 26,
        color: i % 4 === 0 ? '#ffffff' : color,
        size: 2 + Math.random() * 2
      });
    }

    // Energy wisps being pulled in
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * (0.5 + Math.random() * 0.5);

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: -Math.cos(ang) * 3, y: -Math.sin(ang) * 3 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#ffcc88',
        size: 3 + Math.random() * 2
      });
    }

    // Central absorption glow
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.5 + Math.random() * 0.5;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 10, y: pos.y + (Math.random() - 0.5) * 10 },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#ffffff',
        size: 3 + Math.random() * 2
      });
    }

    // Outer ring pulsing inward
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: -Math.cos(ang) * 2, y: -Math.sin(ang) * 2 },
        life: 12 + Math.random() * 6,
        maxLife: 18,
        color: color,
        size: 2
      });
    }
  }

  private createMagicMissileTrailEffect(pos: Vec2, dir: Vec2, color: string = '#ff44aa') {
    const speed = Math.sqrt(dir.x * dir.x + dir.y * dir.y) || 1;
    const normDir = { x: dir.x / speed, y: dir.y / speed };

    // Main trail particles
    for (let i = 0; i < 5; i++) {
      const perpX = -normDir.y;
      const perpY = normDir.x;
      const offset = (Math.random() - 0.5) * 8;

      this.particles.push({
        pos: { x: pos.x + perpX * offset, y: pos.y + perpY * offset },
        vel: { x: -normDir.x * 2 + (Math.random() - 0.5), y: -normDir.y * 2 + (Math.random() - 0.5) },
        life: 10 + Math.random() * 6,
        maxLife: 16,
        color: i === 0 ? '#ffffff' : color,
        size: 2 + Math.random()
      });
    }

    // Sparkle particles
    for (let i = 0; i < 3; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random();
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd - normDir.x, y: Math.sin(ang) * spd - normDir.y },
        life: 8 + Math.random() * 5,
        maxLife: 13,
        color: '#ffffff',
        size: 1.5
      });
    }
  }

  private createGroundCrackEffect(pos: Vec2, radius: number, intensity: number = 1) {
    // Crack lines radiating outward
    const crackCount = 6 + Math.floor(intensity * 2);
    for (let i = 0; i < crackCount; i++) {
      const baseAng = (i / crackCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const length = radius * (0.6 + Math.random() * 0.4);

      // Particles along crack line
      for (let j = 0; j < 6; j++) {
        const t = j / 6;
        const dist = length * t;
        const wobble = (Math.random() - 0.5) * 5;

        this.particles.push({
          pos: { x: pos.x + Math.cos(baseAng) * dist + wobble, y: pos.y + Math.sin(baseAng) * dist },
          vel: { x: (Math.random() - 0.5) * 0.5, y: -0.3 - Math.random() * 0.3 },
          life: 30 + Math.random() * 20,
          maxLife: 50,
          color: j < 2 ? '#443322' : '#332211',
          size: 2 + Math.random()
        });
      }
    }

    // Debris chunks flying up
    for (let i = 0; i < 10 * intensity; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.7;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 3, y: -3 - Math.random() * 3 * intensity },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: Math.random() > 0.5 ? '#554433' : '#665544',
        size: 2 + Math.random() * 2
      });
    }

    // Dust rising from cracks
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.8;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -1 - Math.random() * 0.5 },
        life: 35 + Math.random() * 20,
        maxLife: 55,
        color: '#887766',
        size: 3 + Math.random() * 3
      });
    }

    this.triggerScreenShake(5 * intensity, 15);
  }

  private createElectricFieldEffect(pos: Vec2, radius: number) {
    // Random lightning arcs within the field
    for (let arc = 0; arc < 6; arc++) {
      const startAng = Math.random() * Math.PI * 2;
      const endAng = startAng + Math.PI * (0.3 + Math.random() * 0.7);
      const startR = radius * (0.3 + Math.random() * 0.5);
      const endR = radius * (0.3 + Math.random() * 0.5);

      const startPos = { x: pos.x + Math.cos(startAng) * startR, y: pos.y + Math.sin(startAng) * startR };
      const endPos = { x: pos.x + Math.cos(endAng) * endR, y: pos.y + Math.sin(endAng) * endR };

      const dx = endPos.x - startPos.x;
      const dy = endPos.y - startPos.y;
      const segments = 4;

      let prevX = startPos.x;
      let prevY = startPos.y;

      for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        let x = startPos.x + dx * t;
        let y = startPos.y + dy * t;

        if (i < segments) {
          x += (Math.random() - 0.5) * 15;
          y += (Math.random() - 0.5) * 15;
        }

        // Lightning segment particles
        for (let j = 0; j < 2; j++) {
          const pt = Math.random();
          this.particles.push({
            pos: { x: prevX + (x - prevX) * pt, y: prevY + (y - prevY) * pt },
            vel: { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 },
            life: 4 + Math.random() * 3,
            maxLife: 7,
            color: j === 0 ? '#ffffff' : '#88ddff',
            size: j === 0 ? 2.5 : 2
          });
        }

        prevX = x;
        prevY = y;
      }
    }

    // Static sparks around the field
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * (0.5 + Math.random() * 0.5);

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3 },
        life: 6 + Math.random() * 4,
        maxLife: 10,
        color: '#aaeeff',
        size: 1.5 + Math.random()
      });
    }

    // Ambient electric glow
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.6;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: 0 },
        life: 8 + Math.random() * 5,
        maxLife: 13,
        color: '#44ccff',
        size: 3 + Math.random() * 2
      });
    }
  }

  private createGravityWellEffect(pos: Vec2, radius: number, strength: number = 1) {
    // Warped space distortion rings
    for (let ring = 0; ring < 4; ring++) {
      const ringRadius = radius * (0.25 + ring * 0.25);
      const particleCount = 8 + ring * 4;
      const rotationOffset = ring * 0.5;

      for (let i = 0; i < particleCount; i++) {
        const ang = (i / particleCount) * Math.PI * 2 + rotationOffset;
        // Particles orbit and slowly spiral inward
        const orbitSpeed = 0.08 * (4 - ring);
        const inwardSpeed = 0.5 * strength;

        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * ringRadius, y: pos.y + Math.sin(ang) * ringRadius },
          vel: {
            x: Math.cos(ang + Math.PI / 2) * orbitSpeed * ringRadius - Math.cos(ang) * inwardSpeed,
            y: Math.sin(ang + Math.PI / 2) * orbitSpeed * ringRadius - Math.sin(ang) * inwardSpeed
          },
          life: 20 + ring * 5,
          maxLife: 20 + ring * 5,
          color: ring === 0 ? '#220044' : ring === 1 ? '#440066' : ring === 2 ? '#6600aa' : '#8800cc',
          size: 3 - ring * 0.4
        });
      }
    }

    // Event horizon dark core
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: 0 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#110011',
        size: 4 + Math.random() * 3
      });
    }

    // Debris being pulled in
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * (0.7 + Math.random() * 0.5);
      const pullSpeed = 3 + Math.random() * 2;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: -Math.cos(ang) * pullSpeed, y: -Math.sin(ang) * pullSpeed },
        life: 18 + Math.random() * 8,
        maxLife: 26,
        color: '#aa88cc',
        size: 2 + Math.random()
      });
    }

    // Bright accretion disk glow
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const r = radius * 0.4;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: Math.cos(ang + Math.PI / 2) * 3, y: Math.sin(ang + Math.PI / 2) * 3 },
        life: 10 + Math.random() * 5,
        maxLife: 15,
        color: '#ffffff',
        size: 2
      });
    }
  }

  private createBerserkerRageEffect(pos: Vec2, radius: number) {
    // Fiery rage aura particles rising
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * (0.5 + Math.random() * 0.5);
      const colors = ['#ff2200', '#ff4400', '#ff6600', '#ffaa00'];

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 2, y: -2 - Math.random() * 3 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 2
      });
    }

    // Angry pulsing ring
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang) * 1.5, y: Math.sin(ang) * 1.5 },
        life: 10 + Math.random() * 5,
        maxLife: 15,
        color: '#ff0000',
        size: 3
      });
    }

    // Veiny red energy tendrils
    for (let i = 0; i < 6; i++) {
      const baseAng = (i / 6) * Math.PI * 2 + Math.random() * 0.3;
      for (let j = 0; j < 4; j++) {
        const dist = (j / 4) * radius * 0.8;
        this.particles.push({
          pos: { x: pos.x + Math.cos(baseAng) * dist, y: pos.y + Math.sin(baseAng) * dist },
          vel: { x: Math.cos(baseAng) * 0.5, y: Math.sin(baseAng) * 0.5 - 0.5 },
          life: 12 + j * 2,
          maxLife: 12 + j * 2,
          color: '#cc0000',
          size: 2.5 - j * 0.3
        });
      }
    }

    // Smoke from the rage
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.6;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -1.5 - Math.random() },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#442222',
        size: 4 + Math.random() * 3
      });
    }

    this.triggerScreenShake(3, 8);
  }

  private createWeaponEnchantGlowEffect(pos: Vec2, dir: Vec2, enchantType: string) {
    const colors: Record<string, string[]> = {
      fire: ['#ff4400', '#ff8800', '#ffcc00'],
      ice: ['#44aaff', '#88ccff', '#ffffff'],
      lightning: ['#ffff44', '#ffff88', '#ffffff'],
      poison: ['#44ff44', '#88ff88', '#ccffcc'],
      holy: ['#ffdd44', '#ffee88', '#ffffff'],
      shadow: ['#442266', '#663388', '#8844aa']
    };
    const enchantColors = colors[enchantType] || colors.fire;

    const speed = Math.sqrt(dir.x * dir.x + dir.y * dir.y) || 1;
    const normDir = { x: dir.x / speed, y: dir.y / speed };
    const perpX = -normDir.y;
    const perpY = normDir.x;

    // Enchant glow around weapon
    for (let i = 0; i < 8; i++) {
      const offset = (Math.random() - 0.5) * 15;
      const alongWeapon = (Math.random() - 0.5) * 20;

      this.particles.push({
        pos: {
          x: pos.x + perpX * offset + normDir.x * alongWeapon,
          y: pos.y + perpY * offset + normDir.y * alongWeapon
        },
        vel: {
          x: perpX * (Math.random() - 0.5) * 2 + (Math.random() - 0.5),
          y: perpY * (Math.random() - 0.5) * 2 - 0.5
        },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: enchantColors[Math.floor(Math.random() * enchantColors.length)],
        size: 2 + Math.random() * 2
      });
    }

    // Trailing sparkles
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 10, y: pos.y + (Math.random() - 0.5) * 10 },
        vel: { x: -normDir.x * 1.5, y: -normDir.y * 1.5 },
        life: 8 + Math.random() * 5,
        maxLife: 13,
        color: '#ffffff',
        size: 1.5
      });
    }
  }

  private createSmokeBombEffect(pos: Vec2, radius: number) {
    // Dense smoke cloud expanding
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.3;
      const expandSpeed = 1 + Math.random() * 2;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: Math.cos(ang) * expandSpeed, y: Math.sin(ang) * expandSpeed - 0.5 },
        life: 50 + Math.random() * 30,
        maxLife: 80,
        color: `rgb(${60 + Math.random() * 30}, ${60 + Math.random() * 30}, ${70 + Math.random() * 30})`,
        size: 5 + Math.random() * 5
      });
    }

    // Inner darker smoke
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.2;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 1.5, y: -1 - Math.random() },
        life: 40 + Math.random() * 30,
        maxLife: 70,
        color: '#333344',
        size: 4 + Math.random() * 4
      });
    }

    // Initial poof burst
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const spd = 3 + Math.random() * 2;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#555566',
        size: 3 + Math.random() * 2
      });
    }

    // Swirling wisps
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * (0.3 + Math.random() * 0.4);

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: Math.cos(ang + Math.PI / 2) * 2, y: Math.sin(ang + Math.PI / 2) * 2 - 0.5 },
        life: 35 + Math.random() * 20,
        maxLife: 55,
        color: '#666677',
        size: 3 + Math.random() * 2
      });
    }
  }

  private createNecroticBurstEffect(pos: Vec2, radius: number) {
    // Sickly green-black explosion
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 4;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 18 + Math.random() * 12,
        maxLife: 30,
        color: Math.random() > 0.5 ? '#225522' : '#112211',
        size: 3 + Math.random() * 2
      });
    }

    // Skull-like wisps rising
    for (let i = 0; i < 8; i++) {
      const x = pos.x + (Math.random() - 0.5) * radius;
      this.particles.push({
        pos: { x, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 1, y: -2 - Math.random() * 2 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#88aa88',
        size: 2 + Math.random() * 2
      });
    }

    // Dark energy ring
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius * 0.5, y: pos.y + Math.sin(ang) * radius * 0.5 },
        vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 },
        life: 12 + Math.random() * 6,
        maxLife: 18,
        color: '#334433',
        size: 2.5
      });
    }

    // Bone fragment particles
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 3;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 1 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#ccccaa',
        size: 2
      });
    }

    this.triggerScreenShake(5, 10);
  }

  private createWaterSplashWaveEffect(pos: Vec2, radius: number, intensity: number = 1) {
    // Concentric water ripple rings expanding
    for (let ring = 0; ring < 4; ring++) {
      const ringDelay = ring * 3;
      const particleCount = 16 + ring * 4;

      for (let i = 0; i < particleCount; i++) {
        const ang = (i / particleCount) * Math.PI * 2;
        const startR = ring * 8;
        const spd = (2 + ring * 0.5) * intensity;

        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * startR, y: pos.y + Math.sin(ang) * startR },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 18 + ring * 4 - ringDelay,
          maxLife: 18 + ring * 4,
          color: ring === 0 ? '#ffffff' : ring === 1 ? '#aaddff' : '#66aadd',
          size: 2.5 - ring * 0.3
        });
      }
    }

    // Water droplets splashing up
    for (let i = 0; i < 15 * intensity; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.4;
      const upSpeed = 3 + Math.random() * 4 * intensity;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 3, y: -upSpeed },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: Math.random() > 0.3 ? '#88ccff' : '#ffffff',
        size: 2 + Math.random() * 2
      });
    }

    // Mist spray
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.3;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 2, y: -1 - Math.random() * 2 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#aaccee',
        size: 3 + Math.random() * 3
      });
    }

    // Foam bubbles
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.5;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: Math.cos(ang) * 0.5, y: -0.3 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#ffffff',
        size: 1.5 + Math.random()
      });
    }
  }

  private createPhoenixRebirthEffect(pos: Vec2, radius: number) {
    // Brilliant fire explosion outward
    for (let i = 0; i < 25; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 4;
      const colors = ['#ff2200', '#ff6600', '#ffaa00', '#ffdd00', '#ffffff'];

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 3
      });
    }

    // Rising phoenix wing silhouette (V-shaped particle pattern)
    for (let wing = -1; wing <= 1; wing += 2) {
      for (let i = 0; i < 8; i++) {
        const spread = (i / 8) * 0.8;
        const height = i * 8;
        const x = pos.x + wing * spread * radius * 0.6;

        this.particles.push({
          pos: { x, y: pos.y },
          vel: { x: wing * 1.5, y: -3 - i * 0.3 },
          life: 25 + i * 2,
          maxLife: 25 + i * 2,
          color: i < 3 ? '#ffffff' : i < 6 ? '#ffdd44' : '#ff8800',
          size: 3 - i * 0.2
        });
      }
    }

    // Central ascending flame pillar
    for (let i = 0; i < 15; i++) {
      const x = pos.x + (Math.random() - 0.5) * 15;
      const startY = pos.y - Math.random() * 10;

      this.particles.push({
        pos: { x, y: startY },
        vel: { x: (Math.random() - 0.5) * 1, y: -4 - Math.random() * 3 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: Math.random() > 0.3 ? '#ffaa00' : '#ffffff',
        size: 3 + Math.random() * 2
      });
    }

    // Golden sparkles
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 2, y: -2 - Math.random() * 2 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#ffee88',
        size: 1.5 + Math.random()
      });
    }

    // Ground fire ring
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: 0, y: -1.5 - Math.random() },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#ff4400',
        size: 2.5
      });
    }

    this.triggerScreenShake(12, 25);
  }

  private createCrystalFormationEffect(pos: Vec2, radius: number, color: string = '#88ddff') {
    // Crystal shards emerging from ground
    const shardCount = 8;
    for (let i = 0; i < shardCount; i++) {
      const ang = (i / shardCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
      const shardLength = radius * (0.4 + Math.random() * 0.4);

      // Each shard is multiple particles in a line going up
      for (let j = 0; j < 5; j++) {
        const t = j / 5;
        const r = radius * 0.3 + shardLength * t * 0.3;
        const y = pos.y - t * shardLength;

        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * r, y: y },
          vel: { x: Math.cos(ang) * 0.5, y: -1 - t * 0.5 },
          life: 25 + j * 3,
          maxLife: 25 + j * 3,
          color: j < 2 ? '#ffffff' : color,
          size: 3 - t
        });
      }
    }

    // Crystal dust and sparkles
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.6;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 1.5, y: -1.5 - Math.random() * 1.5 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: Math.random() > 0.5 ? '#ffffff' : color,
        size: 1.5 + Math.random()
      });
    }

    // Reflective glints
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.8;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r - Math.random() * 30 },
        vel: { x: 0, y: 0 },
        life: 10 + Math.random() * 10,
        maxLife: 20,
        color: '#ffffff',
        size: 2 + Math.random()
      });
    }

    // Ground frost ring
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang) * 0.3, y: Math.sin(ang) * 0.3 },
        life: 25 + Math.random() * 10,
        maxLife: 35,
        color: color,
        size: 2
      });
    }

    this.triggerScreenShake(4, 8);
  }

  private createVoidRiftEffect(pos: Vec2, width: number, height: number) {
    // Void tear particles along vertical line
    for (let i = 0; i < 20; i++) {
      const y = pos.y + (Math.random() - 0.5) * height;
      const x = pos.x + (Math.random() - 0.5) * width * 0.3;

      this.particles.push({
        pos: { x, y },
        vel: { x: (Math.random() - 0.5) * 1, y: (Math.random() - 0.5) * 1 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.7 ? '#ffffff' : Math.random() > 0.5 ? '#440066' : '#220033',
        size: 3 + Math.random() * 2
      });
    }

    // Energy being sucked into the rift
    for (let i = 0; i < 15; i++) {
      const side = Math.random() > 0.5 ? 1 : -1;
      const startX = pos.x + side * (width * 0.5 + Math.random() * 30);
      const startY = pos.y + (Math.random() - 0.5) * height;
      const pullSpeed = 2 + Math.random() * 2;

      this.particles.push({
        pos: { x: startX, y: startY },
        vel: { x: -side * pullSpeed, y: (Math.random() - 0.5) },
        life: 18 + Math.random() * 8,
        maxLife: 26,
        color: '#8844aa',
        size: 2 + Math.random()
      });
    }

    // Edge glow particles
    for (let i = 0; i < 12; i++) {
      const t = i / 12;
      const y = pos.y - height / 2 + t * height;
      const side = i % 2 === 0 ? -1 : 1;

      this.particles.push({
        pos: { x: pos.x + side * width * 0.15, y },
        vel: { x: side * 0.5, y: (Math.random() - 0.5) * 0.5 },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: '#aa66cc',
        size: 2
      });
    }

    // Void sparks
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 2;

      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * width * 0.5, y: pos.y + (Math.random() - 0.5) * height * 0.5 },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 10 + Math.random() * 6,
        maxLife: 16,
        color: '#cc88ff',
        size: 1.5
      });
    }

    // Dark core
    for (let i = 0; i < 6; i++) {
      const y = pos.y + (Math.random() - 0.5) * height * 0.6;
      this.particles.push({
        pos: { x: pos.x, y },
        vel: { x: 0, y: 0 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#110011',
        size: 4 + Math.random() * 2
      });
    }
  }

  private createCorruptionSpreadEffect(pos: Vec2, radius: number) {
    // Dark tendrils spreading outward
    const tendrilCount = 8;
    for (let i = 0; i < tendrilCount; i++) {
      const baseAng = (i / tendrilCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;

      for (let j = 0; j < 6; j++) {
        const t = j / 6;
        const dist = radius * t;
        const wobble = Math.sin(j * 2) * 10;

        this.particles.push({
          pos: { x: pos.x + Math.cos(baseAng) * dist + wobble, y: pos.y + Math.sin(baseAng) * dist },
          vel: { x: Math.cos(baseAng) * 1.5, y: Math.sin(baseAng) * 1.5 },
          life: 25 + j * 3,
          maxLife: 25 + j * 3,
          color: j < 2 ? '#220022' : j < 4 ? '#440044' : '#660066',
          size: 3 - t
        });
      }
    }

    // Corruption bubbles rising
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.7;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -1 - Math.random() },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#552255',
        size: 2 + Math.random() * 2
      });
    }

    // Dark mist spreading
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.5 + Math.random();

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 40 + Math.random() * 20,
        maxLife: 60,
        color: '#331133',
        size: 5 + Math.random() * 4
      });
    }

    // Corrupt sparkles
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: -0.3 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#aa44aa',
        size: 1.5
      });
    }
  }

  private createPurificationWaveEffect(pos: Vec2, radius: number) {
    // Brilliant white expanding ring
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      const spd = 4;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 20,
        maxLife: 20,
        color: '#ffffff',
        size: 3
      });
    }

    // Secondary golden ring
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + Math.PI / 16;
      const spd = 3;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 25,
        maxLife: 25,
        color: '#ffdd88',
        size: 2.5
      });
    }

    // Rising light particles
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -2 - Math.random() * 2 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: Math.random() > 0.5 ? '#ffffff' : '#ffeecc',
        size: 2 + Math.random()
      });
    }

    // Holy sparkles
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.8;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: -0.5 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#ffffff',
        size: 1.5 + Math.random()
      });
    }

    // Ground cleanse effect
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: 0, y: -1 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#aaddff',
        size: 2
      });
    }

    this.triggerScreenShake(4, 10);
  }

  private createDimensionalTearEffect(pos: Vec2, radius: number) {
    // Crackling reality fractures
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const length = radius * (0.5 + Math.random() * 0.5);

      // Jagged fracture line
      let prevX = pos.x;
      let prevY = pos.y;
      for (let j = 0; j < 5; j++) {
        const t = (j + 1) / 5;
        let x = pos.x + Math.cos(ang) * length * t;
        let y = pos.y + Math.sin(ang) * length * t;

        // Add jaggedness
        if (j < 4) {
          x += (Math.random() - 0.5) * 15;
          y += (Math.random() - 0.5) * 15;
        }

        this.particles.push({
          pos: { x: (prevX + x) / 2, y: (prevY + y) / 2 },
          vel: { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 },
          life: 12 + Math.random() * 8,
          maxLife: 20,
          color: Math.random() > 0.5 ? '#ffffff' : '#aa88ff',
          size: 2.5
        });

        prevX = x;
        prevY = y;
      }
    }

    // Dimension bleed particles
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.6;
      const colors = ['#ff44aa', '#44aaff', '#aa44ff', '#ffffff'];

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 2
      });
    }

    // Energy discharge
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 3;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: '#cc88ff',
        size: 2
      });
    }

    // Flickering unstable core
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 10, y: pos.y + (Math.random() - 0.5) * 10 },
        vel: { x: 0, y: 0 },
        life: 8 + Math.random() * 6,
        maxLife: 14,
        color: Math.random() > 0.5 ? '#ffffff' : '#000000',
        size: 3 + Math.random() * 2
      });
    }

    this.triggerScreenShake(6, 12);
  }

  private createMeteorShowerEffect(centerPos: Vec2, radius: number, meteorCount: number = 5) {
    for (let m = 0; m < meteorCount; m++) {
      // Random impact position within radius
      const impactX = centerPos.x + (Math.random() - 0.5) * radius * 2;
      const impactY = centerPos.y + (Math.random() - 0.5) * radius * 2;
      const impactPos = { x: impactX, y: impactY };

      // Meteor trail descending
      const trailLength = 80 + Math.random() * 40;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.4; // Mostly downward

      for (let i = 0; i < 10; i++) {
        const t = i / 10;
        const x = impactX - Math.cos(angle) * trailLength * t;
        const y = impactY - Math.sin(angle) * trailLength * t - trailLength * t;

        this.particles.push({
          pos: { x, y },
          vel: { x: Math.cos(angle) * 6, y: Math.sin(angle) * 6 + 4 },
          life: 10 + i * 2,
          maxLife: 10 + i * 2,
          color: i < 3 ? '#ffffff' : i < 6 ? '#ffaa00' : '#ff4400',
          size: 4 - t * 2
        });
      }

      // Impact explosion
      for (let i = 0; i < 12; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 4;

        this.particles.push({
          pos: { ...impactPos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color: Math.random() > 0.3 ? '#ff6600' : '#ffaa00',
          size: 3 + Math.random() * 2
        });
      }

      // Impact debris
      for (let i = 0; i < 8; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 1 + Math.random() * 3;

        this.particles.push({
          pos: { ...impactPos },
          vel: { x: Math.cos(ang) * spd, y: -2 - Math.random() * 3 },
          life: 20 + Math.random() * 15,
          maxLife: 35,
          color: '#554433',
          size: 2 + Math.random()
        });
      }
    }

    this.triggerScreenShake(10, 20);
  }

  private createSandStormEffect(pos: Vec2, radius: number, intensity: number = 1) {
    // Dense sand particles blowing horizontally
    const windDirection = Math.random() * Math.PI * 2;
    const windSpeed = 4 + intensity * 2;

    for (let i = 0; i < 30 * intensity; i++) {
      const startX = pos.x + (Math.random() - 0.5) * radius * 2;
      const startY = pos.y + (Math.random() - 0.5) * radius * 2;

      this.particles.push({
        pos: { x: startX, y: startY },
        vel: {
          x: Math.cos(windDirection) * windSpeed + (Math.random() - 0.5) * 2,
          y: Math.sin(windDirection) * windSpeed * 0.3 + (Math.random() - 0.5)
        },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: `rgb(${180 + Math.random() * 40}, ${150 + Math.random() * 40}, ${100 + Math.random() * 30})`,
        size: 2 + Math.random() * 3
      });
    }

    // Larger dust clouds
    for (let i = 0; i < 8 * intensity; i++) {
      const x = pos.x + (Math.random() - 0.5) * radius * 1.5;
      const y = pos.y + (Math.random() - 0.5) * radius;

      this.particles.push({
        pos: { x, y },
        vel: { x: Math.cos(windDirection) * windSpeed * 0.7, y: (Math.random() - 0.5) * 0.5 },
        life: 40 + Math.random() * 30,
        maxLife: 70,
        color: '#aa9966',
        size: 5 + Math.random() * 5
      });
    }

    // Small debris
    for (let i = 0; i < 10; i++) {
      const x = pos.x + (Math.random() - 0.5) * radius;
      const y = pos.y + (Math.random() - 0.5) * radius * 0.5;

      this.particles.push({
        pos: { x, y },
        vel: {
          x: Math.cos(windDirection) * windSpeed * 1.2,
          y: Math.sin(windDirection) * 0.5 + (Math.random() - 0.5) * 2
        },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#887755',
        size: 1.5 + Math.random()
      });
    }
  }

  private createThunderStrikeEffect(pos: Vec2, radius: number) {
    // Bright central flash
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 6 + Math.random() * 4,
        maxLife: 10,
        color: '#ffffff',
        size: 4 + Math.random() * 3
      });
    }

    // Lightning bolt from sky
    const boltHeight = 150;
    let prevX = pos.x;
    let prevY = pos.y - boltHeight;

    for (let i = 0; i < 8; i++) {
      const t = (i + 1) / 8;
      let x = pos.x + (Math.random() - 0.5) * 30 * (1 - t);
      let y = pos.y - boltHeight * (1 - t);

      // Bolt segment particles
      for (let j = 0; j < 4; j++) {
        const pt = Math.random();
        this.particles.push({
          pos: { x: prevX + (x - prevX) * pt, y: prevY + (y - prevY) * pt },
          vel: { x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3 },
          life: 5 + Math.random() * 4,
          maxLife: 9,
          color: j === 0 ? '#ffffff' : '#aaddff',
          size: j === 0 ? 3 : 2
        });
      }

      prevX = x;
      prevY = y;
    }

    // Ground impact burst
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const spd = 4 + Math.random() * 3;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: '#88ccff',
        size: 2.5
      });
    }

    // Electric sparks scattering
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 4;

      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y + (Math.random() - 0.5) * 20 },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 8 + Math.random() * 6,
        maxLife: 14,
        color: '#ffff88',
        size: 1.5 + Math.random()
      });
    }

    // Smoke from impact point
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y + (Math.random() - 0.5) * 15 },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -1 - Math.random() },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#666677',
        size: 3 + Math.random() * 3
      });
    }

    this.triggerScreenShake(12, 15);
  }

  private createLifeDrainEffect(sourcePos: Vec2, targetPos: Vec2, intensity: number = 1) {
    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Life essence flowing from source to target
    const particleCount = Math.floor(15 * intensity);
    for (let i = 0; i < particleCount; i++) {
      const t = Math.random();
      const x = sourcePos.x + dx * t;
      const y = sourcePos.y + dy * t;
      const perpX = -dy / dist;
      const perpY = dx / dist;
      const offset = Math.sin(t * Math.PI * 3) * 15;

      this.particles.push({
        pos: { x: x + perpX * offset, y: y + perpY * offset },
        vel: { x: dx / dist * 3, y: dy / dist * 3 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.5 ? '#ff4444' : '#cc2222',
        size: 2 + Math.random() * 2
      });
    }

    // Drain effect at source (life leaving)
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 20;
      this.particles.push({
        pos: { x: sourcePos.x + Math.cos(ang) * r, y: sourcePos.y + Math.sin(ang) * r },
        vel: { x: dx / dist * 2, y: dy / dist * 2 },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: '#ff6666',
        size: 2
      });
    }

    // Absorption effect at target (life arriving)
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 25 + Math.random() * 15;
      this.particles.push({
        pos: { x: targetPos.x + Math.cos(ang) * r, y: targetPos.y + Math.sin(ang) * r },
        vel: { x: -Math.cos(ang) * 2, y: -Math.sin(ang) * 2 },
        life: 15 + Math.random() * 8,
        maxLife: 23,
        color: '#22cc22',
        size: 2 + Math.random()
      });
    }

    // Green healing glow at target
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        pos: { x: targetPos.x + (Math.random() - 0.5) * 10, y: targetPos.y + (Math.random() - 0.5) * 10 },
        vel: { x: 0, y: -0.5 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#88ff88',
        size: 3 + Math.random() * 2
      });
    }
  }

  private createBlessingAuraEffect(pos: Vec2, radius: number, blessingType: string = 'divine') {
    const colorSchemes: Record<string, string[]> = {
      divine: ['#ffdd44', '#ffee88', '#ffffff'],
      nature: ['#44dd44', '#88ff88', '#ccffcc'],
      arcane: ['#8844ff', '#aa88ff', '#ddbbff'],
      protection: ['#4488ff', '#88bbff', '#bbddff']
    };
    const colors = colorSchemes[blessingType] || colorSchemes.divine;

    // Gentle ascending particles
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * (0.3 + Math.random() * 0.7);

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -1.5 - Math.random() },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 2
      });
    }

    // Halo ring around entity
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const ringRadius = radius * 0.5;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * ringRadius, y: pos.y - 20 + Math.sin(ang) * ringRadius * 0.3 },
        vel: { x: Math.cos(ang + Math.PI / 2) * 0.5, y: 0 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: colors[0],
        size: 2
      });
    }

    // Sparkle glints
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.8;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: -0.3 },
        life: 15 + Math.random() * 15,
        maxLife: 30,
        color: '#ffffff',
        size: 1.5
      });
    }

    // Gentle outward pulse
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 1.5, y: Math.sin(ang) * 1.5 },
        life: 15 + Math.random() * 5,
        maxLife: 20,
        color: colors[1],
        size: 2
      });
    }
  }

  private createCelestialBeamEffect(pos: Vec2, radius: number) {
    // Beam of light descending from above
    const beamHeight = 250;
    for (let y = 0; y < beamHeight; y += 8) {
      const t = y / beamHeight;
      const width = radius * (0.5 + t * 0.5);
      const particleCount = 4 + Math.floor(t * 4);

      for (let i = 0; i < particleCount; i++) {
        const x = pos.x + (Math.random() - 0.5) * width;
        this.particles.push({
          pos: { x, y: pos.y - y },
          vel: { x: (Math.random() - 0.5) * 0.5, y: 2 + Math.random() },
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color: t < 0.3 ? '#ffffff' : t < 0.6 ? '#ffffaa' : '#ffee88',
          size: 3 - t
        });
      }
    }

    // Ground illumination ring
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang) * 0.5, y: Math.sin(ang) * 0.5 },
        life: 25 + Math.random() * 10,
        maxLife: 35,
        color: '#ffdd88',
        size: 2.5
      });
    }

    // Central glow and sparkles
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.6;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 1, y: -1.5 - Math.random() },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: Math.random() > 0.5 ? '#ffffff' : '#ffffcc',
        size: 2 + Math.random()
      });
    }

    // Stardust falling
    for (let i = 0; i < 10; i++) {
      const x = pos.x + (Math.random() - 0.5) * radius * 1.5;
      const y = pos.y - Math.random() * 100;
      this.particles.push({
        pos: { x, y },
        vel: { x: (Math.random() - 0.5) * 0.5, y: 1 + Math.random() },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#ffffff',
        size: 1.5
      });
    }

    this.triggerScreenShake(5, 15);
  }

  private createVolcanicEruptionEffect(pos: Vec2, radius: number, intensity: number = 1) {
    // Central magma burst
    for (let i = 0; i < 20 * intensity; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.8;
      const spd = 5 + Math.random() * 6 * intensity;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 25 + Math.random() * 20,
        maxLife: 45,
        color: Math.random() > 0.5 ? '#ff4400' : Math.random() > 0.5 ? '#ff8800' : '#ffcc00',
        size: 3 + Math.random() * 3
      });
    }

    // Lava chunks with gravity
    for (let i = 0; i < 12 * intensity; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.6;
      const spd = 4 + Math.random() * 5;

      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd + 0.5 }, // Add gravity
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#cc2200',
        size: 4 + Math.random() * 3
      });
    }

    // Smoke and ash rising
    for (let i = 0; i < 15; i++) {
      const x = pos.x + (Math.random() - 0.5) * radius * 0.6;
      this.particles.push({
        pos: { x, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 1.5, y: -2 - Math.random() * 3 },
        life: 40 + Math.random() * 30,
        maxLife: 70,
        color: `rgb(${50 + Math.random() * 30}, ${50 + Math.random() * 30}, ${50 + Math.random() * 30})`,
        size: 5 + Math.random() * 5
      });
    }

    // Ground fire ring
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius * 0.5, y: pos.y + Math.sin(ang) * radius * 0.3 },
        vel: { x: Math.cos(ang) * 1, y: -0.5 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#ff6600',
        size: 3
      });
    }

    this.triggerScreenShake(15 * intensity, 25);
  }

  private createWindSlashEffect(pos: Vec2, angle: number, length: number = 60) {
    // Wind arc particles
    const perpAngle = angle + Math.PI / 2;
    const arcSpread = 0.4;

    for (let i = 0; i < 15; i++) {
      const t = i / 15;
      const currentAng = angle - arcSpread / 2 + arcSpread * t;
      const dist = length * (0.5 + t * 0.5);

      this.particles.push({
        pos: { x: pos.x + Math.cos(currentAng) * dist, y: pos.y + Math.sin(currentAng) * dist },
        vel: { x: Math.cos(currentAng) * 4, y: Math.sin(currentAng) * 4 },
        life: 8 + Math.random() * 5,
        maxLife: 13,
        color: '#aaccee',
        size: 3 - t
      });
    }

    // Speed lines along the slash
    for (let i = 0; i < 8; i++) {
      const offset = (Math.random() - 0.5) * 20;
      const startDist = Math.random() * length * 0.5;

      this.particles.push({
        pos: {
          x: pos.x + Math.cos(angle) * startDist + Math.cos(perpAngle) * offset,
          y: pos.y + Math.sin(angle) * startDist + Math.sin(perpAngle) * offset
        },
        vel: { x: Math.cos(angle) * 6, y: Math.sin(angle) * 6 },
        life: 6 + Math.random() * 4,
        maxLife: 10,
        color: '#ffffff',
        size: 2
      });
    }

    // Trailing wind particles
    for (let i = 0; i < 6; i++) {
      const offset = (Math.random() - 0.5) * 30;
      this.particles.push({
        pos: { x: pos.x + Math.cos(perpAngle) * offset, y: pos.y + Math.sin(perpAngle) * offset },
        vel: { x: Math.cos(angle) * 3, y: Math.sin(angle) * 3 },
        life: 12 + Math.random() * 6,
        maxLife: 18,
        color: '#88aacc',
        size: 2 + Math.random()
      });
    }
  }

  private createManaBurstEffect(pos: Vec2, radius: number, color: string = '#4488ff') {
    // Central mana explosion
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 4;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.3 ? color : '#ffffff',
        size: 3 + Math.random() * 2
      });
    }

    // Mana crystal fragments
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      const spd = 3 + Math.random() * 2;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 1 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: color,
        size: 2.5
      });
    }

    // Ethereal mist
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.5;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 1, y: -0.5 - Math.random() * 0.5 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: color,
        size: 4 + Math.random() * 3
      });
    }

    // Sparkle trail
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.8;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: -0.3 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#ffffff',
        size: 1.5
      });
    }

    this.triggerScreenShake(4, 8);
  }

  private createSoulReleaseEffect(pos: Vec2, soulCount: number = 3) {
    // Multiple souls ascending
    for (let s = 0; s < soulCount; s++) {
      const offsetX = (Math.random() - 0.5) * 40;
      const delay = s * 5;

      // Soul core particles
      for (let i = 0; i < 8; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = Math.random() * 10;

        this.particles.push({
          pos: { x: pos.x + offsetX + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
          vel: { x: (Math.random() - 0.5) * 0.5, y: -2 - Math.random() * 2 },
          life: 30 + Math.random() * 20 - delay,
          maxLife: 50,
          color: Math.random() > 0.3 ? '#88ccff' : '#ffffff',
          size: 2 + Math.random() * 2
        });
      }

      // Soul wisp trail
      for (let i = 0; i < 5; i++) {
        this.particles.push({
          pos: { x: pos.x + offsetX + (Math.random() - 0.5) * 15, y: pos.y + i * 5 },
          vel: { x: (Math.random() - 0.5) * 0.3, y: -1.5 },
          life: 25 + Math.random() * 15 - delay,
          maxLife: 40,
          color: '#aaddff',
          size: 2
        });
      }
    }

    // Body release burst
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 2;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 0.5 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#ccddff',
        size: 2 + Math.random()
      });
    }

    // Ethereal mist left behind
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 25;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: -0.3 },
        life: 35 + Math.random() * 20,
        maxLife: 55,
        color: '#8899aa',
        size: 3 + Math.random() * 2
      });
    }
  }

  private createComboFinisherEffect(pos: Vec2, comboLevel: number, color: string = '#ffaa00') {
    const intensity = Math.min(comboLevel / 10, 3);

    // Explosive burst scaled by combo
    const burstCount = 15 + Math.floor(intensity * 10);
    for (let i = 0; i < burstCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 4 * intensity;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.3 ? color : '#ffffff',
        size: 3 + Math.random() * 2 * intensity
      });
    }

    // Radial star pattern
    const starPoints = 6 + Math.floor(intensity * 2);
    for (let i = 0; i < starPoints; i++) {
      const ang = (i / starPoints) * Math.PI * 2;
      const length = 30 + intensity * 20;

      for (let j = 0; j < 5; j++) {
        const t = j / 5;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * length * t, y: pos.y + Math.sin(ang) * length * t },
          vel: { x: Math.cos(ang) * 4, y: Math.sin(ang) * 4 },
          life: 10 + j * 2,
          maxLife: 10 + j * 2,
          color: j < 2 ? '#ffffff' : color,
          size: 3 - t
        });
      }
    }

    // Ascending number particles (visual emphasis)
    for (let i = 0; i < 8; i++) {
      const x = pos.x + (Math.random() - 0.5) * 30;
      this.particles.push({
        pos: { x, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 1, y: -3 - Math.random() * 2 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#ffdd44',
        size: 2 + Math.random()
      });
    }

    // Ground shockwave
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const spd = 3 + intensity;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd * 0.3 },
        life: 12,
        maxLife: 12,
        color: color,
        size: 2.5
      });
    }

    this.triggerScreenShake(5 + intensity * 3, 10 + intensity * 5);
  }

  private createShieldReflectEffect(pos: Vec2, incomingAngle: number, shieldColor: string = '#4488ff') {
    // Reflection burst in opposite direction
    const reflectAngle = incomingAngle + Math.PI;

    for (let i = 0; i < 12; i++) {
      const spread = (Math.random() - 0.5) * Math.PI * 0.5;
      const ang = reflectAngle + spread;
      const spd = 3 + Math.random() * 3;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: Math.random() > 0.5 ? '#ffffff' : shieldColor,
        size: 2 + Math.random() * 2
      });
    }

    // Shield flash ring
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * 15, y: pos.y + Math.sin(ang) * 15 },
        vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 },
        life: 8 + Math.random() * 4,
        maxLife: 12,
        color: shieldColor,
        size: 2.5
      });
    }

    // Impact sparks at contact point
    for (let i = 0; i < 8; i++) {
      const ang = incomingAngle + (Math.random() - 0.5) * Math.PI * 0.3;
      const spd = 2 + Math.random() * 2;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 6 + Math.random() * 4,
        maxLife: 10,
        color: '#ffdd88',
        size: 1.5 + Math.random()
      });
    }

    // Central bright flash
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 8, y: pos.y + (Math.random() - 0.5) * 8 },
        vel: { x: 0, y: 0 },
        life: 5 + Math.random() * 3,
        maxLife: 8,
        color: '#ffffff',
        size: 3 + Math.random() * 2
      });
    }

    this.triggerScreenShake(3, 6);
  }

  private createPoisonNovaEffect(pos: Vec2, radius: number) {
    // Expanding poison wave
    const waveParticles = 24;
    for (let i = 0; i < waveParticles; i++) {
      const ang = (i / waveParticles) * Math.PI * 2;
      const spd = 3;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 25,
        maxLife: 25,
        color: '#44cc22',
        size: 3
      });
    }

    // Secondary toxic ring
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + Math.PI / 16;
      const spd = 2.5;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 30,
        maxLife: 30,
        color: '#88ff44',
        size: 2.5
      });
    }

    // Toxic cloud at origin
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.3;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 1, y: -0.5 - Math.random() * 0.5 },
        life: 35 + Math.random() * 20,
        maxLife: 55,
        color: '#338822',
        size: 4 + Math.random() * 3
      });
    }

    // Poison droplets scattering
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 3;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd + 1 }, // Gravity
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#66dd33',
        size: 2 + Math.random()
      });
    }

    // Bubbling effect
    for (let i = 0; i < 8; i++) {
      const x = pos.x + (Math.random() - 0.5) * 30;
      this.particles.push({
        pos: { x, y: pos.y + 10 },
        vel: { x: (Math.random() - 0.5) * 0.3, y: -1.5 - Math.random() },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#aaff66',
        size: 2
      });
    }

    this.triggerScreenShake(4, 8);
  }

  private createArcanePortalEffect(pos: Vec2, radius: number, isOpening: boolean) {
    // Swirling portal particles
    const swirlCount = 20;
    for (let i = 0; i < swirlCount; i++) {
      const ang = (i / swirlCount) * Math.PI * 2;
      const r = isOpening ? 0 : radius;
      const targetR = isOpening ? radius : 0;
      const spd = (targetR - r) / 15;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: {
          x: Math.cos(ang) * spd + Math.cos(ang + Math.PI / 2) * 2,
          y: Math.sin(ang) * spd + Math.sin(ang + Math.PI / 2) * 2
        },
        life: 20,
        maxLife: 20,
        color: i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#aa66ff' : '#6633cc',
        size: 2.5
      });
    }

    // Inner mystical glow
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.5;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 1, y: (Math.random() - 0.5) * 1 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#8844cc',
        size: 3 + Math.random() * 2
      });
    }

    // Edge rune sparkles
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: 0, y: isOpening ? -0.5 : 0.5 },
        life: 25 + Math.random() * 10,
        maxLife: 35,
        color: '#ffffff',
        size: 2
      });
    }

    // Central void/light
    const centerColor = isOpening ? '#110022' : '#ffffff';
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 10, y: pos.y + (Math.random() - 0.5) * 10 },
        vel: { x: 0, y: 0 },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: centerColor,
        size: 4 + Math.random() * 2
      });
    }

    if (isOpening) {
      this.triggerScreenShake(3, 8);
    }
  }

  private createFrostNovaEffect(pos: Vec2, radius: number) {
    // Expanding ice ring
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      const spd = 4;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 18,
        maxLife: 18,
        color: '#88ddff',
        size: 3
      });
    }

    // Ice crystal shards flying out
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 3;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: Math.random() > 0.5 ? '#ffffff' : '#aaeeff',
        size: 2 + Math.random() * 2
      });
    }

    // Frost mist
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.4;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: Math.cos(ang) * 1.5, y: Math.sin(ang) * 1.5 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#aaccff',
        size: 4 + Math.random() * 3
      });
    }

    // Snowflake sparkles
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.8;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 0.5, y: 0.3 + Math.random() * 0.3 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#ffffff',
        size: 1.5
      });
    }

    this.triggerScreenShake(5, 10);
  }

  private createFirePillarEffect(pos: Vec2, height: number = 120, radius: number = 25) {
    // Rising fire column
    for (let y = 0; y < height; y += 8) {
      const t = y / height;
      const layerRadius = radius * (1 - t * 0.5);
      const particleCount = 6 - Math.floor(t * 3);

      for (let i = 0; i < particleCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = Math.random() * layerRadius;

        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * r, y: pos.y - y },
          vel: { x: (Math.random() - 0.5) * 2, y: -3 - Math.random() * 3 },
          life: 12 + Math.random() * 8,
          maxLife: 20,
          color: t < 0.3 ? '#ffffff' : t < 0.6 ? '#ffcc00' : '#ff6600',
          size: 3 + Math.random() * 2 - t
        });
      }
    }

    // Base fire ring
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius * 0.3 },
        vel: { x: Math.cos(ang) * 1.5, y: -1 },
        life: 15 + Math.random() * 8,
        maxLife: 23,
        color: '#ff4400',
        size: 3
      });
    }

    // Ember sparks shooting up
    for (let i = 0; i < 10; i++) {
      const x = pos.x + (Math.random() - 0.5) * radius;
      this.particles.push({
        pos: { x, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 3, y: -5 - Math.random() * 4 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#ffaa00',
        size: 1.5 + Math.random()
      });
    }

    // Smoke at top
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y - height },
        vel: { x: (Math.random() - 0.5) * 1, y: -1 - Math.random() },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#444444',
        size: 4 + Math.random() * 3
      });
    }

    this.triggerScreenShake(6, 12);
  }

  private createDarkAuraEffect(pos: Vec2, radius: number) {
    // Swirling dark particles
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * (0.4 + Math.random() * 0.6);

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: {
          x: Math.cos(ang + Math.PI / 2) * 1.5,
          y: Math.sin(ang + Math.PI / 2) * 1.5 - 0.5
        },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: Math.random() > 0.5 ? '#220033' : '#440055',
        size: 3 + Math.random() * 2
      });
    }

    // Dark wisps rising
    for (let i = 0; i < 10; i++) {
      const x = pos.x + (Math.random() - 0.5) * radius;
      this.particles.push({
        pos: { x, y: pos.y + radius * 0.3 },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -1.5 - Math.random() },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#330044',
        size: 2 + Math.random() * 2
      });
    }

    // Dark core glow
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.3;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: 0 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#110011',
        size: 4 + Math.random() * 3
      });
    }

    // Purple edge sparkles
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -0.3 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#8844aa',
        size: 1.5
      });
    }
  }

  private createHolyExplosionEffect(pos: Vec2, radius: number) {
    // Brilliant radial burst
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      const spd = 4 + Math.random() * 2;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 18 + Math.random() * 8,
        maxLife: 26,
        color: '#ffffff',
        size: 3 + Math.random()
      });
    }

    // Golden secondary ring
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2 + Math.PI / 16;
      const spd = 3;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 22,
        maxLife: 22,
        color: '#ffdd44',
        size: 2.5
      });
    }

    // Ascending holy light
    for (let i = 0; i < 15; i++) {
      const x = pos.x + (Math.random() - 0.5) * radius * 0.6;
      this.particles.push({
        pos: { x, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 1, y: -3 - Math.random() * 3 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: Math.random() > 0.5 ? '#ffffff' : '#ffffaa',
        size: 2 + Math.random() * 2
      });
    }

    // Central flash
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random();
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 8 + Math.random() * 5,
        maxLife: 13,
        color: '#ffffff',
        size: 4 + Math.random() * 2
      });
    }

    // Light rays
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      for (let j = 0; j < 4; j++) {
        const dist = (j / 4) * radius * 0.8;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
          vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 },
          life: 10 + j * 2,
          maxLife: 10 + j * 2,
          color: '#ffeeaa',
          size: 2.5 - j * 0.3
        });
      }
    }

    this.triggerScreenShake(8, 15);
  }

  private createEarthSpikeEffect(pos: Vec2, height: number = 80) {
    // Rock spike emerging
    for (let y = 0; y < height; y += 10) {
      const t = y / height;
      const width = 20 * (1 - t * 0.7);

      for (let i = 0; i < 4; i++) {
        const x = pos.x + (Math.random() - 0.5) * width;
        this.particles.push({
          pos: { x, y: pos.y - y },
          vel: { x: (Math.random() - 0.5) * 0.5, y: -2 - Math.random() },
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color: t < 0.5 ? '#665544' : '#887766',
          size: 3 - t
        });
      }
    }

    // Ground debris burst
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 3;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: -2 - Math.random() * 3 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: Math.random() > 0.5 ? '#554433' : '#776655',
        size: 2 + Math.random() * 2
      });
    }

    // Dust cloud at base
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 25;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r * 0.3 },
        vel: { x: Math.cos(ang) * 1.5, y: -0.5 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#998877',
        size: 4 + Math.random() * 3
      });
    }

    // Small rock fragments
    for (let i = 0; i < 8; i++) {
      const x = pos.x + (Math.random() - 0.5) * 30;
      this.particles.push({
        pos: { x, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 2, y: -4 - Math.random() * 2 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#443322',
        size: 1.5 + Math.random()
      });
    }

    this.triggerScreenShake(7, 12);
  }

  private createAstralProjectionEffect(sourcePos: Vec2, targetPos: Vec2) {
    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Ethereal trail between positions
    const segments = Math.max(10, Math.floor(dist / 20));
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = sourcePos.x + dx * t;
      const y = sourcePos.y + dy * t;
      const fade = Math.sin(t * Math.PI);

      // Astral body particles
      for (let j = 0; j < 3; j++) {
        this.particles.push({
          pos: { x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10 },
          vel: { x: (Math.random() - 0.5) * 0.5, y: -0.5 - Math.random() * 0.5 },
          life: (20 + Math.random() * 10) * fade,
          maxLife: 30,
          color: j === 0 ? '#ffffff' : j === 1 ? '#aaccff' : '#6699cc',
          size: (3 - j) * fade
        });
      }
    }

    // Source body glow (leaving)
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 20;
      this.particles.push({
        pos: { x: sourcePos.x + Math.cos(ang) * r, y: sourcePos.y + Math.sin(ang) * r },
        vel: { x: dx / dist * 0.5, y: dy / dist * 0.5 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#88aacc',
        size: 2 + Math.random()
      });
    }

    // Target manifestation
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 25 + Math.random() * 15;
      this.particles.push({
        pos: { x: targetPos.x + Math.cos(ang) * r, y: targetPos.y + Math.sin(ang) * r },
        vel: { x: -Math.cos(ang) * 1.5, y: -Math.sin(ang) * 1.5 },
        life: 18 + Math.random() * 10,
        maxLife: 28,
        color: '#aaddff',
        size: 2 + Math.random()
      });
    }

    // Starfield sparkles along path
    for (let i = 0; i < 15; i++) {
      const t = Math.random();
      const x = sourcePos.x + dx * t;
      const y = sourcePos.y + dy * t;

      this.particles.push({
        pos: { x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 20 },
        vel: { x: 0, y: -0.2 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#ffffff',
        size: 1.5
      });
    }
  }

  private createBlackHoleCollapseEffect(pos: Vec2, radius: number) {
    // Everything being sucked inward violently
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * Math.PI * 2;
      const startR = radius * (0.8 + Math.random() * 0.5);
      const pullSpeed = 5 + Math.random() * 3;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * startR, y: pos.y + Math.sin(ang) * startR },
        vel: { x: -Math.cos(ang) * pullSpeed, y: -Math.sin(ang) * pullSpeed },
        life: 15 + Math.random() * 8,
        maxLife: 23,
        color: Math.random() > 0.7 ? '#ffffff' : Math.random() > 0.5 ? '#4400aa' : '#220066',
        size: 2 + Math.random() * 2
      });
    }

    // Spiral accretion disk
    for (let ring = 0; ring < 3; ring++) {
      const ringR = radius * (0.3 + ring * 0.2);
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + ring * 0.5;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * ringR, y: pos.y + Math.sin(ang) * ringR },
          vel: {
            x: Math.cos(ang + Math.PI / 2) * 3 - Math.cos(ang) * 1,
            y: Math.sin(ang + Math.PI / 2) * 3 - Math.sin(ang) * 1
          },
          life: 12 + ring * 3,
          maxLife: 12 + ring * 3,
          color: ring === 0 ? '#6600cc' : ring === 1 ? '#4400aa' : '#220088',
          size: 2.5 - ring * 0.3
        });
      }
    }

    // Final collapse flash
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 0.5 + Math.random();
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y + (Math.random() - 0.5) * 15 },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 8 + Math.random() * 5,
        maxLife: 13,
        color: '#ffffff',
        size: 3 + Math.random() * 2
      });
    }

    // Dark core
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 10, y: pos.y + (Math.random() - 0.5) * 10 },
        vel: { x: 0, y: 0 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#000000',
        size: 5 + Math.random() * 3
      });
    }

    this.triggerScreenShake(12, 20);
  }

  private createRageExplosionEffect(pos: Vec2, radius: number) {
    // Violent red explosion
    for (let i = 0; i < 25; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 4 + Math.random() * 5;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.3 ? '#ff2200' : '#ff6600',
        size: 3 + Math.random() * 3
      });
    }

    // Rage aura expanding
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 5, y: Math.sin(ang) * 5 },
        life: 15,
        maxLife: 15,
        color: '#cc0000',
        size: 3
      });
    }

    // Angry sparks
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 4;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 2 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#ffaa00',
        size: 1.5 + Math.random()
      });
    }

    // Central fury flash
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 10, y: pos.y + (Math.random() - 0.5) * 10 },
        vel: { x: 0, y: 0 },
        life: 6 + Math.random() * 4,
        maxLife: 10,
        color: '#ffffff',
        size: 4 + Math.random() * 2
      });
    }

    this.triggerScreenShake(10, 15);
  }

  private createShieldBreakEffect(pos: Vec2, radius: number, shieldColor: string = '#4488ff') {
    // Shield shattering into fragments
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const startR = radius * (0.8 + Math.random() * 0.3);
      const spd = 3 + Math.random() * 4;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * startR, y: pos.y + Math.sin(ang) * startR },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: shieldColor,
        size: 2 + Math.random() * 2
      });
    }

    // Bright flash at break point
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 8 + Math.random() * 5,
        maxLife: 13,
        color: '#ffffff',
        size: 3 + Math.random() * 2
      });
    }

    // Energy dissipating
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 2, y: -1 - Math.random() },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: shieldColor,
        size: 2 + Math.random()
      });
    }

    // Crackling electricity
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * 0.5 + Math.random() * radius * 0.5;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4 },
        life: 5 + Math.random() * 4,
        maxLife: 9,
        color: '#aaddff',
        size: 1.5
      });
    }

    this.triggerScreenShake(6, 10);
  }

  private createTelekinesisLiftEffect(pos: Vec2, radius: number) {
    // Objects being lifted (particles rising)
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      const startY = pos.y + 20;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: startY },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -2 - Math.random() * 2 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: Math.random() > 0.5 ? '#aa88ff' : '#8866cc',
        size: 2 + Math.random() * 2
      });
    }

    // Psychic energy glow at center
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.3;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: -0.5 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#bb99ff',
        size: 3 + Math.random() * 2
      });
    }

    // Spiral energy lines
    for (let spiral = 0; spiral < 3; spiral++) {
      for (let i = 0; i < 8; i++) {
        const t = i / 8;
        const ang = t * Math.PI * 2 + spiral * Math.PI * 2 / 3;
        const r = radius * t;
        const y = pos.y - t * 30;

        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * r, y },
          vel: { x: Math.cos(ang + Math.PI / 2) * 1, y: -1.5 },
          life: 15 + i * 2,
          maxLife: 15 + i * 2,
          color: '#9966dd',
          size: 2 - t * 0.5
        });
      }
    }

    // Ground disturbance
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius * 0.8, y: pos.y + 15 },
        vel: { x: 0, y: -1 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#665544',
        size: 2
      });
    }
  }

  private createPlasmaOrbEffect(pos: Vec2, radius: number, color: string = '#44ffaa') {
    // Unstable plasma core
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.3;
      const spd = 0.5 + Math.random();

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: Math.random() > 0.5 ? '#ffffff' : color,
        size: 3 + Math.random() * 2
      });
    }

    // Electric arcs around orb
    for (let arc = 0; arc < 4; arc++) {
      const startAng = Math.random() * Math.PI * 2;
      const endAng = startAng + Math.PI * (0.3 + Math.random() * 0.4);

      for (let i = 0; i < 5; i++) {
        const t = i / 5;
        const ang = startAng + (endAng - startAng) * t;
        const r = radius * (0.6 + Math.random() * 0.3);

        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
          vel: { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 },
          life: 5 + Math.random() * 4,
          maxLife: 9,
          color: color,
          size: 2
        });
      }
    }

    // Outer glow ring
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang) * 0.5, y: Math.sin(ang) * 0.5 },
        life: 15 + Math.random() * 8,
        maxLife: 23,
        color: color,
        size: 2
      });
    }

    // Plasma wisps escaping
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 2;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius * 0.5, y: pos.y + Math.sin(ang) * radius * 0.5 },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 18 + Math.random() * 10,
        maxLife: 28,
        color: color,
        size: 1.5 + Math.random()
      });
    }
  }

  private createTimeFreezeEffect(pos: Vec2, radius: number) {
    // Frozen time particles (stationary or very slow)
    for (let i = 0; i < 25; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 0.1, y: (Math.random() - 0.5) * 0.1 },
        life: 40 + Math.random() * 20,
        maxLife: 60,
        color: Math.random() > 0.5 ? '#aaddff' : '#88bbdd',
        size: 2 + Math.random() * 2
      });
    }

    // Clock-like circular pattern
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const r = radius * 0.8;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: 0 },
        life: 35 + Math.random() * 10,
        maxLife: 45,
        color: '#ffffff',
        size: 2.5
      });

      // Clock hands effect
      if (i === 0 || i === 3) {
        for (let j = 0; j < 4; j++) {
          const handR = r * (j / 4);
          this.particles.push({
            pos: { x: pos.x + Math.cos(ang) * handR, y: pos.y + Math.sin(ang) * handR },
            vel: { x: 0, y: 0 },
            life: 30 + Math.random() * 10,
            maxLife: 40,
            color: '#ccddff',
            size: 2
          });
        }
      }
    }

    // Frozen crystalline fragments
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.6;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: 0 },
        life: 45 + Math.random() * 15,
        maxLife: 60,
        color: '#eeffff',
        size: 1.5
      });
    }

    // Edge distortion effect
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang) * 0.3, y: Math.sin(ang) * 0.3 },
        life: 25 + Math.random() * 10,
        maxLife: 35,
        color: '#6699bb',
        size: 2
      });
    }
  }

  private createShadowCloneEffect(pos: Vec2, cloneDirection: Vec2) {
    const dist = Math.sqrt(cloneDirection.x * cloneDirection.x + cloneDirection.y * cloneDirection.y) || 1;
    const normDir = { x: cloneDirection.x / dist, y: cloneDirection.y / dist };

    // Shadow trail to clone position
    for (let i = 0; i < 10; i++) {
      const t = i / 10;
      const x = pos.x + normDir.x * 40 * t;
      const y = pos.y + normDir.y * 40 * t;

      this.particles.push({
        pos: { x, y },
        vel: { x: normDir.x * 2, y: normDir.y * 2 },
        life: 12 + Math.random() * 6,
        maxLife: 18,
        color: '#220033',
        size: 3 - t
      });
    }

    // Clone manifestation burst
    const clonePos = { x: pos.x + normDir.x * 50, y: pos.y + normDir.y * 50 };
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 2;

      this.particles.push({
        pos: { ...clonePos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.5 ? '#442255' : '#331144',
        size: 2 + Math.random() * 2
      });
    }

    // Shadow wisps rising from both positions
    for (const p of [pos, clonePos]) {
      for (let i = 0; i < 6; i++) {
        const x = p.x + (Math.random() - 0.5) * 20;
        this.particles.push({
          pos: { x, y: p.y },
          vel: { x: (Math.random() - 0.5) * 0.5, y: -1.5 - Math.random() },
          life: 20 + Math.random() * 15,
          maxLife: 35,
          color: '#553366',
          size: 2 + Math.random()
        });
      }
    }

    // Connection line particles
    for (let i = 0; i < 8; i++) {
      const t = Math.random();
      this.particles.push({
        pos: { x: pos.x + normDir.x * 50 * t, y: pos.y + normDir.y * 50 * t },
        vel: { x: 0, y: -0.3 },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: '#8855aa',
        size: 1.5
      });
    }
  }

  private createDivineJudgmentEffect(pos: Vec2, radius: number) {
    // Massive light beam from sky
    const beamHeight = 300;
    for (let y = 0; y < beamHeight; y += 12) {
      const t = y / beamHeight;
      const width = radius * (0.3 + t * 0.7);
      const particleCount = 5 + Math.floor(t * 3);

      for (let i = 0; i < particleCount; i++) {
        const x = pos.x + (Math.random() - 0.5) * width;
        this.particles.push({
          pos: { x, y: pos.y - y },
          vel: { x: (Math.random() - 0.5) * 0.5, y: 3 + Math.random() * 2 },
          life: 15 + Math.random() * 8,
          maxLife: 23,
          color: t < 0.3 ? '#ffffff' : t < 0.6 ? '#ffffaa' : '#ffdd66',
          size: 3 - t
        });
      }
    }

    // Radiant ground impact
    for (let i = 0; i < 30; i++) {
      const ang = (i / 30) * Math.PI * 2;
      const spd = 5 + Math.random() * 3;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 18 + Math.random() * 10,
        maxLife: 28,
        color: '#ffdd44',
        size: 3 + Math.random()
      });
    }

    // Holy symbols rising
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const r = radius * 0.5;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: -2 - Math.random() },
        life: 30 + Math.random() * 15,
        maxLife: 45,
        color: '#ffffff',
        size: 2.5
      });
    }

    // Central blinding flash
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 2;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 8 + Math.random() * 5,
        maxLife: 13,
        color: '#ffffff',
        size: 5 + Math.random() * 3
      });
    }

    // Divine rings
    for (let ring = 0; ring < 3; ring++) {
      const ringR = radius * (0.3 + ring * 0.3);
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2 + ring * 0.2;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * ringR, y: pos.y + Math.sin(ang) * ringR },
          vel: { x: Math.cos(ang) * 1.5, y: Math.sin(ang) * 1.5 },
          life: 12 + ring * 3,
          maxLife: 12 + ring * 3,
          color: ring === 0 ? '#ffffff' : '#ffee88',
          size: 2.5 - ring * 0.3
        });
      }
    }

    this.triggerScreenShake(15, 25);
  }

  private createSupernovaExplosionEffect(pos: Vec2, radius: number) {
    // Massive radial explosion
    for (let wave = 0; wave < 3; wave++) {
      const waveDelay = wave * 3;
      const particleCount = 30 - wave * 5;

      for (let i = 0; i < particleCount; i++) {
        const ang = (i / particleCount) * Math.PI * 2;
        const spd = 6 + wave * 2 + Math.random() * 2;

        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 25 - waveDelay + Math.random() * 10,
          maxLife: 35,
          color: wave === 0 ? '#ffffff' : wave === 1 ? '#ffdd88' : '#ff8844',
          size: 4 - wave
        });
      }
    }

    // Central blinding core
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 3;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: '#ffffff',
        size: 5 + Math.random() * 4
      });
    }

    // Star debris flying outward
    for (let i = 0; i < 25; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 5;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: Math.random() > 0.5 ? '#ffcc44' : '#ff6622',
        size: 2 + Math.random() * 2
      });
    }

    // Cosmic dust cloud
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.5;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 },
        life: 40 + Math.random() * 25,
        maxLife: 65,
        color: '#aa6633',
        size: 5 + Math.random() * 4
      });
    }

    this.triggerScreenShake(20, 30);
  }

  private createBloodMoonAuraEffect(pos: Vec2, radius: number) {
    // Crimson swirling particles
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * (0.4 + Math.random() * 0.6);

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: {
          x: Math.cos(ang + Math.PI / 2) * 2,
          y: Math.sin(ang + Math.PI / 2) * 2 - 0.3
        },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: Math.random() > 0.5 ? '#cc2222' : '#880000',
        size: 2 + Math.random() * 2
      });
    }

    // Moon-like crescent particles
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const r = radius * 0.7;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: Math.cos(ang + Math.PI / 2) * 1.5, y: Math.sin(ang + Math.PI / 2) * 1.5 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#dd4444',
        size: 2.5
      });
    }

    // Blood drips rising
    for (let i = 0; i < 10; i++) {
      const x = pos.x + (Math.random() - 0.5) * radius;

      this.particles.push({
        pos: { x, y: pos.y + radius * 0.3 },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -1.5 - Math.random() },
        life: 30 + Math.random() * 15,
        maxLife: 45,
        color: '#aa0000',
        size: 2 + Math.random()
      });
    }

    // Dark inner glow
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.3;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: 0 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#330000',
        size: 4 + Math.random() * 2
      });
    }
  }

  private createSpiritBombEffect(pos: Vec2, radius: number, chargeLevel: number = 1) {
    const intensity = Math.min(chargeLevel, 3);

    // Energy being gathered from all directions
    for (let i = 0; i < 20 * intensity; i++) {
      const ang = Math.random() * Math.PI * 2;
      const startR = radius * (1.5 + Math.random());
      const pullSpeed = 4 + Math.random() * 2;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * startR, y: pos.y + Math.sin(ang) * startR },
        vel: { x: -Math.cos(ang) * pullSpeed, y: -Math.sin(ang) * pullSpeed },
        life: 15 + Math.random() * 8,
        maxLife: 23,
        color: Math.random() > 0.6 ? '#ffffff' : Math.random() > 0.5 ? '#88ddff' : '#44aadd',
        size: 2 + Math.random() * intensity
      });
    }

    // Central glowing orb
    for (let i = 0; i < 12 * intensity; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.4;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 0.5, y: (Math.random() - 0.5) * 0.5 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#ffffff',
        size: 3 + Math.random() * 2 * intensity
      });
    }

    // Orbiting energy particles
    for (let ring = 0; ring < 2; ring++) {
      const ringR = radius * (0.5 + ring * 0.3);
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + ring * 0.3;

        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * ringR, y: pos.y + Math.sin(ang) * ringR },
          vel: { x: Math.cos(ang + Math.PI / 2) * 3, y: Math.sin(ang + Math.PI / 2) * 3 },
          life: 12 + Math.random() * 6,
          maxLife: 18,
          color: '#66ccff',
          size: 2.5
        });
      }
    }

    // Ascending spirit wisps
    for (let i = 0; i < 8; i++) {
      const x = pos.x + (Math.random() - 0.5) * radius;

      this.particles.push({
        pos: { x, y: pos.y + radius * 0.3 },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -2 - Math.random() * 2 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#aaddff',
        size: 2 + Math.random()
      });
    }

    if (intensity >= 2) {
      this.triggerScreenShake(3 * intensity, 8);
    }
  }

  private createQuantumShiftEffect(startPos: Vec2, endPos: Vec2) {
    // Glitchy disappearance at start
    for (let i = 0; i < 15; i++) {
      const offsetX = (Math.random() - 0.5) * 30;
      const offsetY = (Math.random() - 0.5) * 30;

      this.particles.push({
        pos: { x: startPos.x + offsetX, y: startPos.y + offsetY },
        vel: { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4 },
        life: 8 + Math.random() * 6,
        maxLife: 14,
        color: Math.random() > 0.5 ? '#00ffff' : '#ff00ff',
        size: 2 + Math.random() * 2
      });
    }

    // Digital scan lines at start
    for (let i = 0; i < 8; i++) {
      const y = startPos.y - 15 + i * 4;
      this.particles.push({
        pos: { x: startPos.x - 15, y },
        vel: { x: 6, y: 0 },
        life: 6,
        maxLife: 6,
        color: '#00ffaa',
        size: 2
      });
    }

    // Quantum trail between positions
    const dx = endPos.x - startPos.x;
    const dy = endPos.y - startPos.y;
    for (let i = 0; i < 12; i++) {
      const t = Math.random();

      this.particles.push({
        pos: { x: startPos.x + dx * t + (Math.random() - 0.5) * 20, y: startPos.y + dy * t + (Math.random() - 0.5) * 20 },
        vel: { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: Math.random() > 0.5 ? '#44ffff' : '#ff44ff',
        size: 1.5 + Math.random()
      });
    }

    // Glitchy appearance at end
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 15;

      this.particles.push({
        pos: { x: endPos.x + Math.cos(ang) * r, y: endPos.y + Math.sin(ang) * r },
        vel: { x: -Math.cos(ang) * 3, y: -Math.sin(ang) * 3 },
        life: 10 + Math.random() * 6,
        maxLife: 16,
        color: Math.random() > 0.5 ? '#00ffff' : '#ff00ff',
        size: 2 + Math.random() * 2
      });
    }

    // Digital scan lines at end
    for (let i = 0; i < 8; i++) {
      const y = endPos.y - 15 + i * 4;
      this.particles.push({
        pos: { x: endPos.x + 15, y },
        vel: { x: -6, y: 0 },
        life: 6,
        maxLife: 6,
        color: '#ff00aa',
        size: 2
      });
    }

    // Central manifestation flash
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        pos: { x: endPos.x + (Math.random() - 0.5) * 10, y: endPos.y + (Math.random() - 0.5) * 10 },
        vel: { x: 0, y: 0 },
        life: 5 + Math.random() * 3,
        maxLife: 8,
        color: '#ffffff',
        size: 3 + Math.random() * 2
      });
    }

    this.triggerScreenShake(4, 6);
  }

  private createApocalypseRainEffect(centerPos: Vec2, radius: number, dropCount: number = 20) {
    // Fire and brimstone raining from sky
    for (let i = 0; i < dropCount; i++) {
      const x = centerPos.x + (Math.random() - 0.5) * radius * 2;
      const startY = centerPos.y - 150 - Math.random() * 100;
      const speed = 8 + Math.random() * 4;

      // Flaming projectile
      for (let j = 0; j < 4; j++) {
        this.particles.push({
          pos: { x: x + (Math.random() - 0.5) * 5, y: startY + j * 8 },
          vel: { x: (Math.random() - 0.5) * 2, y: speed },
          life: 20 + Math.random() * 10,
          maxLife: 30,
          color: j === 0 ? '#ffffff' : j === 1 ? '#ffaa00' : '#ff4400',
          size: 4 - j
        });
      }
    }

    // Smoke trails
    for (let i = 0; i < dropCount / 2; i++) {
      const x = centerPos.x + (Math.random() - 0.5) * radius * 2;
      const y = centerPos.y - 50 - Math.random() * 100;

      this.particles.push({
        pos: { x, y },
        vel: { x: (Math.random() - 0.5) * 1, y: 2 + Math.random() },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#444444',
        size: 4 + Math.random() * 3
      });
    }

    // Ground impact explosions
    for (let i = 0; i < 8; i++) {
      const impactX = centerPos.x + (Math.random() - 0.5) * radius * 1.5;
      for (let j = 0; j < 6; j++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 3;

        this.particles.push({
          pos: { x: impactX, y: centerPos.y },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 1 },
          life: 12 + Math.random() * 8,
          maxLife: 20,
          color: Math.random() > 0.5 ? '#ff6600' : '#ffaa00',
          size: 2 + Math.random() * 2
        });
      }
    }

    this.triggerScreenShake(8, 20);
  }

  private createDragonBreathEffect(pos: Vec2, angle: number, length: number = 120, width: number = 60) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Main fire stream
    for (let i = 0; i < 25; i++) {
      const dist = Math.random() * length;
      const spread = (Math.random() - 0.5) * width * (dist / length);
      const perpCos = Math.cos(angle + Math.PI / 2);
      const perpSin = Math.sin(angle + Math.PI / 2);

      const x = pos.x + cos * dist + perpCos * spread;
      const y = pos.y + sin * dist + perpSin * spread;
      const t = dist / length;

      this.particles.push({
        pos: { x, y },
        vel: { x: cos * 4 + (Math.random() - 0.5) * 2, y: sin * 4 + (Math.random() - 0.5) * 2 - 0.5 },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: t < 0.3 ? '#ffffff' : t < 0.6 ? '#ffcc00' : '#ff4400',
        size: 4 - t * 2
      });
    }

    // Core intense flames
    for (let i = 0; i < 10; i++) {
      const dist = Math.random() * length * 0.5;
      const x = pos.x + cos * dist;
      const y = pos.y + sin * dist;

      this.particles.push({
        pos: { x, y },
        vel: { x: cos * 5, y: sin * 5 },
        life: 8 + Math.random() * 5,
        maxLife: 13,
        color: '#ffffff',
        size: 3 + Math.random() * 2
      });
    }

    // Ember sparks
    for (let i = 0; i < 15; i++) {
      const dist = Math.random() * length * 0.8;
      const spread = (Math.random() - 0.5) * width * 0.8;
      const perpCos = Math.cos(angle + Math.PI / 2);
      const perpSin = Math.sin(angle + Math.PI / 2);

      this.particles.push({
        pos: { x: pos.x + cos * dist + perpCos * spread, y: pos.y + sin * dist + perpSin * spread },
        vel: { x: cos * 2 + (Math.random() - 0.5) * 3, y: sin * 2 - 1 - Math.random() * 2 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#ff8800',
        size: 1.5 + Math.random()
      });
    }

    // Smoke at edges
    for (let i = 0; i < 8; i++) {
      const dist = length * (0.5 + Math.random() * 0.5);
      const spread = (Math.random() > 0.5 ? 1 : -1) * width * 0.4;
      const perpCos = Math.cos(angle + Math.PI / 2);
      const perpSin = Math.sin(angle + Math.PI / 2);

      this.particles.push({
        pos: { x: pos.x + cos * dist + perpCos * spread, y: pos.y + sin * dist + perpSin * spread },
        vel: { x: (Math.random() - 0.5) * 1, y: -1 - Math.random() },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#333333',
        size: 4 + Math.random() * 3
      });
    }

    this.triggerScreenShake(5, 10);
  }

  private createCosmicRiftEffect(pos: Vec2, width: number, height: number) {
    // Swirling cosmic energy
    for (let i = 0; i < 30; i++) {
      const t = Math.random();
      const x = pos.x + (Math.random() - 0.5) * width * 0.5;
      const y = pos.y + (Math.random() - 0.5) * height;

      const colors = ['#ff00ff', '#00ffff', '#ffff00', '#ff00aa', '#00aaff'];
      this.particles.push({
        pos: { x, y },
        vel: { x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 2
      });
    }

    // Rift edge distortion
    for (let i = 0; i < 20; i++) {
      const t = i / 20;
      const y = pos.y - height / 2 + t * height;
      const side = i % 2 === 0 ? -1 : 1;
      const x = pos.x + side * width * 0.25;

      this.particles.push({
        pos: { x, y },
        vel: { x: side * 0.5, y: (Math.random() - 0.5) * 1 },
        life: 18 + Math.random() * 8,
        maxLife: 26,
        color: '#aa44ff',
        size: 2.5
      });
    }

    // Stars being pulled in
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 50 + Math.random() * 40;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: -Math.cos(ang) * 2, y: -Math.sin(ang) * 2 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#ffffff',
        size: 1.5 + Math.random()
      });
    }

    // Dark void center
    for (let i = 0; i < 8; i++) {
      const x = pos.x + (Math.random() - 0.5) * width * 0.3;
      const y = pos.y + (Math.random() - 0.5) * height * 0.5;

      this.particles.push({
        pos: { x, y },
        vel: { x: 0, y: 0 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#110022',
        size: 5 + Math.random() * 3
      });
    }

    this.triggerScreenShake(6, 12);
  }

  private createWrathOfNatureEffect(pos: Vec2, radius: number) {
    // Vines erupting from ground
    for (let vine = 0; vine < 8; vine++) {
      const baseAng = (vine / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const vineLength = radius * (0.5 + Math.random() * 0.5);

      for (let i = 0; i < 6; i++) {
        const t = i / 6;
        const dist = vineLength * t;
        const wobble = Math.sin(t * Math.PI * 2) * 10;
        const perpAng = baseAng + Math.PI / 2;

        this.particles.push({
          pos: {
            x: pos.x + Math.cos(baseAng) * dist + Math.cos(perpAng) * wobble,
            y: pos.y + Math.sin(baseAng) * dist - t * 30
          },
          vel: { x: Math.cos(baseAng) * 1, y: -2 - Math.random() },
          life: 20 + i * 3,
          maxLife: 20 + i * 3,
          color: i < 2 ? '#44aa22' : i < 4 ? '#338818' : '#225510',
          size: 3 - t
        });
      }
    }

    // Leaves swirling
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: {
          x: Math.cos(ang + Math.PI / 2) * 2 + (Math.random() - 0.5) * 2,
          y: -1 - Math.random() * 2
        },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: Math.random() > 0.5 ? '#66cc44' : '#88dd66',
        size: 2 + Math.random()
      });
    }

    // Earth debris from ground
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.7;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r * 0.3 },
        vel: { x: (Math.random() - 0.5) * 3, y: -3 - Math.random() * 3 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#664422',
        size: 2 + Math.random() * 2
      });
    }

    // Pollen/spores floating
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.8;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r - 20 },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -0.5 - Math.random() * 0.5 },
        life: 35 + Math.random() * 20,
        maxLife: 55,
        color: '#aadd88',
        size: 1.5
      });
    }

    this.triggerScreenShake(7, 15);
  }

  // ============================================
  // NEW VFX EFFECTS - Attack Telegraphs & Indicators
  // ============================================

  private createEnemyAimLineEffect(startPos: Vec2, targetPos: Vec2, chargePercent: number = 1) {
    const dx = targetPos.x - startPos.x;
    const dy = targetPos.y - startPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const segments = Math.max(6, Math.floor(dist / 30));

    // Pulsing aim line particles
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = startPos.x + dx * t;
      const y = startPos.y + dy * t;
      const pulse = Math.sin(t * Math.PI * 4 + Date.now() * 0.01) * 0.5 + 0.5;

      this.particles.push({
        pos: { x, y },
        vel: { x: (Math.random() - 0.5) * 0.5, y: (Math.random() - 0.5) * 0.5 },
        life: 3 + Math.random() * 2,
        maxLife: 5,
        color: chargePercent > 0.8 ? '#ff4444' : chargePercent > 0.5 ? '#ffaa44' : '#ffff44',
        size: (1.5 + pulse) * chargePercent
      });
    }

    // Warning dots at intervals
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      this.particles.push({
        pos: { x: startPos.x + dx * t, y: startPos.y + dy * t },
        vel: { x: 0, y: 0 },
        life: 4,
        maxLife: 4,
        color: '#ffffff',
        size: 2.5 * chargePercent
      });
    }

    // Target reticle at end
    if (chargePercent > 0.7) {
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2;
        this.particles.push({
          pos: { x: targetPos.x + Math.cos(ang) * 15, y: targetPos.y + Math.sin(ang) * 15 },
          vel: { x: -Math.cos(ang) * 2, y: -Math.sin(ang) * 2 },
          life: 5,
          maxLife: 5,
          color: '#ff2222',
          size: 2
        });
      }
    }
  }

  private createChargeIndicatorEffect(pos: Vec2, chargePercent: number, color: string = '#ffaa00') {
    // Rotating charge ring
    const ringParticles = 12;
    const rotation = Date.now() * 0.003;
    for (let i = 0; i < ringParticles; i++) {
      const ang = (i / ringParticles) * Math.PI * 2 + rotation;
      const radius = 20 + chargePercent * 15;
      const activeParticle = i < Math.floor(ringParticles * chargePercent);

      if (activeParticle) {
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
          vel: { x: Math.cos(ang + Math.PI / 2) * 0.5, y: Math.sin(ang + Math.PI / 2) * 0.5 },
          life: 4,
          maxLife: 4,
          color: i < ringParticles * chargePercent * 0.5 ? '#ffffff' : color,
          size: 2 + chargePercent
        });
      }
    }

    // Inner energy gathering
    if (chargePercent > 0.3) {
      for (let i = 0; i < 4; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * 20;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
          vel: { x: -Math.cos(ang) * 3, y: -Math.sin(ang) * 3 },
          life: 8,
          maxLife: 8,
          color: color,
          size: 1.5 + chargePercent
        });
      }
    }

    // Full charge flash
    if (chargePercent >= 1) {
      for (let i = 0; i < 8; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 2;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 10,
          maxLife: 10,
          color: '#ffffff',
          size: 3
        });
      }
    }
  }

  private createDangerZonePulseEffect(pos: Vec2, radius: number, pulsePhase: number = 0) {
    const pulse = Math.sin(pulsePhase * Math.PI * 2) * 0.3 + 0.7;
    const currentRadius = radius * pulse;

    // Outer warning ring
    const ringParticles = 20;
    for (let i = 0; i < ringParticles; i++) {
      const ang = (i / ringParticles) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * currentRadius, y: pos.y + Math.sin(ang) * currentRadius },
        vel: { x: Math.cos(ang) * 0.5 * (1 - pulse), y: Math.sin(ang) * 0.5 * (1 - pulse) },
        life: 4,
        maxLife: 4,
        color: pulsePhase > 0.7 ? '#ff2222' : '#ff8844',
        size: 2 + pulse
      });
    }

    // Inner danger fill
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * currentRadius * 0.8;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -0.5 },
        life: 6,
        maxLife: 6,
        color: '#ff6644',
        size: 2 * pulse
      });
    }
  }

  private createWeakpointGlowEffect(pos: Vec2, isVulnerable: boolean = true) {
    const baseColor = isVulnerable ? '#ffff44' : '#888888';
    const glowColor = isVulnerable ? '#ff8800' : '#444444';

    // Pulsing target glow
    const pulse = Math.sin(Date.now() * 0.008) * 0.5 + 0.5;
    const size = 15 + pulse * 8;

    // Outer glow ring
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Date.now() * 0.002;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * size, y: pos.y + Math.sin(ang) * size },
        vel: { x: 0, y: 0 },
        life: 3,
        maxLife: 3,
        color: baseColor,
        size: 2 + pulse
      });
    }

    // Center sparkle
    if (isVulnerable && Math.random() > 0.5) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 10, y: pos.y + (Math.random() - 0.5) * 10 },
        vel: { x: 0, y: -1 },
        life: 8,
        maxLife: 8,
        color: '#ffffff',
        size: 2 + Math.random()
      });
    }

    // Directional arrows pointing inward
    if (isVulnerable) {
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2;
        const dist = 30 + pulse * 10;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
          vel: { x: -Math.cos(ang) * 2, y: -Math.sin(ang) * 2 },
          life: 6,
          maxLife: 6,
          color: glowColor,
          size: 2
        });
      }
    }
  }

  // ============================================
  // NEW VFX EFFECTS - Chain Reactions & Spread
  // ============================================

  private createFireSpreadEffect(sourcePos: Vec2, targetPos: Vec2) {
    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const segments = Math.max(5, Math.floor(dist / 15));

    // Fire trail spreading between positions
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = sourcePos.x + dx * t;
      const y = sourcePos.y + dy * t;
      const deviation = Math.sin(t * Math.PI * 3) * 10;
      const perpX = -dy / dist * deviation;
      const perpY = dx / dist * deviation;

      // Core flame
      this.particles.push({
        pos: { x: x + perpX, y: y + perpY },
        vel: { x: (Math.random() - 0.5) * 2, y: -2 - Math.random() * 2 },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: t < 0.3 ? '#ff4400' : t < 0.7 ? '#ff8800' : '#ffcc00',
        size: 3 + Math.random() * 2
      });

      // Ember sparks
      if (Math.random() > 0.6) {
        this.particles.push({
          pos: { x: x + perpX, y: y + perpY },
          vel: { x: (Math.random() - 0.5) * 4, y: -3 - Math.random() * 3 },
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color: '#ffaa44',
          size: 1.5
        });
      }
    }

    // Impact ignition at target
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 3;
      this.particles.push({
        pos: { ...targetPos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 1 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.3 ? '#ff6600' : '#ffdd00',
        size: 2 + Math.random() * 2
      });
    }
  }

  private createIceCrystalChainEffect(positions: Vec2[]) {
    // Create ice crystallization chain between positions
    for (let i = 0; i < positions.length - 1; i++) {
      const start = positions[i];
      const end = positions[i + 1];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const segments = Math.max(4, Math.floor(dist / 25));

      // Ice crystal path
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        const x = start.x + dx * t;
        const y = start.y + dy * t;

        // Main crystal particles
        this.particles.push({
          pos: { x, y },
          vel: { x: (Math.random() - 0.5) * 1.5, y: (Math.random() - 0.5) * 1.5 },
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color: j % 2 === 0 ? '#ffffff' : '#aaeeff',
          size: 2.5 + Math.random()
        });

        // Frost spread
        if (Math.random() > 0.5) {
          const spreadAng = Math.random() * Math.PI * 2;
          this.particles.push({
            pos: { x: x + Math.cos(spreadAng) * 8, y: y + Math.sin(spreadAng) * 8 },
            vel: { x: Math.cos(spreadAng) * 1, y: Math.sin(spreadAng) * 1 },
            life: 20 + Math.random() * 10,
            maxLife: 30,
            color: '#88ccff',
            size: 2
          });
        }
      }

      // Crystal formation at each node
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2;
        this.particles.push({
          pos: { ...end },
          vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 },
          life: 12 + Math.random() * 8,
          maxLife: 20,
          color: '#66ddff',
          size: 2 + Math.random()
        });
      }
    }

    // Shatter sparkles
    for (const pos of positions) {
      for (let i = 0; i < 5; i++) {
        this.particles.push({
          pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y + (Math.random() - 0.5) * 15 },
          vel: { x: 0, y: -0.5 },
          life: 25 + Math.random() * 15,
          maxLife: 40,
          color: '#ffffff',
          size: 1.5
        });
      }
    }
  }

  private createPoisonSpreadEffect(sourcePos: Vec2, targetPos: Vec2, intensity: number = 1) {
    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Toxic cloud trail
    const segments = Math.max(6, Math.floor(dist / 20));
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = sourcePos.x + dx * t;
      const y = sourcePos.y + dy * t;
      const wobble = Math.sin(t * Math.PI * 4) * 8;
      const perpX = -dy / dist * wobble;
      const perpY = dx / dist * wobble;

      // Poison cloud particles
      this.particles.push({
        pos: { x: x + perpX, y: y + perpY },
        vel: { x: (Math.random() - 0.5) * 1.5, y: -0.5 - Math.random() * 0.5 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: `rgb(${50 + Math.random() * 50}, ${150 + Math.random() * 55}, ${30 + Math.random() * 30})`,
        size: (3 + Math.random() * 3) * intensity
      });

      // Toxic bubbles
      if (Math.random() > 0.7) {
        this.particles.push({
          pos: { x: x + (Math.random() - 0.5) * 15, y: y + (Math.random() - 0.5) * 15 },
          vel: { x: 0, y: -1.5 - Math.random() },
          life: 12 + Math.random() * 8,
          maxLife: 20,
          color: '#88ff44',
          size: 2 + Math.random()
        });
      }
    }

    // Infection burst at target
    for (let i = 0; i < 10 * intensity; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1.5 + Math.random() * 2;
      this.particles.push({
        pos: { ...targetPos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 0.5 },
        life: 18 + Math.random() * 12,
        maxLife: 30,
        color: '#66dd44',
        size: 2.5 + Math.random() * 1.5
      });
    }
  }

  // ============================================
  // NEW VFX EFFECTS - Boss & Phase Transitions
  // ============================================

  private createBossPhaseTransitionEffect(pos: Vec2, newPhase: number, bossColor: string = '#ff4444') {
    // Massive energy release
    for (let ring = 0; ring < 4; ring++) {
      const ringRadius = 30 + ring * 40;
      const particleCount = 16 + ring * 8;

      for (let i = 0; i < particleCount; i++) {
        const ang = (i / particleCount) * Math.PI * 2;
        const delay = ring * 0.2;
        const spd = 4 + ring * 1.5;

        this.particles.push({
          pos: { x: pos.x, y: pos.y },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 20 + ring * 5,
          maxLife: 20 + ring * 5,
          color: ring === 0 ? '#ffffff' : ring === 1 ? bossColor : ring === 2 ? '#ffaa00' : '#ff6600',
          size: 4 - ring * 0.5
        });
      }
    }

    // Phase number indicator (spiral up)
    for (let i = 0; i < 15; i++) {
      const ang = (i / 15) * Math.PI * 4;
      const height = i * 8;
      const radius = 20 - i;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y - height },
        vel: { x: Math.cos(ang) * 0.5, y: -2 - Math.random() },
        life: 25 + Math.random() * 10,
        maxLife: 35,
        color: newPhase >= 3 ? '#ff2222' : newPhase >= 2 ? '#ff8844' : '#ffdd44',
        size: 3 + Math.random()
      });
    }

    // Ground impact cracks
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.2;
      const length = 60 + Math.random() * 40;

      for (let j = 0; j < 6; j++) {
        const dist = (j / 6) * length;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
          vel: { x: Math.cos(ang) * 1.5, y: Math.sin(ang) * 1.5 },
          life: 30 + j * 3,
          maxLife: 30 + j * 3,
          color: '#ff4400',
          size: 3 - j * 0.3
        });
      }
    }

    // Rage aura rising
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 50;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 3, y: -3 - Math.random() * 4 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: bossColor,
        size: 3 + Math.random() * 2
      });
    }

    this.triggerScreenShake(15, 30);
  }

  private createBossEnragedAuraEffect(pos: Vec2, intensity: number = 1) {
    // Pulsing rage aura
    const pulse = Math.sin(Date.now() * 0.01) * 0.3 + 0.7;
    const radius = 40 * intensity * pulse;

    // Flame-like aura particles
    for (let i = 0; i < 12 * intensity; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * (0.5 + Math.random() * 0.5);

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 2, y: -2.5 - Math.random() * 2 },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: Math.random() > 0.5 ? '#ff2200' : '#ff6600',
        size: 2.5 + Math.random() * 2
      });
    }

    // Dark smoke underneath
    for (let i = 0; i < 4; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * 0.6 * Math.random();

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5), y: -1 - Math.random() },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#441111',
        size: 4 + Math.random() * 3
      });
    }

    // Occasional spark burst
    if (Math.random() > 0.7) {
      const burstAng = Math.random() * Math.PI * 2;
      for (let i = 0; i < 5; i++) {
        const spreadAng = burstAng + (Math.random() - 0.5) * 0.8;
        this.particles.push({
          pos: { x: pos.x + Math.cos(burstAng) * radius, y: pos.y + Math.sin(burstAng) * radius },
          vel: { x: Math.cos(spreadAng) * 4, y: Math.sin(spreadAng) * 4 },
          life: 8 + Math.random() * 5,
          maxLife: 13,
          color: '#ffaa00',
          size: 1.5 + Math.random()
        });
      }
    }
  }

  private createBossDefeatExplosionEffect(pos: Vec2, bossSize: number = 1) {
    // Multi-stage explosion
    for (let stage = 0; stage < 5; stage++) {
      const stageRadius = 30 + stage * 25;
      const particleCount = 20 + stage * 10;

      for (let i = 0; i < particleCount; i++) {
        const ang = (i / particleCount) * Math.PI * 2 + Math.random() * 0.2;
        const spd = 3 + stage * 1.5 + Math.random() * 2;

        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 25 + stage * 8,
          maxLife: 25 + stage * 8,
          color: stage < 2 ? '#ffffff' : stage < 3 ? '#ffff44' : stage < 4 ? '#ff8800' : '#ff4400',
          size: (5 - stage * 0.5) * bossSize
        });
      }
    }

    // Soul fragments escaping
    for (let i = 0; i < 15 * bossSize; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 2;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 40, y: pos.y + (Math.random() - 0.5) * 40 },
        vel: { x: Math.cos(ang) * spd, y: -2 - Math.random() * 3 },
        life: 50 + Math.random() * 30,
        maxLife: 80,
        color: Math.random() > 0.5 ? '#aaccff' : '#ffffff',
        size: 2 + Math.random() * 2
      });
    }

    // Treasure burst
    const treasureColors = ['#ffdd44', '#ffaa00', '#ffffff', '#88ffaa'];
    for (let i = 0; i < 25 * bossSize; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 5;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 2 },
        life: 35 + Math.random() * 25,
        maxLife: 60,
        color: treasureColors[Math.floor(Math.random() * treasureColors.length)],
        size: 2 + Math.random() * 2
      });
    }

    // Ground scorching
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 80 * bossSize;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: -0.3 },
        life: 60 + Math.random() * 30,
        maxLife: 90,
        color: '#332211',
        size: 3 + Math.random() * 3
      });
    }

    this.triggerScreenShake(20, 40);
  }

  // ============================================
  // NEW VFX EFFECTS - Combo & Killstreak
  // ============================================

  private createKillstreakFlameEffect(pos: Vec2, streakCount: number) {
    const intensity = Math.min(streakCount / 10, 2);
    const colors = streakCount >= 20 ? ['#ff2200', '#ff6600', '#ffaa00', '#ffffff'] :
                   streakCount >= 10 ? ['#ff4400', '#ff8800', '#ffcc00'] :
                   ['#ff6600', '#ffaa00'];

    // Rising flame aura
    for (let i = 0; i < 8 * intensity; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 15 + Math.random() * 15;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 2, y: -3 - Math.random() * 2 * intensity },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 2 * intensity
      });
    }

    // Streak number emphasis (particles forming upward)
    if (streakCount % 5 === 0 && streakCount > 0) {
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * 25, y: pos.y + Math.sin(ang) * 25 },
          vel: { x: Math.cos(ang) * 3, y: Math.sin(ang) * 3 - 2 },
          life: 15,
          maxLife: 15,
          color: '#ffffff',
          size: 3
        });
      }
    }
  }

  private createMultiKillEffect(pos: Vec2, killCount: number) {
    const ringCount = Math.min(killCount, 4);

    // Expanding rings for each kill
    for (let ring = 0; ring < ringCount; ring++) {
      const delay = ring * 0.15;
      const particleCount = 12 + ring * 4;
      const spd = 3 + ring * 1.5;

      for (let i = 0; i < particleCount; i++) {
        const ang = (i / particleCount) * Math.PI * 2;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 12 + ring * 4,
          maxLife: 12 + ring * 4,
          color: ring === 0 ? '#ffffff' : ring === 1 ? '#ffff44' : ring === 2 ? '#ff8844' : '#ff4444',
          size: 3 - ring * 0.3
        });
      }
    }

    // Central burst
    for (let i = 0; i < 10 * killCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 4;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.5 ? '#ffdd44' : '#ffffff',
        size: 2 + Math.random()
      });
    }

    // Text emphasis particles rising
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 30, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -2 - Math.random() * 2 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#ffaa00',
        size: 2.5
      });
    }

    if (killCount >= 3) {
      this.triggerScreenShake(3 + killCount, 10);
    }
  }

  private createPrecisionBonusEffect(pos: Vec2, accuracy: number) {
    const intensity = accuracy; // 0-1 range

    // Golden precision sparkles
    for (let i = 0; i < 8 * intensity; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 1 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: intensity > 0.9 ? '#ffffff' : '#ffdd44',
        size: 2 + intensity
      });
    }

    // Perfect shot indicator
    if (accuracy >= 0.95) {
      // Diamond pattern
      const dirs = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
      for (const dir of dirs) {
        for (let i = 0; i < 4; i++) {
          this.particles.push({
            pos: { x: pos.x + dir.x * (5 + i * 5), y: pos.y + dir.y * (5 + i * 5) },
            vel: { x: dir.x * 2, y: dir.y * 2 },
            life: 10 + i * 2,
            maxLife: 10 + i * 2,
            color: '#ffffff',
            size: 2.5 - i * 0.3
          });
        }
      }
    }

    // Rising bonus sparkles
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y + (Math.random() - 0.5) * 20 },
        vel: { x: 0, y: -1.5 - Math.random() },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#ffeeaa',
        size: 1.5
      });
    }
  }

  // ============================================
  // NEW VFX EFFECTS - Environmental Hazards
  // ============================================

  private createSandstormEffect(pos: Vec2, radius: number, direction: Vec2) {
    const windSpeed = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
    const normDir = { x: direction.x / windSpeed, y: direction.y / windSpeed };

    // Dense sand particles
    for (let i = 0; i < 25; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      const sandSpeed = 3 + Math.random() * 4;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: normDir.x * sandSpeed + (Math.random() - 0.5) * 2, y: normDir.y * sandSpeed + (Math.random() - 0.5) * 2 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: `rgb(${200 + Math.random() * 30}, ${170 + Math.random() * 30}, ${100 + Math.random() * 30})`,
        size: 2 + Math.random() * 2
      });
    }

    // Larger dust clouds
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.8;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: normDir.x * 2, y: normDir.y * 2 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#c9a86c',
        size: 5 + Math.random() * 4
      });
    }

    // Small debris
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: normDir.x * 5 + (Math.random() - 0.5) * 3, y: normDir.y * 5 - 1 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#8b7355',
        size: 1.5 + Math.random()
      });
    }
  }

  private createLightningStormEffect(pos: Vec2, radius: number) {
    // Main lightning bolt from sky
    const boltHeight = 300;
    let prevX = pos.x;
    let prevY = pos.y - boltHeight;

    for (let i = 0; i < 12; i++) {
      const t = (i + 1) / 12;
      let x = pos.x + (Math.random() - 0.5) * 40 * (1 - t);
      let y = pos.y - boltHeight * (1 - t);

      if (i === 11) {
        x = pos.x;
        y = pos.y;
      }

      // Main bolt particles
      for (let j = 0; j < 4; j++) {
        const pt = Math.random();
        this.particles.push({
          pos: { x: prevX + (x - prevX) * pt, y: prevY + (y - prevY) * pt },
          vel: { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4 },
          life: 6 + Math.random() * 4,
          maxLife: 10,
          color: j === 0 ? '#ffffff' : '#88ddff',
          size: j === 0 ? 4 : 3
        });
      }

      // Branch sparks
      if (Math.random() > 0.6) {
        const branchAng = Math.random() * Math.PI - Math.PI / 2;
        const branchLen = 20 + Math.random() * 30;
        for (let b = 0; b < 3; b++) {
          this.particles.push({
            pos: { x: x + Math.cos(branchAng) * branchLen * (b / 3), y: y + Math.sin(branchAng) * branchLen * (b / 3) },
            vel: { x: Math.cos(branchAng) * 2, y: Math.sin(branchAng) * 2 },
            life: 4 + Math.random() * 3,
            maxLife: 7,
            color: '#aaeeff',
            size: 2 - b * 0.5
          });
        }
      }

      prevX = x;
      prevY = y;
    }

    // Ground impact explosion
    for (let i = 0; i < 25; i++) {
      const ang = (i / 25) * Math.PI * 2;
      const spd = 4 + Math.random() * 4;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 1 },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: i % 3 === 0 ? '#ffffff' : '#66ccff',
        size: 3 + Math.random()
      });
    }

    // Electric arcs on ground
    for (let arc = 0; arc < 6; arc++) {
      const arcAng = (arc / 6) * Math.PI * 2;
      const arcLen = radius * (0.5 + Math.random() * 0.5);

      for (let i = 0; i < 5; i++) {
        const dist = (i / 5) * arcLen;
        const wobble = (Math.random() - 0.5) * 10;
        this.particles.push({
          pos: { x: pos.x + Math.cos(arcAng) * dist + wobble, y: pos.y + Math.sin(arcAng) * dist },
          vel: { x: Math.cos(arcAng) * 1.5, y: Math.sin(arcAng) * 1.5 },
          life: 8 + Math.random() * 5,
          maxLife: 13,
          color: '#44ddff',
          size: 2
        });
      }
    }

    // Scorched ground
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.5;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: -0.2 },
        life: 40 + Math.random() * 20,
        maxLife: 60,
        color: '#333322',
        size: 3 + Math.random() * 2
      });
    }

    this.triggerScreenShake(12, 15);
  }

  private createSwampMistEffect(pos: Vec2, radius: number) {
    // Dense, low-hanging mist
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      const height = Math.random() * 30;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r - height },
        vel: { x: (Math.random() - 0.5) * 0.8, y: (Math.random() - 0.5) * 0.3 },
        life: 50 + Math.random() * 30,
        maxLife: 80,
        color: `rgba(${60 + Math.random() * 40}, ${80 + Math.random() * 40}, ${60 + Math.random() * 30})`,
        size: 6 + Math.random() * 5
      });
    }

    // Toxic bubbles rising
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.8;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 0.3, y: -0.8 - Math.random() * 0.5 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#88aa66',
        size: 2 + Math.random() * 2
      });
    }

    // Occasional glow spots
    if (Math.random() > 0.7) {
      const glowAng = Math.random() * Math.PI * 2;
      const glowR = Math.random() * radius * 0.6;
      for (let i = 0; i < 3; i++) {
        this.particles.push({
          pos: { x: pos.x + Math.cos(glowAng) * glowR + (Math.random() - 0.5) * 10, y: pos.y + Math.sin(glowAng) * glowR },
          vel: { x: 0, y: -0.3 },
          life: 20 + Math.random() * 15,
          maxLife: 35,
          color: '#aaffaa',
          size: 2
        });
      }
    }
  }

  private createLavaEruptionEffect(pos: Vec2, intensity: number = 1) {
    // Main lava burst
    for (let i = 0; i < 20 * intensity; i++) {
      const ang = Math.random() * Math.PI - Math.PI; // Mostly upward
      const spd = 4 + Math.random() * 6 * intensity;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd * 0.5, y: Math.sin(ang) * spd },
        life: 25 + Math.random() * 20,
        maxLife: 45,
        color: Math.random() > 0.3 ? '#ff4400' : Math.random() > 0.5 ? '#ff8800' : '#ffcc00',
        size: 3 + Math.random() * 3 * intensity
      });
    }

    // Lava blobs with gravity
    for (let i = 0; i < 8 * intensity; i++) {
      const ang = (Math.random() - 0.5) * Math.PI * 0.8;
      const spd = 3 + Math.random() * 4;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.sin(ang) * spd, y: -Math.cos(ang) * spd },
        life: 35 + Math.random() * 20,
        maxLife: 55,
        color: '#ff6600',
        size: 4 + Math.random() * 3
      });
    }

    // Smoke and ash
    for (let i = 0; i < 12 * intensity; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 20;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 2, y: -2 - Math.random() * 3 },
        life: 40 + Math.random() * 30,
        maxLife: 70,
        color: `rgb(${60 + Math.random() * 40}, ${40 + Math.random() * 30}, ${30 + Math.random() * 20})`,
        size: 4 + Math.random() * 4
      });
    }

    // Ground splatter
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 3;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd * 0.3 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#cc3300',
        size: 2 + Math.random() * 2
      });
    }

    this.triggerScreenShake(8 * intensity, 20);
  }

  // ============================================
  // NEW VFX EFFECTS - Cooldown & Resources
  // ============================================

  private createCooldownReadyEffect(pos: Vec2, abilityColor: string = '#44aaff') {
    // Radial burst indicating ready
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const spd = 3 + Math.random();

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 12,
        maxLife: 12,
        color: i % 2 === 0 ? '#ffffff' : abilityColor,
        size: 2.5
      });
    }

    // Rising ready sparkles
    for (let i = 0; i < 8; i++) {
      const x = pos.x + (Math.random() - 0.5) * 30;
      this.particles.push({
        pos: { x, y: pos.y + 10 },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -2 - Math.random() * 1.5 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: abilityColor,
        size: 2 + Math.random()
      });
    }

    // Flash pulse
    this.particles.push({
      pos: { ...pos },
      vel: { x: 0, y: 0 },
      life: 8,
      maxLife: 8,
      color: '#ffffff',
      size: 8
    });
  }

  private createManaRegenEffect(pos: Vec2, regenAmount: number = 1) {
    const intensity = Math.min(regenAmount, 2);

    // Floating mana wisps gathering
    for (let i = 0; i < 6 * intensity; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 20;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: -Math.cos(ang) * 1.5, y: -Math.sin(ang) * 1.5 - 0.5 },
        life: 18 + Math.random() * 10,
        maxLife: 28,
        color: Math.random() > 0.5 ? '#4488ff' : '#88aaff',
        size: 2 + Math.random()
      });
    }

    // Central absorption glow
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 10, y: pos.y + (Math.random() - 0.5) * 10 },
        vel: { x: 0, y: -0.5 },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: '#aaccff',
        size: 2.5 + Math.random()
      });
    }

    // Sparkle trail
    for (let i = 0; i < 3; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y },
        vel: { x: 0, y: -1 - Math.random() },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#ffffff',
        size: 1.5
      });
    }
  }

  private createHealthRegenEffect(pos: Vec2, regenAmount: number = 1) {
    const intensity = Math.min(regenAmount, 2);

    // Green healing particles rising
    for (let i = 0; i < 8 * intensity; i++) {
      const x = pos.x + (Math.random() - 0.5) * 25;
      this.particles.push({
        pos: { x, y: pos.y + 10 },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -1.5 - Math.random() * 1.5 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: Math.random() > 0.3 ? '#44ff66' : '#88ffaa',
        size: 2 + Math.random() * intensity
      });
    }

    // Cross pattern sparkle
    if (intensity > 1) {
      const dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
      for (const dir of dirs) {
        this.particles.push({
          pos: { x: pos.x + dir.x * 10, y: pos.y + dir.y * 10 },
          vel: { x: dir.x * 1.5, y: dir.y * 1.5 - 0.5 },
          life: 12,
          maxLife: 12,
          color: '#ffffff',
          size: 2
        });
      }
    }

    // Gentle pulse
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * 15, y: pos.y + Math.sin(ang) * 15 },
        vel: { x: Math.cos(ang) * 0.5, y: Math.sin(ang) * 0.5 - 0.3 },
        life: 15,
        maxLife: 15,
        color: '#66ff88',
        size: 2
      });
    }
  }

  private createStaminaRecoveryEffect(pos: Vec2) {
    // Yellow energy wisps
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 15;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: -Math.cos(ang) * 1, y: -Math.sin(ang) * 1 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.5 ? '#ffdd44' : '#ffee88',
        size: 2 + Math.random()
      });
    }

    // Central glow
    this.particles.push({
      pos: { ...pos },
      vel: { x: 0, y: 0 },
      life: 10,
      maxLife: 10,
      color: '#ffffaa',
      size: 4
    });

    // Upward sparkles
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y },
        vel: { x: 0, y: -1.5 - Math.random() },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: '#ffffff',
        size: 1.5
      });
    }
  }

  // ============================================
  // NEW VFX EFFECTS - Critical & Precision
  // ============================================

  private createHeadshotEffect(pos: Vec2) {
    // Golden burst with skull-like pattern
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const spd = 4 + Math.random() * 2;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 12,
        maxLife: 12,
        color: i % 2 === 0 ? '#ffdd00' : '#ffffff',
        size: 3
      });
    }

    // X pattern for emphasis
    const xDirs = [{ x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }];
    for (const dir of xDirs) {
      for (let i = 0; i < 4; i++) {
        this.particles.push({
          pos: { x: pos.x + dir.x * i * 8, y: pos.y + dir.y * i * 8 },
          vel: { x: dir.x * 3, y: dir.y * 3 },
          life: 10 + i * 2,
          maxLife: 10 + i * 2,
          color: '#ffaa00',
          size: 2.5 - i * 0.3
        });
      }
    }

    // Rising bonus indicator
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 1, y: -3 - Math.random() * 2 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#ffee44',
        size: 2 + Math.random()
      });
    }

    this.triggerScreenShake(4, 8);
  }

  private createBackstabEffect(pos: Vec2, attackDir: Vec2) {
    const normDir = {
      x: attackDir.x / (Math.sqrt(attackDir.x * attackDir.x + attackDir.y * attackDir.y) || 1),
      y: attackDir.y / (Math.sqrt(attackDir.x * attackDir.x + attackDir.y * attackDir.y) || 1)
    };

    // Directional blood/damage spray
    for (let i = 0; i < 15; i++) {
      const spreadAng = Math.atan2(normDir.y, normDir.x) + (Math.random() - 0.5) * 0.8;
      const spd = 4 + Math.random() * 4;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(spreadAng) * spd, y: Math.sin(spreadAng) * spd },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.3 ? '#cc2222' : '#ff4444',
        size: 2 + Math.random() * 2
      });
    }

    // Stealth shimmer
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 15 + Math.random() * 10;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 1, y: (Math.random() - 0.5) * 1 },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: '#553366',
        size: 2 + Math.random()
      });
    }

    // Critical indicator
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y },
        vel: { x: 0, y: -2 - Math.random() },
        life: 18 + Math.random() * 10,
        maxLife: 28,
        color: '#ffaa00',
        size: 2
      });
    }

    this.triggerScreenShake(5, 10);
  }

  private createArmorBreakEffect(pos: Vec2) {
    // Metallic shard burst
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const spd = 3 + Math.random() * 4;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd + 1 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: Math.random() > 0.5 ? '#888899' : '#aaaacc',
        size: 2 + Math.random() * 2
      });
    }

    // Sparks from metal
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 4 + Math.random() * 3;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 8 + Math.random() * 5,
        maxLife: 13,
        color: Math.random() > 0.5 ? '#ffee88' : '#ffffff',
        size: 1.5 + Math.random()
      });
    }

    // Break indicator ring
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * 25, y: pos.y + Math.sin(ang) * 25 },
        vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 },
        life: 15,
        maxLife: 15,
        color: '#ff4444',
        size: 2.5
      });
    }

    this.triggerScreenShake(6, 12);
  }

  // ============================================
  // NEW VFX EFFECTS - Portals & Dimensional
  // ============================================

  private createDimensionalRiftEffect(pos: Vec2, radius: number, isOpening: boolean = true) {
    // Swirling void particles
    for (let layer = 0; layer < 3; layer++) {
      const layerRadius = radius * (0.4 + layer * 0.3);
      const particleCount = 12 + layer * 4;
      const rotDir = layer % 2 === 0 ? 1 : -1;

      for (let i = 0; i < particleCount; i++) {
        const ang = (i / particleCount) * Math.PI * 2;
        const orbitSpeed = 0.1 * rotDir * (3 - layer);

        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * layerRadius, y: pos.y + Math.sin(ang) * layerRadius },
          vel: {
            x: Math.cos(ang + Math.PI / 2) * orbitSpeed * layerRadius + (isOpening ? -Math.cos(ang) * 0.5 : Math.cos(ang) * 2),
            y: Math.sin(ang + Math.PI / 2) * orbitSpeed * layerRadius + (isOpening ? -Math.sin(ang) * 0.5 : Math.sin(ang) * 2)
          },
          life: 20 + layer * 5,
          maxLife: 20 + layer * 5,
          color: layer === 0 ? '#110022' : layer === 1 ? '#330066' : '#6600aa',
          size: 3 - layer * 0.5
        });
      }
    }

    // Reality tear particles
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.6;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#ffffff',
        size: 1.5 + Math.random()
      });
    }

    // Edge lightning
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 },
        life: 6 + Math.random() * 4,
        maxLife: 10,
        color: '#aa88ff',
        size: 2
      });
    }

    if (isOpening) {
      this.triggerScreenShake(5, 15);
    }
  }

  private createWarpGateEffect(pos: Vec2, radius: number, color: string = '#00ffaa') {
    // Spinning gate ring
    const ringParticles = 24;
    const rotation = Date.now() * 0.005;

    for (let i = 0; i < ringParticles; i++) {
      const ang = (i / ringParticles) * Math.PI * 2 + rotation;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius * 0.4 },
        vel: { x: Math.cos(ang + Math.PI / 2) * 0.5, y: 0 },
        life: 4,
        maxLife: 4,
        color: i % 3 === 0 ? '#ffffff' : color,
        size: 2 + Math.sin(i + rotation) * 0.5
      });
    }

    // Inner energy vortex
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.7;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r * 0.4 },
        vel: { x: -Math.cos(ang) * 2, y: -Math.sin(ang) * 0.8 },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: color,
        size: 2 + Math.random()
      });
    }

    // Vertical energy beam
    for (let i = 0; i < 6; i++) {
      const y = pos.y - 20 + i * 8;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 10, y },
        vel: { x: 0, y: -1 },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: '#ffffff',
        size: 2
      });
    }
  }

  private createTeleportArrivalEffect(pos: Vec2, playerColor: string) {
    // Materialization burst
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2;
      const spd = 3 + Math.random() * 2;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: i % 3 === 0 ? '#ffffff' : playerColor,
        size: 2.5 + Math.random()
      });
    }

    // Digital/glitch particles
    for (let i = 0; i < 12; i++) {
      const offsetX = (Math.random() - 0.5) * 40;
      const offsetY = (Math.random() - 0.5) * 60;

      this.particles.push({
        pos: { x: pos.x + offsetX, y: pos.y + offsetY },
        vel: { x: -offsetX * 0.05, y: -offsetY * 0.05 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: playerColor,
        size: 2 + Math.random()
      });
    }

    // Ground impact ring
    for (let ring = 0; ring < 2; ring++) {
      const ringRadius = 15 + ring * 15;
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * ringRadius, y: pos.y + Math.sin(ang) * ringRadius },
          vel: { x: Math.cos(ang) * (2 + ring), y: Math.sin(ang) * (2 + ring) },
          life: 10 + ring * 4,
          maxLife: 10 + ring * 4,
          color: ring === 0 ? '#ffffff' : playerColor,
          size: 2
        });
      }
    }

    this.triggerScreenShake(4, 8);
  }

  private createVoidCollapseEffect(pos: Vec2, radius: number) {
    // Imploding particles from edge
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * Math.PI * 2;
      const startR = radius + Math.random() * 20;
      const pullSpeed = 5 + Math.random() * 3;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * startR, y: pos.y + Math.sin(ang) * startR },
        vel: { x: -Math.cos(ang) * pullSpeed, y: -Math.sin(ang) * pullSpeed },
        life: 18 + Math.random() * 8,
        maxLife: 26,
        color: Math.random() > 0.5 ? '#6622aa' : '#330066',
        size: 2 + Math.random() * 2
      });
    }

    // Central darkness
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y + (Math.random() - 0.5) * 15 },
        vel: { x: 0, y: 0 },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#110011',
        size: 4 + Math.random() * 3
      });
    }

    // Final flash
    for (let i = 0; i < 15; i++) {
      const ang = (i / 15) * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 6, y: Math.sin(ang) * 6 },
        life: 8,
        maxLife: 8,
        color: '#ffffff',
        size: 3
      });
    }

    this.triggerScreenShake(10, 15);
  }

  // ============================================
  // WEATHER SYSTEM VFX
  // ============================================

  private createRainEffect(viewportBounds: { x: number; y: number; width: number; height: number }, intensity: number = 1) {
    const dropCount = Math.floor(8 * intensity);

    for (let i = 0; i < dropCount; i++) {
      const x = viewportBounds.x + Math.random() * viewportBounds.width;
      const y = viewportBounds.y - 20 + Math.random() * 50;
      const windOffset = Math.sin(Date.now() * 0.001) * 2;

      // Rain drops
      this.particles.push({
        pos: { x, y },
        vel: { x: windOffset + (Math.random() - 0.5), y: 8 + Math.random() * 4 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: intensity > 0.7 ? '#aaccff' : '#88aadd',
        size: 1 + Math.random() * 0.5
      });
    }

    // Occasional splash effect at ground level
    if (Math.random() > 0.8) {
      const splashX = viewportBounds.x + Math.random() * viewportBounds.width;
      const splashY = viewportBounds.y + viewportBounds.height - 50 + Math.random() * 100;

      for (let i = 0; i < 3; i++) {
        const ang = Math.random() * Math.PI;
        const spd = 1 + Math.random();
        this.particles.push({
          pos: { x: splashX, y: splashY },
          vel: { x: Math.cos(ang) * spd, y: -Math.sin(ang) * spd },
          life: 8 + Math.random() * 5,
          maxLife: 13,
          color: '#aaddff',
          size: 1 + Math.random() * 0.5
        });
      }
    }
  }

  private createSnowEffect(viewportBounds: { x: number; y: number; width: number; height: number }, intensity: number = 1) {
    const flakeCount = Math.floor(6 * intensity);

    for (let i = 0; i < flakeCount; i++) {
      const x = viewportBounds.x + Math.random() * viewportBounds.width;
      const y = viewportBounds.y - 10 + Math.random() * 30;
      const driftX = Math.sin(Date.now() * 0.0005 + i) * 0.5;

      // Snowflakes with gentle drift
      this.particles.push({
        pos: { x, y },
        vel: { x: driftX + (Math.random() - 0.5) * 0.8, y: 1 + Math.random() * 1.5 },
        life: 80 + Math.random() * 40,
        maxLife: 120,
        color: Math.random() > 0.3 ? '#ffffff' : '#eeeeff',
        size: 1.5 + Math.random() * 2
      });
    }

    // Occasional larger snowflakes
    if (Math.random() > 0.9) {
      this.particles.push({
        pos: {
          x: viewportBounds.x + Math.random() * viewportBounds.width,
          y: viewportBounds.y
        },
        vel: { x: (Math.random() - 0.5) * 0.5, y: 0.8 + Math.random() * 0.5 },
        life: 100 + Math.random() * 50,
        maxLife: 150,
        color: '#ffffff',
        size: 3 + Math.random() * 2
      });
    }
  }

  private createFogEffect(viewportBounds: { x: number; y: number; width: number; height: number }, density: number = 1) {
    const patchCount = Math.floor(4 * density);

    for (let i = 0; i < patchCount; i++) {
      const x = viewportBounds.x + Math.random() * viewportBounds.width;
      const y = viewportBounds.y + Math.random() * viewportBounds.height;
      const driftX = Math.sin(Date.now() * 0.0003 + x * 0.01) * 0.3;

      // Fog patches
      this.particles.push({
        pos: { x, y },
        vel: { x: driftX, y: (Math.random() - 0.5) * 0.1 },
        life: 100 + Math.random() * 80,
        maxLife: 180,
        color: `rgba(180, 180, 190, ${0.3 + Math.random() * 0.2})`,
        size: 15 + Math.random() * 20
      });
    }
  }

  private createAuroraEffect(viewportBounds: { x: number; y: number; width: number; height: number }) {
    const waveCount = 3;
    const time = Date.now() * 0.001;

    for (let wave = 0; wave < waveCount; wave++) {
      const baseY = viewportBounds.y + 50 + wave * 30;
      const particlesInWave = 8;

      for (let i = 0; i < particlesInWave; i++) {
        const x = viewportBounds.x + (i / particlesInWave) * viewportBounds.width;
        const waveOffset = Math.sin(time + x * 0.005 + wave) * 20;
        const colors = ['#44ff88', '#88ffaa', '#44ffcc', '#88aaff', '#aa88ff'];

        this.particles.push({
          pos: { x, y: baseY + waveOffset },
          vel: { x: (Math.random() - 0.5) * 0.3, y: (Math.random() - 0.5) * 0.5 },
          life: 20 + Math.random() * 15,
          maxLife: 35,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 4 + Math.random() * 3
        });
      }
    }

    // Aurora sparkles
    if (Math.random() > 0.7) {
      const sparkleX = viewportBounds.x + Math.random() * viewportBounds.width;
      const sparkleY = viewportBounds.y + 30 + Math.random() * 100;
      this.particles.push({
        pos: { x: sparkleX, y: sparkleY },
        vel: { x: 0, y: -0.5 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#ffffff',
        size: 1.5
      });
    }
  }

  private createMistRisingEffect(pos: Vec2, radius: number) {
    // Mist particles rising from ground
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -0.5 - Math.random() * 0.8 },
        life: 60 + Math.random() * 40,
        maxLife: 100,
        color: '#ccccdd',
        size: 5 + Math.random() * 4
      });
    }
  }

  private createHeatWaveEffect(viewportBounds: { x: number; y: number; width: number; height: number }) {
    const waveCount = 5;

    for (let i = 0; i < waveCount; i++) {
      const x = viewportBounds.x + Math.random() * viewportBounds.width;
      const y = viewportBounds.y + viewportBounds.height * 0.7 + Math.random() * viewportBounds.height * 0.3;

      // Heat distortion particles
      this.particles.push({
        pos: { x, y },
        vel: { x: (Math.random() - 0.5) * 0.3, y: -0.8 - Math.random() * 0.5 },
        life: 40 + Math.random() * 30,
        maxLife: 70,
        color: '#ffeecc',
        size: 8 + Math.random() * 6
      });
    }
  }

  // ============================================
  // BIOME AMBIENT VFX
  // ============================================

  private createForestAmbientEffect(pos: Vec2, radius: number) {
    // Floating leaves
    if (Math.random() > 0.6) {
      const leafX = pos.x + (Math.random() - 0.5) * radius * 2;
      const leafY = pos.y - 50 + Math.random() * 30;
      const colors = ['#558833', '#669944', '#447722', '#88aa44'];

      this.particles.push({
        pos: { x: leafX, y: leafY },
        vel: {
          x: (Math.random() - 0.5) * 1 + Math.sin(Date.now() * 0.002) * 0.5,
          y: 0.5 + Math.random() * 0.5
        },
        life: 80 + Math.random() * 60,
        maxLife: 140,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 2
      });
    }

    // Fireflies at night
    if (Math.random() > 0.8) {
      const ffX = pos.x + (Math.random() - 0.5) * radius * 2;
      const ffY = pos.y + (Math.random() - 0.5) * radius;

      this.particles.push({
        pos: { x: ffX, y: ffY },
        vel: { x: (Math.random() - 0.5) * 0.5, y: (Math.random() - 0.5) * 0.5 },
        life: 30 + Math.random() * 30,
        maxLife: 60,
        color: '#ffffaa',
        size: 2 + Math.sin(Date.now() * 0.01 + ffX) * 1
      });
    }

    // Pollen/spores
    for (let i = 0; i < 2; i++) {
      const sporeX = pos.x + (Math.random() - 0.5) * radius * 2;
      const sporeY = pos.y + (Math.random() - 0.5) * radius;

      this.particles.push({
        pos: { x: sporeX, y: sporeY },
        vel: { x: (Math.random() - 0.5) * 0.3, y: -0.2 - Math.random() * 0.3 },
        life: 50 + Math.random() * 40,
        maxLife: 90,
        color: '#ddffdd',
        size: 1 + Math.random()
      });
    }
  }

  private createDesertAmbientEffect(pos: Vec2, radius: number) {
    // Dust devils
    if (Math.random() > 0.85) {
      const dustX = pos.x + (Math.random() - 0.5) * radius * 2;
      const dustY = pos.y + (Math.random() - 0.5) * radius;

      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + Date.now() * 0.005;
        const r = 5 + i * 2;
        this.particles.push({
          pos: { x: dustX + Math.cos(ang) * r, y: dustY + Math.sin(ang) * r - i * 3 },
          vel: { x: Math.cos(ang + Math.PI / 2) * 2, y: -1 - Math.random() },
          life: 20 + Math.random() * 15,
          maxLife: 35,
          color: '#c9a86c',
          size: 2 + Math.random()
        });
      }
    }

    // Floating sand
    for (let i = 0; i < 3; i++) {
      const sandX = pos.x + (Math.random() - 0.5) * radius * 2;
      const sandY = pos.y + radius * 0.3 + Math.random() * radius * 0.4;

      this.particles.push({
        pos: { x: sandX, y: sandY },
        vel: { x: 1 + Math.random() * 0.5, y: (Math.random() - 0.5) * 0.3 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#ddc99a',
        size: 1 + Math.random()
      });
    }
  }

  private createSnowBiomeAmbientEffect(pos: Vec2, radius: number) {
    // Frost sparkles
    if (Math.random() > 0.7) {
      const sparkleX = pos.x + (Math.random() - 0.5) * radius * 2;
      const sparkleY = pos.y + (Math.random() - 0.5) * radius;

      this.particles.push({
        pos: { x: sparkleX, y: sparkleY },
        vel: { x: 0, y: 0 },
        life: 10 + Math.random() * 10,
        maxLife: 20,
        color: '#ffffff',
        size: 1.5 + Math.random()
      });
    }

    // Breath vapor (near entities)
    if (Math.random() > 0.9) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y - 10 },
        vel: { x: 0.3 + Math.random() * 0.3, y: -0.3 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#ddddee',
        size: 3 + Math.random() * 2
      });
    }

    // Snow drift
    for (let i = 0; i < 2; i++) {
      const driftX = pos.x + (Math.random() - 0.5) * radius * 2;
      const driftY = pos.y + radius * 0.4;

      this.particles.push({
        pos: { x: driftX, y: driftY },
        vel: { x: 0.5 + Math.random() * 0.5, y: -0.2 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#ffffff',
        size: 1.5 + Math.random()
      });
    }
  }

  private createSwampBiomeAmbientEffect(pos: Vec2, radius: number) {
    // Bubbles rising
    if (Math.random() > 0.7) {
      const bubbleX = pos.x + (Math.random() - 0.5) * radius;
      const bubbleY = pos.y + radius * 0.3;

      this.particles.push({
        pos: { x: bubbleX, y: bubbleY },
        vel: { x: (Math.random() - 0.5) * 0.2, y: -0.8 - Math.random() * 0.5 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#88aa77',
        size: 2 + Math.random() * 2
      });
    }

    // Will-o-wisps
    if (Math.random() > 0.9) {
      const wispX = pos.x + (Math.random() - 0.5) * radius * 2;
      const wispY = pos.y + (Math.random() - 0.5) * radius * 0.5;
      const wispColor = Math.random() > 0.5 ? '#88ffaa' : '#aaffcc';

      this.particles.push({
        pos: { x: wispX, y: wispY },
        vel: { x: Math.sin(Date.now() * 0.003 + wispX) * 0.5, y: Math.cos(Date.now() * 0.002 + wispY) * 0.3 },
        life: 40 + Math.random() * 30,
        maxLife: 70,
        color: wispColor,
        size: 3 + Math.sin(Date.now() * 0.01) * 1.5
      });
    }

    // Flies
    for (let i = 0; i < 2; i++) {
      const flyX = pos.x + (Math.random() - 0.5) * radius;
      const flyY = pos.y + (Math.random() - 0.5) * radius * 0.5;

      this.particles.push({
        pos: { x: flyX, y: flyY },
        vel: {
          x: (Math.random() - 0.5) * 2,
          y: (Math.random() - 0.5) * 2
        },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#222222',
        size: 1
      });
    }
  }

  private createVolcanicBiomeAmbientEffect(pos: Vec2, radius: number) {
    // Floating embers
    for (let i = 0; i < 4; i++) {
      const emberX = pos.x + (Math.random() - 0.5) * radius * 2;
      const emberY = pos.y + (Math.random() - 0.5) * radius;

      this.particles.push({
        pos: { x: emberX, y: emberY },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -1 - Math.random() * 1.5 },
        life: 30 + Math.random() * 25,
        maxLife: 55,
        color: Math.random() > 0.5 ? '#ff6600' : '#ffaa00',
        size: 1.5 + Math.random()
      });
    }

    // Smoke plumes
    if (Math.random() > 0.8) {
      const smokeX = pos.x + (Math.random() - 0.5) * radius;
      const smokeY = pos.y + (Math.random() - 0.5) * radius * 0.5;

      this.particles.push({
        pos: { x: smokeX, y: smokeY },
        vel: { x: (Math.random() - 0.5) * 0.3, y: -0.8 - Math.random() * 0.5 },
        life: 50 + Math.random() * 30,
        maxLife: 80,
        color: '#444433',
        size: 6 + Math.random() * 4
      });
    }

    // Lava glow
    if (Math.random() > 0.9) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * radius, y: pos.y + radius * 0.3 },
        vel: { x: 0, y: 0 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#ff4400',
        size: 4 + Math.random() * 3
      });
    }
  }

  private createOceanAmbientEffect(pos: Vec2, radius: number) {
    // Wave spray
    if (Math.random() > 0.8) {
      const sprayX = pos.x + (Math.random() - 0.5) * radius * 2;
      const sprayY = pos.y + radius * 0.3;

      for (let i = 0; i < 4; i++) {
        const ang = Math.random() * Math.PI;
        const spd = 1 + Math.random() * 1.5;
        this.particles.push({
          pos: { x: sprayX, y: sprayY },
          vel: { x: Math.cos(ang) * spd, y: -Math.sin(ang) * spd },
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color: '#aaddff',
          size: 1.5 + Math.random()
        });
      }
    }

    // Foam
    for (let i = 0; i < 2; i++) {
      const foamX = pos.x + (Math.random() - 0.5) * radius * 2;
      const foamY = pos.y + radius * 0.2 + Math.random() * radius * 0.2;

      this.particles.push({
        pos: { x: foamX, y: foamY },
        vel: { x: 0.3 + Math.random() * 0.3, y: (Math.random() - 0.5) * 0.2 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: '#ffffff',
        size: 2 + Math.random() * 2
      });
    }

    // Light reflection
    if (Math.random() > 0.85) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * radius, y: pos.y + (Math.random() - 0.5) * radius * 0.5 },
        vel: { x: 0, y: 0 },
        life: 8 + Math.random() * 6,
        maxLife: 14,
        color: '#ffffff',
        size: 2
      });
    }
  }

  // ============================================
  // WEAPON IMPACT VFX VARIATIONS
  // ============================================

  private createSwordImpactEffect(pos: Vec2, impactAngle: number, isCritical: boolean = false) {
    const intensity = isCritical ? 1.5 : 1;

    // Directional sparks
    for (let i = 0; i < 8 * intensity; i++) {
      const spreadAngle = impactAngle + (Math.random() - 0.5) * Math.PI * 0.6;
      const spd = 3 + Math.random() * 4;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(spreadAngle) * spd, y: Math.sin(spreadAngle) * spd },
        life: 8 + Math.random() * 6,
        maxLife: 14,
        color: isCritical ? '#ffff88' : '#ffeecc',
        size: 1.5 + Math.random()
      });
    }

    // Metal flash
    this.particles.push({
      pos: { ...pos },
      vel: { x: 0, y: 0 },
      life: 4,
      maxLife: 4,
      color: '#ffffff',
      size: 6 * intensity
    });

    // Slash trail
    for (let i = 0; i < 5; i++) {
      const trailAngle = impactAngle + Math.PI + (Math.random() - 0.5) * 0.3;
      const dist = i * 8;
      this.particles.push({
        pos: { x: pos.x + Math.cos(trailAngle) * dist, y: pos.y + Math.sin(trailAngle) * dist },
        vel: { x: Math.cos(impactAngle) * 0.5, y: Math.sin(impactAngle) * 0.5 },
        life: 6 + i,
        maxLife: 6 + i,
        color: '#dddddd',
        size: 3 - i * 0.4
      });
    }

    if (isCritical) {
      this.triggerScreenShake(3, 5);
    }
  }

  private createAxeImpactEffect(pos: Vec2, impactAngle: number) {
    // Heavy impact debris
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 4;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 1 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.5 ? '#886644' : '#aa8866',
        size: 2 + Math.random() * 2
      });
    }

    // Shockwave ring
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 3, y: Math.sin(ang) * 3 },
        life: 8,
        maxLife: 8,
        color: '#ffddaa',
        size: 2.5
      });
    }

    // Dust cloud
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y + (Math.random() - 0.5) * 15 },
        vel: { x: Math.cos(ang) * 0.5, y: -0.5 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#998877',
        size: 4 + Math.random() * 3
      });
    }

    this.triggerScreenShake(4, 8);
  }

  private createSpearImpactEffect(pos: Vec2, impactAngle: number, isPierce: boolean = false) {
    // Focused directional impact
    for (let i = 0; i < 6; i++) {
      const spreadAngle = impactAngle + (Math.random() - 0.5) * Math.PI * 0.3;
      const spd = 4 + Math.random() * 3;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(spreadAngle) * spd, y: Math.sin(spreadAngle) * spd },
        life: 10 + Math.random() * 6,
        maxLife: 16,
        color: '#ffffff',
        size: 1.5 + Math.random()
      });
    }

    // Pierce through effect
    if (isPierce) {
      for (let i = 0; i < 4; i++) {
        const dist = 15 + i * 15;
        this.particles.push({
          pos: { x: pos.x + Math.cos(impactAngle) * dist, y: pos.y + Math.sin(impactAngle) * dist },
          vel: { x: Math.cos(impactAngle) * 2, y: Math.sin(impactAngle) * 2 },
          life: 8 + i * 2,
          maxLife: 8 + i * 2,
          color: '#ffdddd',
          size: 2 - i * 0.3
        });
      }
    }

    // Small flash
    this.particles.push({
      pos: { ...pos },
      vel: { x: 0, y: 0 },
      life: 3,
      maxLife: 3,
      color: '#ffffff',
      size: 4
    });
  }

  private createHammerImpactEffect(pos: Vec2) {
    // Massive ground pound
    for (let ring = 0; ring < 3; ring++) {
      const particleCount = 12 + ring * 4;
      const spd = 3 + ring * 2;

      for (let i = 0; i < particleCount; i++) {
        const ang = (i / particleCount) * Math.PI * 2;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd * 0.5 },
          life: 10 + ring * 3,
          maxLife: 10 + ring * 3,
          color: ring === 0 ? '#ffffff' : ring === 1 ? '#ffeeaa' : '#ddccaa',
          size: 3 - ring * 0.5
        });
      }
    }

    // Ground cracks
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + Math.random() * 0.2;
      const length = 30 + Math.random() * 20;

      for (let j = 0; j < 4; j++) {
        const dist = (j / 4) * length;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
          vel: { x: 0, y: -0.3 },
          life: 25 + Math.random() * 15,
          maxLife: 40,
          color: '#443322',
          size: 2.5 - j * 0.4
        });
      }
    }

    // Flying debris
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 4;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: -3 - Math.random() * 4 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: Math.random() > 0.5 ? '#776655' : '#554433',
        size: 2 + Math.random() * 2
      });
    }

    this.triggerScreenShake(8, 15);
  }

  private createBowImpactEffect(pos: Vec2, impactAngle: number) {
    // Arrow stick
    for (let i = 0; i < 3; i++) {
      const dist = i * 5;
      this.particles.push({
        pos: { x: pos.x - Math.cos(impactAngle) * dist, y: pos.y - Math.sin(impactAngle) * dist },
        vel: { x: 0, y: 0 },
        life: 40 + i * 5,
        maxLife: 40 + i * 5,
        color: '#886644',
        size: 2 - i * 0.3
      });
    }

    // Impact sparks
    for (let i = 0; i < 6; i++) {
      const ang = impactAngle + Math.PI + (Math.random() - 0.5) * Math.PI * 0.5;
      const spd = 2 + Math.random() * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 8 + Math.random() * 5,
        maxLife: 13,
        color: '#ffeecc',
        size: 1.5
      });
    }

    // Small dust puff
    for (let i = 0; i < 3; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 10, y: pos.y + (Math.random() - 0.5) * 10 },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -0.5 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#aa9988',
        size: 2 + Math.random()
      });
    }
  }

  private createMagicStaffImpactEffect(pos: Vec2, element: string) {
    const elementColors: Record<string, string[]> = {
      fire: ['#ff4400', '#ff8800', '#ffcc00', '#ffffff'],
      ice: ['#4488ff', '#88ccff', '#aaeeff', '#ffffff'],
      lightning: ['#ffff44', '#ffff88', '#ffffff', '#88ddff'],
      earth: ['#886644', '#aa8866', '#ccaa88', '#ddccaa'],
      poison: ['#44ff44', '#88ff88', '#aaffaa', '#ccffcc'],
      dark: ['#442266', '#663388', '#8844aa', '#aa66cc'],
      holy: ['#ffdd44', '#ffee88', '#ffffaa', '#ffffff']
    };

    const colors = elementColors[element] || elementColors.fire;

    // Magical burst
    for (let i = 0; i < 15; i++) {
      const ang = (i / 15) * Math.PI * 2;
      const spd = 3 + Math.random() * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2.5 + Math.random()
      });
    }

    // Arcane sparkles
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 25;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 1, y: -1 - Math.random() },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: colors[0],
        size: 1.5 + Math.random()
      });
    }

    // Central glow
    this.particles.push({
      pos: { ...pos },
      vel: { x: 0, y: 0 },
      life: 8,
      maxLife: 8,
      color: '#ffffff',
      size: 8
    });
  }

  // ============================================
  // ABILITY CHARGING & RELEASE VFX
  // ============================================

  private createAbilityChargingEffect(pos: Vec2, chargeLevel: number, maxCharge: number, color: string = '#44aaff') {
    const percent = chargeLevel / maxCharge;
    const radius = 20 + percent * 30;

    // Gathering energy particles
    const gatherCount = Math.floor(6 * percent);
    for (let i = 0; i < gatherCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const startR = radius + 30 + Math.random() * 20;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * startR, y: pos.y + Math.sin(ang) * startR },
        vel: { x: -Math.cos(ang) * 3 * percent, y: -Math.sin(ang) * 3 * percent },
        life: 15,
        maxLife: 15,
        color: color,
        size: 2 + percent
      });
    }

    // Rotating ring
    const ringParticles = 8;
    const rotation = Date.now() * 0.005 * (1 + percent);
    for (let i = 0; i < ringParticles; i++) {
      const ang = (i / ringParticles) * Math.PI * 2 + rotation;
      if (i / ringParticles < percent) {
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
          vel: { x: Math.cos(ang + Math.PI / 2) * 0.5, y: Math.sin(ang + Math.PI / 2) * 0.5 },
          life: 5,
          maxLife: 5,
          color: i % 2 === 0 ? '#ffffff' : color,
          size: 2 + percent
        });
      }
    }

    // Center glow intensity
    if (percent > 0.3) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 10, y: pos.y + (Math.random() - 0.5) * 10 },
        vel: { x: 0, y: 0 },
        life: 6,
        maxLife: 6,
        color: '#ffffff',
        size: 4 * percent
      });
    }

    // Max charge sparks
    if (percent >= 1) {
      for (let i = 0; i < 4; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 2 + Math.random() * 2;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 8,
          maxLife: 8,
          color: '#ffffff',
          size: 2.5
        });
      }
    }
  }

  private createAbilityReleaseEffect(pos: Vec2, chargeLevel: number, color: string = '#44aaff') {
    const intensity = Math.min(chargeLevel, 3);

    // Explosive release
    for (let ring = 0; ring < 3; ring++) {
      const particleCount = 12 + ring * 6;
      const spd = 4 + ring * 2 + intensity * 1.5;

      for (let i = 0; i < particleCount; i++) {
        const ang = (i / particleCount) * Math.PI * 2;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 12 + ring * 4,
          maxLife: 12 + ring * 4,
          color: ring === 0 ? '#ffffff' : color,
          size: 3 - ring * 0.5
        });
      }
    }

    // Energy wave
    for (let i = 0; i < 20 * intensity; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 5 + Math.random() * 5;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: color,
        size: 2 + Math.random() * 2
      });
    }

    // Flash
    this.particles.push({
      pos: { ...pos },
      vel: { x: 0, y: 0 },
      life: 6,
      maxLife: 6,
      color: '#ffffff',
      size: 15 * intensity
    });

    this.triggerScreenShake(5 * intensity, 10);
  }

  private createChannelingEffect(pos: Vec2, duration: number, color: string = '#aa44ff') {
    // Continuous particles flowing upward
    for (let i = 0; i < 4; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 15 + Math.random() * 10;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -1.5 - Math.random() },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: color,
        size: 2 + Math.random()
      });
    }

    // Ground rune effect
    const runePoints = 6;
    const runeRotation = Date.now() * 0.002;
    for (let i = 0; i < runePoints; i++) {
      const ang = (i / runePoints) * Math.PI * 2 + runeRotation;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * 25, y: pos.y + Math.sin(ang) * 25 },
        vel: { x: 0, y: 0 },
        life: 5,
        maxLife: 5,
        color: i % 2 === 0 ? color : '#ffffff',
        size: 2
      });
    }

    // Inner glow pulse
    const pulse = Math.sin(Date.now() * 0.01) * 0.5 + 0.5;
    this.particles.push({
      pos: { ...pos },
      vel: { x: 0, y: 0 },
      life: 4,
      maxLife: 4,
      color: color,
      size: 6 + pulse * 4
    });
  }

  // ============================================
  // MAGIC ELEMENT COMBINATION VFX
  // ============================================

  private createFireIceCombinationEffect(pos: Vec2, radius: number) {
    // Steam explosion
    for (let i = 0; i < 25; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 4;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 1 },
        life: 25 + Math.random() * 20,
        maxLife: 45,
        color: '#ddddee',
        size: 4 + Math.random() * 4
      });
    }

    // Fire side
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
      const spd = 2 + Math.random() * 3;
      this.particles.push({
        pos: { x: pos.x - 15, y: pos.y },
        vel: { x: Math.cos(ang) * spd - 1, y: Math.sin(ang) * spd },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.5 ? '#ff4400' : '#ff8800',
        size: 2 + Math.random() * 2
      });
    }

    // Ice side
    for (let i = 0; i < 10; i++) {
      const ang = Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
      const spd = 2 + Math.random() * 3;
      this.particles.push({
        pos: { x: pos.x + 15, y: pos.y },
        vel: { x: Math.cos(ang) * spd + 1, y: Math.sin(ang) * spd },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.5 ? '#88ccff' : '#aaeeff',
        size: 2 + Math.random() * 2
      });
    }

    // Reaction flash
    this.particles.push({
      pos: { ...pos },
      vel: { x: 0, y: 0 },
      life: 8,
      maxLife: 8,
      color: '#ffffff',
      size: 12
    });

    this.triggerScreenShake(6, 12);
  }

  private createLightningWaterCombinationEffect(pos: Vec2, radius: number) {
    // Electrified water spreading
    for (let ring = 0; ring < 3; ring++) {
      const particleCount = 16 + ring * 8;
      const ringRadius = (ring + 1) * (radius / 3);

      for (let i = 0; i < particleCount; i++) {
        const ang = (i / particleCount) * Math.PI * 2;
        const spd = 2 + ring;

        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * ringRadius * 0.3, y: pos.y + Math.sin(ang) * ringRadius * 0.3 },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 15 + ring * 5,
          maxLife: 15 + ring * 5,
          color: i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#88ddff' : '#ffff88',
          size: 2.5 - ring * 0.3
        });
      }
    }

    // Electric arcs
    for (let arc = 0; arc < 8; arc++) {
      const ang = Math.random() * Math.PI * 2;
      const length = radius * (0.5 + Math.random() * 0.5);

      for (let i = 0; i < 4; i++) {
        const dist = (i / 4) * length;
        const wobble = (Math.random() - 0.5) * 15;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * dist + wobble, y: pos.y + Math.sin(ang) * dist },
          vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 },
          life: 5 + Math.random() * 4,
          maxLife: 9,
          color: '#88eeff',
          size: 2
        });
      }
    }

    // Central discharge
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 4 + Math.random() * 3;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 8 + Math.random() * 5,
        maxLife: 13,
        color: '#ffffff',
        size: 2.5
      });
    }

    this.triggerScreenShake(7, 10);
  }

  private createPoisonFireCombinationEffect(pos: Vec2, radius: number) {
    // Toxic flames
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 3;
      const isToxic = Math.random() > 0.5;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 2 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: isToxic ? '#88ff44' : '#ff8844',
        size: 3 + Math.random() * 2
      });
    }

    // Noxious cloud
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.8;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 1, y: -0.8 - Math.random() * 0.5 },
        life: 35 + Math.random() * 25,
        maxLife: 60,
        color: '#66aa33',
        size: 5 + Math.random() * 4
      });
    }

    // Burning poison drips
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 2;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd + 1 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: '#aaff66',
        size: 2 + Math.random()
      });
    }

    this.triggerScreenShake(5, 10);
  }

  private createEarthLightningCombinationEffect(pos: Vec2, radius: number) {
    // Magnetized rock shrapnel
    for (let i = 0; i < 15; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 3 + Math.random() * 4;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 1 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: Math.random() > 0.3 ? '#886644' : '#ffff88',
        size: 2.5 + Math.random() * 2
      });
    }

    // Ground fractures with electricity
    for (let crack = 0; crack < 6; crack++) {
      const ang = (crack / 6) * Math.PI * 2 + Math.random() * 0.3;
      const length = radius * (0.6 + Math.random() * 0.4);

      for (let i = 0; i < 5; i++) {
        const dist = (i / 5) * length;
        const electric = Math.random() > 0.6;

        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * dist, y: pos.y + Math.sin(ang) * dist },
          vel: { x: Math.cos(ang) * 0.5, y: -0.3 },
          life: electric ? 6 : 30,
          maxLife: electric ? 6 : 30,
          color: electric ? '#ffff88' : '#554433',
          size: electric ? 2 : 2.5 - i * 0.3
        });
      }
    }

    // Electric nova
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 5, y: Math.sin(ang) * 5 },
        life: 8,
        maxLife: 8,
        color: '#ffffff',
        size: 3
      });
    }

    this.triggerScreenShake(8, 12);
  }

  private createHolyDarkCombinationEffect(pos: Vec2, radius: number) {
    // Twilight vortex
    for (let layer = 0; layer < 4; layer++) {
      const layerRadius = radius * (0.3 + layer * 0.25);
      const particleCount = 10 + layer * 4;
      const isHoly = layer % 2 === 0;

      for (let i = 0; i < particleCount; i++) {
        const ang = (i / particleCount) * Math.PI * 2 + layer * 0.5;
        const rotDir = isHoly ? 1 : -1;

        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * layerRadius, y: pos.y + Math.sin(ang) * layerRadius },
          vel: {
            x: Math.cos(ang + Math.PI / 2 * rotDir) * 2,
            y: Math.sin(ang + Math.PI / 2 * rotDir) * 2 + (isHoly ? -0.5 : 0.5)
          },
          life: 20 + layer * 5,
          maxLife: 20 + layer * 5,
          color: isHoly ? '#ffee88' : '#442266',
          size: 3 - layer * 0.4
        });
      }
    }

    // Balance flash
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const isHoly = i % 2 === 0;
      const spd = 4 + Math.random() * 2;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        life: 15,
        maxLife: 15,
        color: isHoly ? '#ffffff' : '#220044',
        size: 3
      });
    }

    // Yin-yang center
    this.particles.push({
      pos: { ...pos },
      vel: { x: 0, y: 0 },
      life: 10,
      maxLife: 10,
      color: '#888888',
      size: 10
    });

    this.triggerScreenShake(6, 15);
  }

  private createAllElementsCombinationEffect(pos: Vec2, radius: number) {
    // Ultimate elemental convergence
    const elements = [
      { color: '#ff4400', name: 'fire' },
      { color: '#44aaff', name: 'ice' },
      { color: '#ffff44', name: 'lightning' },
      { color: '#886644', name: 'earth' },
      { color: '#44ff44', name: 'poison' },
      { color: '#ffdd44', name: 'holy' },
      { color: '#442266', name: 'dark' },
      { color: '#ff44aa', name: 'arcane' }
    ];

    // Elemental spiral
    for (let elem = 0; elem < elements.length; elem++) {
      const baseAng = (elem / elements.length) * Math.PI * 2;
      const elemColor = elements[elem].color;

      for (let i = 0; i < 8; i++) {
        const spiralAng = baseAng + (i / 8) * Math.PI * 0.5;
        const r = radius * (0.3 + (i / 8) * 0.7);
        const spd = 3 + i * 0.5;

        this.particles.push({
          pos: { x: pos.x + Math.cos(spiralAng) * r * 0.3, y: pos.y + Math.sin(spiralAng) * r * 0.3 },
          vel: { x: Math.cos(spiralAng) * spd, y: Math.sin(spiralAng) * spd },
          life: 20 + i * 3,
          maxLife: 20 + i * 3,
          color: elemColor,
          size: 3 - i * 0.2
        });
      }
    }

    // White core explosion
    for (let ring = 0; ring < 4; ring++) {
      const particleCount = 16 + ring * 8;
      const spd = 5 + ring * 2;

      for (let i = 0; i < particleCount; i++) {
        const ang = (i / particleCount) * Math.PI * 2;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 15 + ring * 4,
          maxLife: 15 + ring * 4,
          color: ring < 2 ? '#ffffff' : elements[Math.floor(Math.random() * elements.length)].color,
          size: 4 - ring * 0.5
        });
      }
    }

    // Rising energy pillar
    for (let i = 0; i < 30; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius * 0.5;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 2, y: -4 - Math.random() * 4 },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: elements[Math.floor(Math.random() * elements.length)].color,
        size: 2.5 + Math.random() * 2
      });
    }

    // Ground scorching
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: -0.2 },
        life: 50 + Math.random() * 30,
        maxLife: 80,
        color: '#222211',
        size: 3 + Math.random() * 2
      });
    }

    this.triggerScreenShake(15, 25);
  }

  // ============================================
  // NPC & ALLY INTERACTION VFX
  // ============================================

  private createTraderInteractionEffect(pos: Vec2) {
    // Coin sparkles around trader
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Date.now() * 0.003;
      const r = 20 + Math.sin(Date.now() * 0.005 + i) * 5;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y - 20 + Math.sin(ang) * r * 0.4 },
        vel: { x: 0, y: -0.3 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.5 ? '#ffdd44' : '#ffffff',
        size: 2 + Math.random()
      });
    }

    // Welcome sparkle
    if (Math.random() > 0.8) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 30, y: pos.y - 30 + (Math.random() - 0.5) * 20 },
        vel: { x: 0, y: -0.5 },
        life: 12,
        maxLife: 12,
        color: '#ffffff',
        size: 2
      });
    }
  }

  private createAllyHealingEffect(sourcePos: Vec2, targetPos: Vec2) {
    const dx = targetPos.x - sourcePos.x;
    const dy = targetPos.y - sourcePos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const segments = Math.max(5, Math.floor(dist / 20));

    // Healing beam particles
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = sourcePos.x + dx * t;
      const y = sourcePos.y + dy * t;
      const wobble = Math.sin(t * Math.PI * 3 + Date.now() * 0.01) * 5;

      this.particles.push({
        pos: { x: x + wobble, y },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -0.5 },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: Math.random() > 0.3 ? '#44ff88' : '#ffffff',
        size: 2 + Math.random()
      });
    }

    // Target healing sparkles
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 10;
      this.particles.push({
        pos: { x: targetPos.x + Math.cos(ang) * r, y: targetPos.y + Math.sin(ang) * r },
        vel: { x: 0, y: -1 - Math.random() },
        life: 18 + Math.random() * 10,
        maxLife: 28,
        color: '#88ffaa',
        size: 2
      });
    }
  }

  private createAllyAttackEffect(pos: Vec2, targetDir: Vec2, allyType: string) {
    const colors: Record<string, string[]> = {
      archer: ['#886644', '#aa8866', '#ffffff'],
      mage: ['#8844ff', '#aa66ff', '#ffffff'],
      knight: ['#888899', '#aaaacc', '#ffffff'],
      healer: ['#44ff88', '#88ffaa', '#ffffff']
    };
    const allyColors = colors[allyType] || colors.knight;

    // Directional attack particles
    const attackAngle = Math.atan2(targetDir.y, targetDir.x);
    for (let i = 0; i < 8; i++) {
      const spreadAngle = attackAngle + (Math.random() - 0.5) * 0.5;
      const spd = 3 + Math.random() * 3;

      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(spreadAngle) * spd, y: Math.sin(spreadAngle) * spd },
        life: 10 + Math.random() * 6,
        maxLife: 16,
        color: allyColors[Math.floor(Math.random() * allyColors.length)],
        size: 2 + Math.random()
      });
    }

    // Attack flash
    this.particles.push({
      pos: { ...pos },
      vel: { x: 0, y: 0 },
      life: 4,
      maxLife: 4,
      color: '#ffffff',
      size: 5
    });
  }

  private createNPCEmotionEffect(pos: Vec2, emotion: string) {
    const emotionConfig: Record<string, { color: string; pattern: string }> = {
      happy: { color: '#ffff44', pattern: 'rise' },
      angry: { color: '#ff4444', pattern: 'burst' },
      sad: { color: '#4488ff', pattern: 'fall' },
      surprised: { color: '#ffffff', pattern: 'expand' },
      confused: { color: '#aa88ff', pattern: 'spiral' },
      love: { color: '#ff88aa', pattern: 'float' }
    };

    const config = emotionConfig[emotion] || emotionConfig.happy;

    switch (config.pattern) {
      case 'rise':
        for (let i = 0; i < 6; i++) {
          this.particles.push({
            pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y - 20 },
            vel: { x: (Math.random() - 0.5) * 0.5, y: -1.5 - Math.random() },
            life: 20 + Math.random() * 15,
            maxLife: 35,
            color: config.color,
            size: 2 + Math.random()
          });
        }
        break;
      case 'burst':
        for (let i = 0; i < 10; i++) {
          const ang = Math.random() * Math.PI * 2;
          const spd = 2 + Math.random() * 2;
          this.particles.push({
            pos: { x: pos.x, y: pos.y - 20 },
            vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
            life: 12 + Math.random() * 8,
            maxLife: 20,
            color: config.color,
            size: 2 + Math.random()
          });
        }
        break;
      case 'fall':
        for (let i = 0; i < 4; i++) {
          this.particles.push({
            pos: { x: pos.x + (Math.random() - 0.5) * 10, y: pos.y - 25 },
            vel: { x: 0, y: 0.5 + Math.random() * 0.5 },
            life: 25 + Math.random() * 15,
            maxLife: 40,
            color: config.color,
            size: 2
          });
        }
        break;
      case 'expand':
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          this.particles.push({
            pos: { x: pos.x, y: pos.y - 20 },
            vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 },
            life: 10,
            maxLife: 10,
            color: config.color,
            size: 3
          });
        }
        break;
      case 'spiral':
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          const r = 10;
          this.particles.push({
            pos: { x: pos.x + Math.cos(ang) * r, y: pos.y - 20 + Math.sin(ang) * r },
            vel: { x: Math.cos(ang + Math.PI / 2) * 1.5, y: Math.sin(ang + Math.PI / 2) * 1.5 - 0.5 },
            life: 15 + Math.random() * 10,
            maxLife: 25,
            color: config.color,
            size: 2
          });
        }
        break;
      case 'float':
        for (let i = 0; i < 5; i++) {
          this.particles.push({
            pos: { x: pos.x + (Math.random() - 0.5) * 25, y: pos.y - 20 + (Math.random() - 0.5) * 10 },
            vel: { x: Math.sin(Date.now() * 0.005 + i) * 0.5, y: -0.8 - Math.random() * 0.5 },
            life: 25 + Math.random() * 15,
            maxLife: 40,
            color: config.color,
            size: 2.5 + Math.random()
          });
        }
        break;
    }
  }

  // ============================================
  // BUILDING & CONSTRUCTION VFX
  // ============================================

  private createBuildingPlacementEffect(pos: Vec2, width: number, height: number, buildingType: string) {
    const typeColors: Record<string, string> = {
      wall: '#886644',
      tower: '#666688',
      gate: '#aa8866',
      barracks: '#668866',
      shop: '#888844'
    };
    const color = typeColors[buildingType] || '#888888';

    // Construction dust
    for (let i = 0; i < 15; i++) {
      const x = pos.x + (Math.random() - 0.5) * width;
      const y = pos.y + height * 0.4;

      this.particles.push({
        pos: { x, y },
        vel: { x: (Math.random() - 0.5) * 2, y: -1 - Math.random() * 2 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#aa9988',
        size: 3 + Math.random() * 2
      });
    }

    // Sparkle outline
    const perimeterParticles = Math.floor((width + height) / 10);
    for (let i = 0; i < perimeterParticles; i++) {
      let x, y;
      const side = Math.floor(Math.random() * 4);
      switch (side) {
        case 0: x = pos.x - width / 2 + Math.random() * width; y = pos.y - height / 2; break;
        case 1: x = pos.x - width / 2 + Math.random() * width; y = pos.y + height / 2; break;
        case 2: x = pos.x - width / 2; y = pos.y - height / 2 + Math.random() * height; break;
        default: x = pos.x + width / 2; y = pos.y - height / 2 + Math.random() * height; break;
      }

      this.particles.push({
        pos: { x, y },
        vel: { x: 0, y: -0.5 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.5 ? color : '#ffffff',
        size: 2
      });
    }

    // Central completion flash
    this.particles.push({
      pos: { ...pos },
      vel: { x: 0, y: 0 },
      life: 10,
      maxLife: 10,
      color: '#ffffff',
      size: Math.max(width, height) * 0.3
    });
  }

  private createBuildingUpgradeEffect(pos: Vec2, width: number, height: number) {
    // Rising upgrade sparkles
    for (let i = 0; i < 20; i++) {
      const x = pos.x + (Math.random() - 0.5) * width;
      const y = pos.y + (Math.random() - 0.5) * height;

      this.particles.push({
        pos: { x, y },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -2 - Math.random() * 2 },
        life: 25 + Math.random() * 20,
        maxLife: 45,
        color: Math.random() > 0.5 ? '#ffdd44' : '#ffffff',
        size: 2 + Math.random()
      });
    }

    // Golden aura pulse
    for (let ring = 0; ring < 2; ring++) {
      const particleCount = 16;
      const radius = Math.max(width, height) * 0.6 + ring * 15;

      for (let i = 0; i < particleCount; i++) {
        const ang = (i / particleCount) * Math.PI * 2;
        this.particles.push({
          pos: { x: pos.x + Math.cos(ang) * radius * 0.5, y: pos.y + Math.sin(ang) * radius * 0.3 },
          vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 1.5 },
          life: 12 + ring * 4,
          maxLife: 12 + ring * 4,
          color: ring === 0 ? '#ffffff' : '#ffee88',
          size: 2.5 - ring * 0.3
        });
      }
    }

    // Level up stars
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const r = Math.max(width, height) * 0.4;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y - height * 0.3 + Math.sin(ang) * r * 0.5 },
        vel: { x: Math.cos(ang) * 1, y: -1.5 },
        life: 20,
        maxLife: 20,
        color: '#ffff88',
        size: 3
      });
    }
  }

  private createConstructionProgressEffect(pos: Vec2, progress: number) {
    // Hammer/tool sparks
    if (Math.random() > 0.7) {
      const sparkX = pos.x + (Math.random() - 0.5) * 30;
      const sparkY = pos.y + (Math.random() - 0.5) * 20;

      for (let i = 0; i < 4; i++) {
        const ang = Math.random() * Math.PI;
        const spd = 1.5 + Math.random() * 2;
        this.particles.push({
          pos: { x: sparkX, y: sparkY },
          vel: { x: Math.cos(ang) * spd, y: -Math.sin(ang) * spd },
          life: 8 + Math.random() * 5,
          maxLife: 13,
          color: '#ffeeaa',
          size: 1.5
        });
      }
    }

    // Construction dust
    for (let i = 0; i < 2; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 40, y: pos.y + 10 },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -0.5 - Math.random() * 0.5 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#998877',
        size: 2 + Math.random() * 2
      });
    }

    // Progress indicator particles
    const progressParticles = Math.floor(progress * 6);
    for (let i = 0; i < progressParticles; i++) {
      const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const r = 25;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: 0, y: 0 },
        life: 5,
        maxLife: 5,
        color: '#44ff88',
        size: 2
      });
    }
  }

  // ============================================
  // STATUS EFFECT AURA VFX
  // ============================================

  private createBurningAuraEffect(pos: Vec2, radius: number) {
    // Flame particles
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * (0.5 + Math.random() * 0.5);

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 1, y: -2 - Math.random() * 1.5 },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: Math.random() > 0.5 ? '#ff4400' : Math.random() > 0.5 ? '#ff8800' : '#ffcc00',
        size: 2 + Math.random() * 2
      });
    }

    // Smoke wisps
    if (Math.random() > 0.7) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * radius, y: pos.y - radius * 0.3 },
        vel: { x: (Math.random() - 0.5) * 0.3, y: -1 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#443322',
        size: 3 + Math.random() * 2
      });
    }
  }

  private createFrozenAuraEffect(pos: Vec2, radius: number) {
    // Ice crystals floating
    for (let i = 0; i < 4; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * (0.6 + Math.random() * 0.4);

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 0.5, y: (Math.random() - 0.5) * 0.5 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.5 ? '#aaeeff' : '#ffffff',
        size: 2 + Math.random()
      });
    }

    // Frost sparkle
    if (Math.random() > 0.8) {
      const sparkleAng = Math.random() * Math.PI * 2;
      const sparkleR = radius * Math.random();
      this.particles.push({
        pos: { x: pos.x + Math.cos(sparkleAng) * sparkleR, y: pos.y + Math.sin(sparkleAng) * sparkleR },
        vel: { x: 0, y: 0 },
        life: 8,
        maxLife: 8,
        color: '#ffffff',
        size: 2
      });
    }

    // Cold mist
    for (let i = 0; i < 2; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * radius, y: pos.y + radius * 0.3 },
        vel: { x: (Math.random() - 0.5) * 0.3, y: 0.2 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#aaccdd',
        size: 3 + Math.random() * 2
      });
    }
  }

  private createPoisonedAuraEffect(pos: Vec2, radius: number) {
    // Toxic bubbles
    for (let i = 0; i < 3; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * (0.3 + Math.random() * 0.5);

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 0.3, y: -0.8 - Math.random() * 0.5 },
        life: 18 + Math.random() * 12,
        maxLife: 30,
        color: Math.random() > 0.5 ? '#88ff44' : '#66dd33',
        size: 2 + Math.random()
      });
    }

    // Poison drip
    if (Math.random() > 0.8) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * radius * 0.8, y: pos.y },
        vel: { x: 0, y: 1 + Math.random() * 0.5 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#44aa22',
        size: 1.5 + Math.random()
      });
    }
  }

  private createShieldedAuraEffect(pos: Vec2, radius: number, shieldColor: string = '#4488ff') {
    // Rotating shield particles
    const shieldParticles = 8;
    const rotation = Date.now() * 0.003;

    for (let i = 0; i < shieldParticles; i++) {
      const ang = (i / shieldParticles) * Math.PI * 2 + rotation;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius, y: pos.y + Math.sin(ang) * radius },
        vel: { x: Math.cos(ang + Math.PI / 2) * 0.3, y: Math.sin(ang + Math.PI / 2) * 0.3 },
        life: 5,
        maxLife: 5,
        color: i % 2 === 0 ? shieldColor : '#ffffff',
        size: 2
      });
    }

    // Occasional shield shimmer
    if (Math.random() > 0.85) {
      const shimmerAng = Math.random() * Math.PI * 2;
      this.particles.push({
        pos: { x: pos.x + Math.cos(shimmerAng) * radius, y: pos.y + Math.sin(shimmerAng) * radius },
        vel: { x: 0, y: 0 },
        life: 10,
        maxLife: 10,
        color: '#ffffff',
        size: 3
      });
    }
  }

  private createEnragedAuraEffect(pos: Vec2, radius: number) {
    // Angry red particles
    for (let i = 0; i < 5; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * (0.5 + Math.random() * 0.5);

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 1.5, y: -1.5 - Math.random() * 1.5 },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: Math.random() > 0.5 ? '#ff2200' : '#ff4400',
        size: 2 + Math.random()
      });
    }

    // Rage veins pulsing outward
    if (Math.random() > 0.7) {
      const veinAng = Math.random() * Math.PI * 2;
      for (let i = 0; i < 3; i++) {
        const dist = radius * 0.3 + i * radius * 0.2;
        this.particles.push({
          pos: { x: pos.x + Math.cos(veinAng) * dist, y: pos.y + Math.sin(veinAng) * dist },
          vel: { x: Math.cos(veinAng) * 1.5, y: Math.sin(veinAng) * 1.5 },
          life: 8 + i * 2,
          maxLife: 8 + i * 2,
          color: '#cc0000',
          size: 2 - i * 0.3
        });
      }
    }
  }

  private createBlessedAuraEffect(pos: Vec2, radius: number) {
    // Holy light particles rising
    for (let i = 0; i < 4; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = radius * (0.4 + Math.random() * 0.4);

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: (Math.random() - 0.5) * 0.3, y: -1 - Math.random() * 0.8 },
        life: 18 + Math.random() * 12,
        maxLife: 30,
        color: Math.random() > 0.5 ? '#ffee88' : '#ffffff',
        size: 2 + Math.random()
      });
    }

    // Halo ring
    const haloParticles = 6;
    const haloRotation = Date.now() * 0.002;
    for (let i = 0; i < haloParticles; i++) {
      const ang = (i / haloParticles) * Math.PI * 2 + haloRotation;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * radius * 0.8, y: pos.y - radius * 0.8 + Math.sin(ang) * radius * 0.2 },
        vel: { x: 0, y: 0 },
        life: 5,
        maxLife: 5,
        color: '#ffdd66',
        size: 2
      });
    }
  }

  // ============================================
  // ITEM DROP & RARITY VFX
  // ============================================

  private createCommonItemDropEffect(pos: Vec2) {
    // Simple sparkle
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * 2, y: Math.sin(ang) * 2 - 1 },
        life: 12 + Math.random() * 6,
        maxLife: 18,
        color: '#aaaaaa',
        size: 2
      });
    }
  }

  private createUncommonItemDropEffect(pos: Vec2) {
    // Green glow burst
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 2;
      this.particles.push({
        pos: { ...pos },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 1 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: Math.random() > 0.5 ? '#44ff44' : '#88ff88',
        size: 2 + Math.random()
      });
    }

    // Rising sparkles
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y },
        vel: { x: 0, y: -1.5 - Math.random() },
        life: 20 + Math.random() * 10,
        maxLife: 30,
        color: '#66ff66',
        size: 2
      });
    }
  }

  private createRareItemDropEffect(pos: Vec2) {
    // Blue burst with glow
    for (let ring = 0; ring < 2; ring++) {
      const particleCount = 12 + ring * 6;
      const spd = 2.5 + ring * 1.5;

      for (let i = 0; i < particleCount; i++) {
        const ang = (i / particleCount) * Math.PI * 2;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 0.5 },
          life: 15 + ring * 5,
          maxLife: 15 + ring * 5,
          color: ring === 0 ? '#ffffff' : '#4488ff',
          size: 2.5 - ring * 0.3
        });
      }
    }

    // Rising blue particles
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y },
        vel: { x: (Math.random() - 0.5) * 0.5, y: -2 - Math.random() * 1.5 },
        life: 25 + Math.random() * 15,
        maxLife: 40,
        color: Math.random() > 0.5 ? '#4488ff' : '#88aaff',
        size: 2 + Math.random()
      });
    }
  }

  private createEpicItemDropEffect(pos: Vec2) {
    // Purple explosion
    for (let ring = 0; ring < 3; ring++) {
      const particleCount = 12 + ring * 6;
      const spd = 3 + ring * 1.5;

      for (let i = 0; i < particleCount; i++) {
        const ang = (i / particleCount) * Math.PI * 2;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 15 + ring * 5,
          maxLife: 15 + ring * 5,
          color: ring === 0 ? '#ffffff' : ring === 1 ? '#aa66ff' : '#8844ff',
          size: 3 - ring * 0.5
        });
      }
    }

    // Swirling arcane energy
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const r = 15 + Math.random() * 10;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + Math.sin(ang) * r },
        vel: { x: Math.cos(ang + Math.PI / 2) * 2, y: Math.sin(ang + Math.PI / 2) * 2 - 1 },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#aa44ff',
        size: 2 + Math.random()
      });
    }

    // Central glow
    this.particles.push({
      pos: { ...pos },
      vel: { x: 0, y: 0 },
      life: 12,
      maxLife: 12,
      color: '#ffffff',
      size: 10
    });
  }

  private createLegendaryItemDropEffect(pos: Vec2) {
    // Multi-color legendary burst
    const colors = ['#ffdd44', '#ff8844', '#ff4488', '#ff44ff', '#8844ff'];

    for (let ring = 0; ring < 4; ring++) {
      const particleCount = 16 + ring * 8;
      const spd = 3 + ring * 2;

      for (let i = 0; i < particleCount; i++) {
        const ang = (i / particleCount) * Math.PI * 2;
        this.particles.push({
          pos: { ...pos },
          vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
          life: 18 + ring * 5,
          maxLife: 18 + ring * 5,
          color: ring === 0 ? '#ffffff' : colors[Math.floor(Math.random() * colors.length)],
          size: 3.5 - ring * 0.5
        });
      }
    }

    // Ascending golden spiral
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 4;
      const r = 10 + i * 2;
      const height = -i * 5;

      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + height },
        vel: { x: Math.cos(ang) * 0.5, y: -2 - Math.random() },
        life: 30 + Math.random() * 20,
        maxLife: 50,
        color: Math.random() > 0.3 ? '#ffdd44' : '#ffffff',
        size: 2.5 + Math.random()
      });
    }

    // Beam of light
    for (let i = 0; i < 30; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 15, y: pos.y - i * 8 },
        vel: { x: 0, y: 2 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#ffeeaa',
        size: 3 - i * 0.05
      });
    }

    this.triggerScreenShake(5, 10);
  }

  // ============================================
  // MOVEMENT & TRAVERSAL VFX
  // ============================================

  private createRunningDustTrailEffect(pos: Vec2, direction: Vec2, speed: number) {
    if (speed < 3) return;

    const intensity = Math.min(speed / 8, 1.5);

    // Dust puffs behind
    for (let i = 0; i < Math.floor(2 * intensity); i++) {
      this.particles.push({
        pos: { x: pos.x - direction.x * 10 + (Math.random() - 0.5) * 8, y: pos.y + 5 },
        vel: { x: -direction.x * 0.5 + (Math.random() - 0.5) * 0.5, y: -0.5 - Math.random() * 0.5 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#aa9988',
        size: 2 + Math.random() * intensity
      });
    }
  }

  private createJumpLaunchEffect(pos: Vec2, power: number = 1) {
    // Ground burst
    for (let i = 0; i < 8 * power; i++) {
      const ang = Math.random() * Math.PI;
      const spd = 2 + Math.random() * 2 * power;
      this.particles.push({
        pos: { x: pos.x, y: pos.y + 5 },
        vel: { x: Math.cos(ang) * spd * (Math.random() > 0.5 ? 1 : -1), y: -Math.sin(ang) * spd * 0.5 },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: '#998877',
        size: 2 + Math.random()
      });
    }

    // Jump wind effect
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y },
        vel: { x: 0, y: 1.5 + Math.random() },
        life: 10 + Math.random() * 6,
        maxLife: 16,
        color: '#dddddd',
        size: 2
      });
    }
  }

  private createLandingImpactEffect(pos: Vec2, fallSpeed: number) {
    const intensity = Math.min(fallSpeed / 10, 2);

    // Ground impact ring
    const ringParticles = Math.floor(12 * intensity);
    for (let i = 0; i < ringParticles; i++) {
      const ang = (i / ringParticles) * Math.PI * 2;
      const spd = 2 + intensity;
      this.particles.push({
        pos: { x: pos.x, y: pos.y + 5 },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd * 0.3 },
        life: 10 + intensity * 3,
        maxLife: 10 + intensity * 3,
        color: '#ccbbaa',
        size: 2 + intensity * 0.5
      });
    }

    // Dust cloud
    for (let i = 0; i < 6 * intensity; i++) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 20, y: pos.y + 5 },
        vel: { x: (Math.random() - 0.5) * 1.5, y: -1 - Math.random() * intensity },
        life: 20 + Math.random() * 15,
        maxLife: 35,
        color: '#aa9988',
        size: 3 + Math.random() * 2
      });
    }

    if (intensity > 1) {
      this.triggerScreenShake(2 * intensity, 5);
    }
  }

  private createWaterWadingEffect(pos: Vec2, speed: number) {
    if (speed < 1) return;

    const intensity = Math.min(speed / 5, 1);

    // Water ripples
    for (let i = 0; i < 3 * intensity; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 5 + Math.random() * 10;
      this.particles.push({
        pos: { x: pos.x + Math.cos(ang) * r, y: pos.y + 3 + Math.sin(ang) * r * 0.3 },
        vel: { x: Math.cos(ang) * 0.5, y: 0 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#88bbdd',
        size: 2 + Math.random()
      });
    }

    // Splash droplets
    if (speed > 3 && Math.random() > 0.5) {
      for (let i = 0; i < 4; i++) {
        const ang = Math.random() * Math.PI;
        const spd = 1 + Math.random() * 2;
        this.particles.push({
          pos: { x: pos.x, y: pos.y },
          vel: { x: Math.cos(ang) * spd * (Math.random() > 0.5 ? 1 : -1), y: -Math.sin(ang) * spd },
          life: 12 + Math.random() * 8,
          maxLife: 20,
          color: '#aaddff',
          size: 1.5 + Math.random()
        });
      }
    }
  }

  private createSlideTrailEffect(pos: Vec2, direction: Vec2) {
    // Sliding sparks/dust
    for (let i = 0; i < 4; i++) {
      const offsetX = (Math.random() - 0.5) * 15;
      this.particles.push({
        pos: { x: pos.x + offsetX, y: pos.y + 5 },
        vel: { x: -direction.x * 0.5 + (Math.random() - 0.5) * 0.5, y: -0.3 - Math.random() * 0.3 },
        life: 12 + Math.random() * 8,
        maxLife: 20,
        color: Math.random() > 0.5 ? '#ffeecc' : '#ddccaa',
        size: 1.5 + Math.random()
      });
    }

    // Friction sparks
    if (Math.random() > 0.7) {
      const sparkAng = Math.atan2(-direction.y, -direction.x) + (Math.random() - 0.5) * 0.5;
      this.particles.push({
        pos: { x: pos.x, y: pos.y + 5 },
        vel: { x: Math.cos(sparkAng) * 2, y: Math.sin(sparkAng) * 2 - 0.5 },
        life: 6 + Math.random() * 4,
        maxLife: 10,
        color: '#ffffff',
        size: 1.5
      });
    }
  }

  private createClimbingEffect(pos: Vec2, climbSpeed: number) {
    // Grip dust
    if (Math.random() > 0.6) {
      for (let i = 0; i < 2; i++) {
        this.particles.push({
          pos: { x: pos.x + (Math.random() > 0.5 ? 12 : -12), y: pos.y + (Math.random() - 0.5) * 20 },
          vel: { x: (Math.random() - 0.5) * 0.5, y: 0.5 + Math.random() * 0.5 },
          life: 15 + Math.random() * 10,
          maxLife: 25,
          color: '#aa9988',
          size: 1.5 + Math.random()
        });
      }
    }

    // Effort particles
    if (climbSpeed > 2) {
      this.particles.push({
        pos: { x: pos.x + (Math.random() - 0.5) * 10, y: pos.y - 10 },
        vel: { x: (Math.random() - 0.5) * 0.3, y: -0.5 },
        life: 10 + Math.random() * 8,
        maxLife: 18,
        color: '#dddddd',
        size: 2
      });
    }
  }

  private createRollEffect(pos: Vec2, rollDirection: Vec2) {
    // Dust trail during roll
    for (let i = 0; i < 6; i++) {
      const offsetX = (Math.random() - 0.5) * 20;
      const offsetY = (Math.random() - 0.5) * 10;
      this.particles.push({
        pos: { x: pos.x + offsetX, y: pos.y + offsetY + 5 },
        vel: { x: -rollDirection.x * 0.8 + (Math.random() - 0.5) * 0.8, y: -0.5 - Math.random() * 0.5 },
        life: 15 + Math.random() * 10,
        maxLife: 25,
        color: '#998877',
        size: 2 + Math.random() * 1.5
      });
    }

    // Motion blur effect
    for (let i = 0; i < 3; i++) {
      const dist = (i + 1) * 8;
      this.particles.push({
        pos: { x: pos.x - rollDirection.x * dist, y: pos.y - rollDirection.y * dist },
        vel: { x: 0, y: 0 },
        life: 4 + i,
        maxLife: 4 + i,
        color: '#dddddd',
        size: 4 - i
      });
    }
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
      allies: this.allies,
      screenShake: this.screenShake.intensity
    };
  }

  public getMagicWheelInfo(playerIndex: number): { manaCost: number; comboName: string | null } {
    const wheel = this.magicWheels[playerIndex];
    if (!wheel) return { manaCost: 0, comboName: null };
    return { manaCost: wheel.calculateManaCost(), comboName: wheel.getComboName() };
  }
}
