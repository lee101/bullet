
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
  Campfire
} from '../types';
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
  TOWN_RADIUS
} from '../constants';
import { InputManager } from './InputManager';
import { WorldGenerator } from './WorldGenerator';

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
  private town: TownState = { id: 0, name: "Ancient Hub", prosperity: 10, tradeCount: 0, level: 1, pos: { x: WORLD_WIDTH/2, y: WORLD_HEIGHT/2 }, goldGeneration: 50, style: 'MEDIEVAL' };
  private campfires: Campfire[] = [];
  private playerCityHealCooldowns: number[] = [];
  private input: InputManager;
  public world: WorldGenerator;

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

  constructor(input: InputManager) {
    this.input = input;
    this.world = new WorldGenerator();
    this.reset();
  }

  public reset() {
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
    this.town = { id: 0, name: "Citadel Bazaar", prosperity: 10, tradeCount: 0, level: 1, pos: { x: WORLD_WIDTH/2, y: WORLD_HEIGHT/2 }, goldGeneration: 50, style: 'MEDIEVAL' };
    this.campfires = [];
    this.playerCityHealCooldowns = [];
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
    this.world = new WorldGenerator();
    this.camera = { x: WORLD_WIDTH / 2 - window.innerWidth / 2, y: WORLD_HEIGHT / 2 - window.innerHeight / 2 };
  }

  public start(playerCount: number = 1) {
    const spawn = this.world.getSpawnablePosition();
    const colors = ['#4d99ff', '#ff4d99', '#4dff99', '#ffff4d'];
    const count = Math.max(1, Math.min(4, playerCount));

    for(let i = 0; i < count; i++) {
        const p = JSON.parse(JSON.stringify(INITIAL_PLAYER_STATS));
        p.id = i;
        p.color = colors[i];
        this.players.push(p);
        this.playerPositions.push({ x: spawn.x + i * 40, y: spawn.y });
        this.playerCityHealCooldowns.push(0);
    }

    // Load campfires from world generator
    this.campfires = this.world.getCampfires();

    // Update town with first generated town's style
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
    this.startWave(1);
    this.state = GameState.PLAYING;
  }

  private spawnAmbientMounts() {
    // Spawn land mounts
    for (let i = 0; i < 60; i++) {
        const pos = this.world.getSpawnablePosition();
        const types: MountType[] = ['HORSE', 'CHARIOT', 'DRAGON'];
        const type = types[Math.floor(Math.pow(Math.random(), 2) * 3)];
        const cfg = MOUNT_CONFIGS[type];
        this.mounts.push({
          id: this.nextId++,
          pos,
          type,
          hp: cfg.hp,
          maxHp: cfg.hp,
          angle: Math.random() * Math.PI * 2,
          alerted: false
        });
    }

    // Spawn boats on shorelines
    const shorePositions = this.world.getShorePositions(25);
    for (const pos of shorePositions) {
      const cfg = MOUNT_CONFIGS.BOAT;
      this.mounts.push({
        id: this.nextId++,
        pos,
        type: 'BOAT',
        hp: cfg.hp,
        maxHp: cfg.hp,
        angle: Math.random() * Math.PI * 2,
        alerted: false
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

    // Spawn more enemies across the larger world
    for (let i = 0; i < 80; i++) {
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

  private startWave(waveNum: number) {
    this.wave = waveNum;
    this.enemiesToSpawn = 12 + waveNum * 8;
    this.enemiesSpawned = 0;
    this.enemiesKilledThisWave = 0;
    this.money += this.town.goldGeneration;
    if (waveNum % 5 === 0) this.spawnBoss();
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

    this.players.forEach((p, i) => {
      const pos = this.playerPositions[i];
      if (p.isDead) return;

      p.magic = Math.min(p.maxMagic, p.magic + 0.35); 
      const move = this.input.getMovement(i);
      
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

      // Mounting with Sneak Logic
      if (this.input.isRevivePressed(i)) {
          this.mounts.forEach((m, mi) => {
              const dSq = this.distSq(m.pos, pos);
              if (dSq < 70 * 70) {
                  const angleToPlayer = Math.atan2(pos.y - m.pos.y, pos.x - m.pos.x);
                  let diff = Math.abs(angleToPlayer - m.angle);
                  while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
                  
                  const isBehind = diff > 2.0; 
                  if (!m.alerted || isBehind) {
                    p.mount = m.type;
                    this.mounts.splice(mi, 1);
                    this.createExplosion(pos, '#fff', 15, 2, 4);
                  }
              }
          });
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
      pos.x += move.x * finalSpeed;
      pos.y += move.y * finalSpeed;
      pos.x = Math.max(0, Math.min(WORLD_WIDTH, pos.x));
      pos.y = Math.max(0, Math.min(WORLD_HEIGHT, pos.y));

      // Mountain collision - only dragons can fly over mountains
      const newBiome = this.world.getBiomeAt(pos.x, pos.y);
      if (newBiome === 'MOUNTAIN' && p.mount !== 'DRAGON') {
        pos.x = oldX;
        pos.y = oldY;
      }
      // Water collision - need boat or dragon
      if (newBiome === 'SEA' && p.mount !== 'DRAGON' && p.mount !== 'BOAT') {
        pos.x = oldX;
        pos.y = oldY;
      }

      // City auto-heal - full HP when entering city, 2min cooldown
      if (this.playerCityHealCooldowns[i] > 0) this.playerCityHealCooldowns[i]--;
      if (newBiome === 'TOWN' && this.playerCityHealCooldowns[i] <= 0 && p.hp < p.maxHp) {
        p.hp = p.maxHp;
        this.playerCityHealCooldowns[i] = CITY_HEAL_COOLDOWN;
        this.createExplosion(pos, '#00ff88', 25, 4, 6);
        this.addDamageNumber({ x: pos.x, y: pos.y - 30 }, 0, true, 'FULL HEAL');
      }

      for (let s = 0; s < 4; s++) {
        p.skillCooldowns[s]--;
        if (p.skillCooldowns[s] <= 0 && this.input.isSkillPressed(i, s)) this.activateSkill(i, s);
      }

      p.autoAttackCooldown--;
      if (p.autoAttackCooldown <= 0) {
          const nearest = this.getNearestEnemy(pos, 600);
          if (nearest && nearest.isAggressive) {
              const ang = Math.atan2(nearest.pos.y - pos.y, nearest.pos.x - pos.x);
              this.shoot(i, ang, ElementType.PHYSICAL, p.weaponType);
              p.autoAttackCooldown = 30;
          }
      }
    });

    this.updateTraders();
    this.updateAttacks();
    this.updateWalls();
    this.updateTowers();
    this.updateEnemies();
    this.updateFireAreas();
    this.updateMounts();
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

    this.particles.forEach(p => { p.pos.x += p.vel.x; p.pos.y += p.vel.y; p.life--; });
    this.particles = this.particles.filter(p => p.life > 0);
    this.damageNumbers.forEach(dn => { dn.pos.y -= 1.0; dn.life--; });
    this.damageNumbers = this.damageNumbers.filter(dn => dn.life > 0);
    this.coins.forEach(c => { 
        c.pos.x += c.vel.x; c.pos.y += c.vel.y; 
        this.playerPositions.forEach((pp, i) => {
            if (this.distSq(c.pos, pp) < 120*120) {
                const dx = pp.x - c.pos.x, dy = pp.y - c.pos.y, d = Math.sqrt(dx*dx+dy*dy);
                c.vel.x += (dx/d)*0.4; c.vel.y += (dy/d)*0.4;
            }
            if (this.distSq(c.pos, pp) < 30*30) {
                this.money += c.value; c.life = 0;
            }
        });
    });
    this.coins = this.coins.filter(c => c.life > 0);
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
      // Skip simulation for far-away mounts
      if (!this.isInSimRange(m.pos, 600)) return;

      // Enemy damage to mounts
      const mountRadius = m.type === 'DRAGON' ? 40 : m.type === 'CHARIOT' ? 32 : 24;
      this.enemies.forEach(e => {
        if (!e.isAggressive) return;
        if (this.distSq(m.pos, e.pos) < (mountRadius + e.radius) ** 2) {
          m.hp -= e.damage * 0.5;
          e.knockbackVel = { x: (e.pos.x - m.pos.x) * 0.3, y: (e.pos.y - m.pos.y) * 0.3 };
        }
      });

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
          if (this.frameCount % 180 === 0) m.angle += (Math.random()-0.5);
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
            if (this.players[i].hp < 1) this.players[i].hp = 1;
          }
        });
      }
    });
    this.fireAreas = this.fireAreas.filter(fa => fa.life > 0);
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

    // Check mana cost
    if (p.magic < spellData.manaCost) return;
    p.magic -= spellData.manaCost;
    p.skillCooldowns[sIdx] = spellData.cooldown;

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
        pos.x += move.x * spellData.range;
        pos.y += move.y * spellData.range;
        this.createExplosion(pos, '#fff', 20, 4, 6);
        break;

      case 'NOVA':
        this.createExplosion(pos, '#0ff', 60, 8, 14);
        this.enemies.forEach(e => {
          if (this.distSq(pos, e.pos) < (spellData.radius || 380)**2) {
            e.hp -= spellData.damage;
            e.isAggressive = true;
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
        pos.x += Math.cos(ang) * spellData.range;
        pos.y += Math.sin(ang) * spellData.range;
        this.createExplosion(pos, '#cc33ff', 25, 4, 8);
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
            e.isAggressive = true;
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

  private updateEnemies() {
    this.enemies.forEach(e => {
      // Only fully simulate enemies in range
      const inRange = this.isInSimRange(e.pos, 800);

      // Always tick down timers
      if (e.slowTimer > 0) e.slowTimer--;
      if (e.burnTimer > 0) { e.burnTimer--; if (inRange && e.burnTimer % 30 === 0) e.hp -= 10; }
      if (e.poisonTimer > 0) { e.poisonTimer--; if (inRange && e.poisonTimer % 40 === 0) e.hp -= 15; }

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
        // Wildlife simulation: predators hunt prey
        if (e.type === 'WOLF' && this.frameCount % 60 === 0) {
          const prey = this.enemies.find(other =>
            other.type === 'DEER' && this.distSq(e.pos, other.pos) < 500*500
          );
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

        // Deer flee from nearby threats
        if (e.type === 'DEER') {
          const threat = this.enemies.find(other =>
            (other.type === 'WOLF' || other.isAggressive) && this.distSq(e.pos, other.pos) < 400*400
          );
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

      // Pack behavior: Wolves and swarm move together
      if ((e.type === 'WOLF' || e.type === 'SWARM') && this.frameCount % 5 === 0) {
        let packCenterX = 0, packCenterY = 0, packCount = 0;
        this.enemies.forEach(other => {
          if (other.type === e.type && other.id !== e.id && this.distSq(e.pos, other.pos) < 300*300) {
            packCenterX += other.pos.x; packCenterY += other.pos.y; packCount++;
          }
        });
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

      // Alert propagation: Alerted enemies alert nearby passive ones
      if (e.isAggressive && this.frameCount % 30 === 0) {
        this.enemies.forEach(other => {
          if (!other.isAggressive && this.distSq(e.pos, other.pos) < 400*400) {
            other.isAggressive = true;
          }
        });
      }

      e.pos.x += (dx/d)*e.speed; e.pos.y += (dy/d)*e.speed;
    });

    this.enemies = this.enemies.filter(e => {
        if (e.hp <= 0) {
            this.score += 600; this.enemiesKilledThisWave++;
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
                  if (this.players[i].hp < 1) this.players[i].hp = 1;
                }
              });
              this.enemies.forEach(other => {
                if (other.id !== e.id && this.distSq(e.pos, other.pos) < 120*120) {
                  other.hp -= 40;
                }
              });
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
                  this.bullets.push({ id: this.nextId++, playerId: -2, pos: {...e.pos}, vel: {x: Math.cos(bAng)*13, y: Math.sin(bAng)*13}, damage: 30, element: ElementType.FIRE, radius: 14, life: 110, pierce: 1 });
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
    e.fireBreathCooldown--;
    if (e.fireBreathCooldown <= 0 && d < 800) {
      const ang = e.angle;
      for (let i = 0; i < 12; i++) {
        const spread = (Math.random() - 0.5) * 0.6;
        const dist = 120 + i * 50;
        const fPos = { x: e.pos.x + Math.cos(ang + spread) * dist, y: e.pos.y + Math.sin(ang + spread) * dist };
        this.fireAreas.push({ id: this.nextId++, pos: fPos, radius: 60, life: 180, maxLife: 180, damage: 35, color: '#ff4400' });
      }
      this.createExplosion(e.pos, '#ff6600', 25, 4, 8);
      e.fireBreathCooldown = 150;
    }
    e.cooldown--;
    if (e.cooldown <= 0) {
      for (let i = -5; i <= 5; i++) {
        const bAng = e.angle + i * 0.18;
        this.bullets.push({ id: this.nextId++, playerId: -2, pos: {...e.pos}, vel: {x: Math.cos(bAng)*15, y: Math.sin(bAng)*15}, damage: 50, element: ElementType.FIRE, radius: 18, life: 100, pierce: 1 });
      }
      e.cooldown = 90;
    }
  }

  private updateSpecialEnemy(e: Enemy) {
    const target = this.getNearestPlayer(e.pos);

    switch (e.type) {
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
              vel: { x: Math.cos(ang) * 8, y: Math.sin(ang) * 8 },
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
          this.enemies.forEach(other => {
            if (other.id !== e.id && this.distSq(e.pos, other.pos) < 180*180) {
              other.hp = Math.min(other.maxHp, other.hp + 8);
              this.createExplosion(other.pos, '#66ff99', 3, 1, 2);
            }
          });
        }
        break;
      }

      case 'SHIELDER': {
        this.enemies.forEach(other => {
          if (other.id !== e.id && this.distSq(e.pos, other.pos) < 150*150) {
            other.shieldActive = true;
          }
        });
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
    }
  }

  private updateAttacks() {
    this.bullets.forEach(b => {
      b.pos.x += b.vel.x; b.pos.y += b.vel.y; b.life--;
      this.enemies.forEach(e => {
        if (this.distSq(b.pos, e.pos) < (b.radius + e.radius)**2) {
          e.hp -= b.damage; e.isAggressive = true;
          this.addDamageNumber(e.pos, b.damage, false);
          b.life = 0;
        }
      });
    });
    this.bullets = this.bullets.filter(b => b.life > 0);
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
    let best = null, minDist = range*range;
    this.enemies.forEach(e => { const d = this.distSq(pos, e.pos); if (d < minDist) { minDist = d; best = e; } });
    return best;
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

  public buyItem(playerIdx: number, itemId: string, price: number) {
      if (this.money < price) return;
      const p = this.players[playerIdx], item = SHOP_ITEMS.find(i => i.id === itemId);
      if (!item) return;
      if (itemId === 'upgrade_town') { this.money -= price; this.town.level++; this.town.goldGeneration += 60; return; }
      if (itemId === 'build_wall') { this.money -= price; this.buildMode = 'WALL_STRAIGHT'; this.state = GameState.PLAYING; return; }
      if (itemId === 'build_corner') { this.money -= price; this.buildMode = 'WALL_CORNER'; this.state = GameState.PLAYING; return; }
      if (itemId === 'build_gate') { this.money -= price; this.buildMode = 'WALL_GATE'; this.state = GameState.PLAYING; return; }
      if (itemId === 'build_tower') { this.money -= price; this.buildMode = 'TOWER'; this.state = GameState.PLAYING; return; }
      const slotMap = { WEAPON: p.weaponSlots, ARMOR: p.armorSlots, MAGIC: p.magicSlots, UTILITY: null };
      const slots = slotMap[item.category as keyof typeof slotMap];
      if (slots && slots.length >= MAX_SLOTS) return;
      this.money -= price; if (slots) slots.push(itemId);
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
      score: this.score, money: this.money, state: this.state, wave: this.wave,
      camera: this.camera, world: this.world, town: this.town,
      buildMode: this.buildMode, buildRotation: this.buildRotation,
      events: this.events, announcements: this.announcements,
      campfires: this.campfires, towns: this.world.getTowns(),
      playerCityHealCooldowns: this.playerCityHealCooldowns
    };
  }
}
