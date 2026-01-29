
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
