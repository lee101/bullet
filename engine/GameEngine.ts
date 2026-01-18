
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
  WanderingTrader
} from '../types';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
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
  SPELL_DATA
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
  private town: TownState = { id: 0, name: "Ancient Hub", prosperity: 10, tradeCount: 0, level: 1, pos: { x: WORLD_WIDTH/2, y: WORLD_HEIGHT/2 }, goldGeneration: 50 };
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
    this.town = { id: 0, name: "Citadel Bazaar", prosperity: 10, tradeCount: 0, level: 1, pos: { x: WORLD_WIDTH/2, y: WORLD_HEIGHT/2 }, goldGeneration: 50 };
    this.score = 0;
    this.money = 0;
    this.frameCount = 0;
    this.wave = 1;
    this.enemiesSpawned = 0;
    this.enemiesKilledThisWave = 0;
    this.state = GameState.MENU;
    this.world = new WorldGenerator();
    this.camera = { x: WORLD_WIDTH / 2 - CANVAS_WIDTH / 2, y: WORLD_HEIGHT / 2 - CANVAS_HEIGHT / 2 };
  }

  public start(multiplayer: boolean) {
    const spawn = this.world.getSpawnablePosition();
    const colors = ['#4d99ff', '#ff4d99', '#4dff99', '#ffff4d'];
    const count = multiplayer ? 4 : 1;

    for(let i = 0; i < count; i++) {
        const p = JSON.parse(JSON.stringify(INITIAL_PLAYER_STATS));
        p.id = i;
        p.color = colors[i];
        this.players.push(p);
        this.playerPositions.push({ x: spawn.x + i * 40, y: spawn.y });
    }

    this.camera.x = spawn.x - CANVAS_WIDTH / 2;
    this.camera.y = spawn.y - CANVAS_HEIGHT / 2;
    this.spawnAmbientMounts();
    this.spawnTraders();
    this.spawnIdleEnemies();
    this.startWave(1);
    this.state = GameState.PLAYING;
  }

  private spawnAmbientMounts() {
    for (let i = 0; i < 40; i++) {
        const pos = this.world.getSpawnablePosition();
        const types: MountType[] = ['HORSE', 'CHARIOT', 'DRAGON'];
        const type = types[Math.floor(Math.pow(Math.random(), 2) * 3)];
        this.mounts.push({ 
          id: this.nextId++, 
          pos, 
          type, 
          life: Infinity, 
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
    const idleTypes: (keyof typeof ENEMY_TYPES)[] = ['SENTRY', 'PATROL', 'GUARD', 'WOLF'];
    for (let i = 0; i < 30; i++) {
      const pos = this.world.getSpawnablePosition();
      const t = idleTypes[Math.floor(Math.random() * idleTypes.length)];
      const config = ENEMY_TYPES[t];
      this.enemies.push({
        id: this.nextId++,
        pos: { ...pos },
        hp: config.hp,
        maxHp: config.hp,
        speed: config.speed,
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
        visionCone: config.visionCone,
        visionRange: config.visionRange,
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
    const config = ENEMY_TYPES.BOSS_DRAKE;
    this.enemies.push({
        id: this.nextId++, pos: spawnPos,
        hp: config.hp + (this.wave * 1000), maxHp: config.hp + (this.wave * 1000),
        speed: config.speed, radius: config.radius, damage: config.damage,
        type: 'BOSS_DRAKE', movement: 'BOSS_PATTERN', cooldown: 0, knockbackVel: { x: 0, y: 0 },
        slowTimer: 0, burnTimer: 0, poisonTimer: 0, isAggressive: true,
        angle: 0, visionCone: 0, visionRange: 0
    });
    this.enemiesSpawned++;
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
    
    const targetCamX = avgX - CANVAS_WIDTH / 2;
    const targetCamY = avgY - CANVAS_HEIGHT / 2;
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

      pos.x += move.x * finalSpeed;
      pos.y += move.y * finalSpeed;
      pos.x = Math.max(0, Math.min(WORLD_WIDTH, pos.x));
      pos.y = Math.max(0, Math.min(WORLD_HEIGHT, pos.y));

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
    this.updateEnemies();
    this.updateFireAreas();
    this.updateMounts();
    
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
  }

  private updateFireAreas() {
    this.fireAreas.forEach(fa => {
      fa.life--;
      // Only process damage for fire areas in range
      if (!this.isInSimRange(fa.pos, 300)) return;

      if (this.frameCount % 15 === 0) {
        this.enemies.forEach(e => {
          if (this.distSq(fa.pos, e.pos) < fa.radius**2) { e.hp -= fa.damage; e.burnTimer = 120; }
        });
        this.playerPositions.forEach((pp, i) => {
          if (this.distSq(fa.pos, pp) < fa.radius**2) this.players[i].hp -= fa.damage * 0.4;
        });
      }
    });
    this.fireAreas = this.fireAreas.filter(fa => fa.life > 0);
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
          // Slowly rotate to look around
          if (this.frameCount % 120 === 0) e.angle += (Math.random() - 0.5) * 0.8;
        } else {
          // Default wander
          const wanderAng = this.frameCount * 0.01 + e.id;
          e.pos.x += Math.cos(wanderAng) * 0.8;
          e.pos.y += Math.sin(wanderAng) * 0.8;
          e.angle = wanderAng;
        }
        return;
      }

      if (e.type === 'BOSS_DRAKE') { this.updateBossBehavior(e); return; }

      const target = this.getNearestPlayer(e.pos);
      if (!target) return;
      const dx = target.x - e.pos.x, dy = target.y - e.pos.y, d = Math.sqrt(dx*dx + dy*dy);
      e.angle = Math.atan2(dy, dx);
      e.pos.x += (dx/d)*e.speed; e.pos.y += (dy/d)*e.speed;
    });

    this.enemies = this.enemies.filter(e => {
        if (e.hp <= 0) {
            this.score += 600; this.enemiesKilledThisWave++;
            this.spawnCoin(e.pos);
            this.players.forEach(p => { p.xp += 70; if (p.xp >= 100) { p.xp = 0; p.level++; p.maxHp += 30; p.hp = p.maxHp; p.damage += 4; } });
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
    const types: (keyof typeof ENEMY_TYPES)[] = ['SWARM', 'SHOOTER', 'TANK', 'ELITE', 'STALKER', 'SERPENT', 'DEER'];
    const t = types[Math.floor(Math.random() * types.length)];
    const config = ENEMY_TYPES[t];
    this.enemies.push({
      id: this.nextId++,
      pos: { ...pos },
      hp: config.hp,
      maxHp: config.hp,
      speed: config.speed,
      radius: config.radius,
      damage: config.damage,
      type: t,
      movement: config.movement as any,
      cooldown: 0,
      knockbackVel: { x: 0, y: 0 },
      slowTimer: 0,
      burnTimer: 0,
      poisonTimer: 0,
      isAggressive: config.isAggressive,
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

  private addDamageNumber(pos: Vec2, val: number, isCrit: boolean) {
    this.damageNumbers.push({ id: this.nextId++, pos: {...pos}, value: Math.floor(val), color: isCrit ? '#ffcc00' : '#fff', life: 45, maxLife: 45, isCrit });
  }

  private getValidEnemySpawn(): Vec2 | null {
    const spawnPos = { x: this.camera.x + (Math.random()>0.5 ? -250 : CANVAS_WIDTH+250), y: this.camera.y + Math.random()*CANVAS_HEIGHT };
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
           pos.x <= this.camera.x + CANVAS_WIDTH + margin &&
           pos.y >= this.camera.y - margin &&
           pos.y <= this.camera.y + CANVAS_HEIGHT + margin;
  }

  public buyItem(playerIdx: number, itemId: string, price: number) {
      if (this.money < price) return;
      const p = this.players[playerIdx], item = SHOP_ITEMS.find(i => i.id === itemId);
      if (!item) return;
      if (itemId === 'upgrade_town') { this.money -= price; this.town.level++; this.town.goldGeneration += 60; return; }
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

  public getDrawState() {
    return {
      players: this.players, playerPositions: this.playerPositions,
      bullets: this.bullets, enemies: this.enemies, particles: this.particles,
      damageNumbers: this.damageNumbers, coins: this.coins, mounts: this.mounts,
      traders: this.traders,
      fireAreas: this.fireAreas,
      score: this.score, money: this.money, state: this.state, wave: this.wave,
      camera: this.camera, world: this.world, town: this.town
    };
  }
}
