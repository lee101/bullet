
import { Vec2, MagicElement, MagicStack, MagicWheelState, CastMode, MagicCombo, MagicProjectile, ElementType, SpellModifier } from '../types';

// 8 segments: 0=top(BLACK), clockwise: 1=TR(LIGHTNING), 2=R(FIRE), 3=BR(LUMIN), 4=B(CURE), 5=BL(BLOOD), 6=L(ICE), 7=TL(EARTH)
const SEGMENT_ELEMENTS: MagicElement[] = [
  MagicElement.BLACK,     // 0 - top
  MagicElement.LIGHTNING, // 1 - top-right
  MagicElement.FIRE,      // 2 - right
  MagicElement.LUMIN,     // 3 - bottom-right
  MagicElement.CURE,      // 4 - bottom
  MagicElement.BLOOD,     // 5 - bottom-left
  MagicElement.ICE,       // 6 - left
  MagicElement.EARTH      // 7 - top-left
];

export const ELEMENT_COLORS: Record<MagicElement, string> = {
  [MagicElement.BLACK]: '#1a0a2e',
  [MagicElement.CURE]: '#40ff90',
  [MagicElement.FIRE]: '#ff4422',
  [MagicElement.ICE]: '#44ccff',
  [MagicElement.LIGHTNING]: '#ffff44',
  [MagicElement.EARTH]: '#8b6914',
  [MagicElement.BLOOD]: '#990033',
  [MagicElement.LUMIN]: '#ffffcc'
};

export const ELEMENT_ICONS: Record<MagicElement, string> = {
  [MagicElement.BLACK]: 'V',
  [MagicElement.CURE]: '+',
  [MagicElement.FIRE]: 'F',
  [MagicElement.ICE]: 'I',
  [MagicElement.LIGHTNING]: 'Z',
  [MagicElement.EARTH]: 'E',
  [MagicElement.BLOOD]: 'B',
  [MagicElement.LUMIN]: 'L'
};

// Combo definitions - specific element combinations create special effects
const MAGIC_COMBOS: MagicCombo[] = [
  // Pure element combos (3+ same)
  { elements: [MagicElement.FIRE, MagicElement.FIRE, MagicElement.FIRE], name: 'INFERNO', effect: 'massive_fire_burst', baseDamage: 300, manaCost: 45, element: ElementType.FIRE },
  { elements: [MagicElement.ICE, MagicElement.ICE, MagicElement.ICE], name: 'ABSOLUTE ZERO', effect: 'freeze_aoe', baseDamage: 150, manaCost: 40, element: ElementType.ICE },
  { elements: [MagicElement.LIGHTNING, MagicElement.LIGHTNING, MagicElement.LIGHTNING], name: 'THUNDERSTORM', effect: 'chain_lightning', baseDamage: 250, manaCost: 50, element: ElementType.LIGHTNING },
  { elements: [MagicElement.EARTH, MagicElement.EARTH, MagicElement.EARTH], name: 'EARTHQUAKE', effect: 'ground_shatter', baseDamage: 200, manaCost: 35, element: ElementType.PHYSICAL },
  { elements: [MagicElement.CURE, MagicElement.CURE, MagicElement.CURE], name: 'DIVINE HEAL', effect: 'full_heal', baseDamage: -200, manaCost: 60, element: ElementType.MAGIC },
  { elements: [MagicElement.BLACK, MagicElement.BLACK, MagicElement.BLACK], name: 'VOID RIFT', effect: 'void_damage', baseDamage: 400, manaCost: 70, element: ElementType.MAGIC },
  { elements: [MagicElement.BLOOD, MagicElement.BLOOD, MagicElement.BLOOD], name: 'BLOOD NOVA', effect: 'life_drain_aoe', baseDamage: 180, manaCost: 55, element: ElementType.POISON },
  { elements: [MagicElement.LUMIN, MagicElement.LUMIN, MagicElement.LUMIN], name: 'HOLY BURST', effect: 'light_explosion', baseDamage: 280, manaCost: 45, element: ElementType.MAGIC },

  // Opposite combos (powerful)
  { elements: [MagicElement.FIRE, MagicElement.ICE], name: 'STEAM BLAST', effect: 'steam_cloud', baseDamage: 120, manaCost: 25, element: ElementType.MAGIC },
  { elements: [MagicElement.BLACK, MagicElement.LUMIN], name: 'CHAOS', effect: 'random_damage', baseDamage: 350, manaCost: 65, element: ElementType.MAGIC },
  { elements: [MagicElement.CURE, MagicElement.BLOOD], name: 'TRANSFUSION', effect: 'drain_heal', baseDamage: 100, manaCost: 30, element: ElementType.POISON },
  { elements: [MagicElement.LIGHTNING, MagicElement.EARTH], name: 'SHOCKWAVE', effect: 'stun_wave', baseDamage: 180, manaCost: 40, element: ElementType.LIGHTNING },

  // Elemental fusions
  { elements: [MagicElement.FIRE, MagicElement.LIGHTNING], name: 'PLASMA', effect: 'plasma_beam', baseDamage: 220, manaCost: 35, element: ElementType.FIRE },
  { elements: [MagicElement.ICE, MagicElement.EARTH], name: 'PERMAFROST', effect: 'ice_wall', baseDamage: 80, manaCost: 30, element: ElementType.ICE },
  { elements: [MagicElement.FIRE, MagicElement.EARTH], name: 'MAGMA', effect: 'lava_pool', baseDamage: 160, manaCost: 40, element: ElementType.FIRE },
  { elements: [MagicElement.ICE, MagicElement.LIGHTNING], name: 'CRYO SHOCK', effect: 'freeze_chain', baseDamage: 190, manaCost: 45, element: ElementType.ICE },
  { elements: [MagicElement.BLOOD, MagicElement.FIRE], name: 'BLOOD FIRE', effect: 'burning_drain', baseDamage: 200, manaCost: 50, element: ElementType.FIRE },
  { elements: [MagicElement.LUMIN, MagicElement.CURE], name: 'SANCTUARY', effect: 'heal_shield', baseDamage: -150, manaCost: 55, element: ElementType.MAGIC },
  { elements: [MagicElement.BLACK, MagicElement.BLOOD], name: 'DEATH PACT', effect: 'sacrifice_power', baseDamage: 500, manaCost: 80, element: ElementType.POISON },
  { elements: [MagicElement.LUMIN, MagicElement.LIGHTNING], name: 'SMITE', effect: 'holy_bolt', baseDamage: 300, manaCost: 50, element: ElementType.LIGHTNING },

  // 4-5 element super combos
  { elements: [MagicElement.FIRE, MagicElement.ICE, MagicElement.LIGHTNING, MagicElement.EARTH], name: 'ELEMENTAL STORM', effect: 'all_elements', baseDamage: 600, manaCost: 100, element: ElementType.MAGIC },
  { elements: [MagicElement.BLACK, MagicElement.LUMIN, MagicElement.BLOOD, MagicElement.CURE], name: 'CHAOS HARMONY', effect: 'reality_warp', baseDamage: 800, manaCost: 150, element: ElementType.MAGIC },
];

export class MagicWheel {
  private state: MagicWheelState;
  private projectiles: MagicProjectile[] = [];
  private nextProjectileId = 0;

  constructor() {
    this.state = this.createDefaultState();
  }

  private createDefaultState(): MagicWheelState {
    return {
      isOpen: false,
      selectedSegment: -1,
      stack: { elements: [], maxSize: 5 },
      castMode: 'ATTACK',
      aimAngle: 0,
      chargeTime: 0,
      modifier: 'NONE',
      chargeLevel: 0
    };
  }

  public getState(): MagicWheelState {
    return this.state;
  }

  public getProjectiles(): MagicProjectile[] {
    return this.projectiles;
  }

  public openWheel(): void {
    this.state.isOpen = true;
  }

  public closeWheel(): void {
    this.state.isOpen = false;
    this.state.selectedSegment = -1;
  }

  public toggleWheel(): void {
    if (this.state.isOpen) this.closeWheel();
    else this.openWheel();
  }

  public updateAim(aimX: number, aimY: number): void {
    if (Math.abs(aimX) < 0.2 && Math.abs(aimY) < 0.2) {
      this.state.selectedSegment = -1;
      return;
    }

    this.state.aimAngle = Math.atan2(aimY, aimX);
    // Convert angle to segment (0=top, clockwise)
    let angle = this.state.aimAngle + Math.PI / 2; // Rotate so top is 0
    if (angle < 0) angle += Math.PI * 2;
    const segment = Math.floor((angle / (Math.PI * 2)) * 8) % 8;
    this.state.selectedSegment = segment;
  }

  public selectElement(): boolean {
    if (this.state.selectedSegment < 0) return false;
    if (this.state.stack.elements.length >= this.state.stack.maxSize) return false;

    const element = SEGMENT_ELEMENTS[this.state.selectedSegment];
    this.state.stack.elements.push(element);
    return true;
  }

  public clearStack(): void {
    this.state.stack.elements = [];
  }

  public popElement(): MagicElement | undefined {
    return this.state.stack.elements.pop();
  }

  public setCastMode(mode: CastMode): void {
    this.state.castMode = mode;
  }

  public cycleCastMode(): void {
    const modes: CastMode[] = ['ATTACK', 'SELF', 'WALL', 'TOWER', 'AREA'];
    const idx = modes.indexOf(this.state.castMode);
    this.state.castMode = modes[(idx + 1) % modes.length];
  }

  public cycleModifier(): void {
    const mods: SpellModifier[] = ['NONE', 'CHARGED', 'RAPID', 'SPLIT', 'HOMING'];
    const idx = mods.indexOf(this.state.modifier);
    this.state.modifier = mods[(idx + 1) % mods.length];
    this.state.chargeLevel = 0;
  }

  public setModifier(mod: SpellModifier): void {
    this.state.modifier = mod;
    this.state.chargeLevel = 0;
  }

  public updateCharge(dt: number): void {
    if (this.state.modifier === 'CHARGED' && this.state.chargeLevel < 100) {
      this.state.chargeLevel = Math.min(100, this.state.chargeLevel + dt * 2);
    }
  }

  public getModifierMultiplier(): number {
    switch (this.state.modifier) {
      case 'CHARGED': return 1 + (this.state.chargeLevel / 100);
      case 'RAPID': return 0.6;
      case 'SPLIT': return 0.7;
      case 'HOMING': return 0.85;
      default: return 1;
    }
  }

  public getModifierManaCost(): number {
    const base = this.calculateManaCost();
    switch (this.state.modifier) {
      case 'CHARGED': return base * 1.5;
      case 'RAPID': return base * 0.4;
      case 'SPLIT': return base * 1.3;
      case 'HOMING': return base * 1.2;
      default: return base;
    }
  }

  public findCombo(elements: MagicElement[]): MagicCombo | null {
    if (elements.length === 0) return null;

    const sorted = [...elements].sort();

    for (const combo of MAGIC_COMBOS) {
      const comboSorted = [...combo.elements].sort();
      if (this.arraysMatch(sorted, comboSorted)) {
        return combo;
      }
    }

    // Check for partial matches (contains all combo elements)
    for (const combo of MAGIC_COMBOS) {
      if (this.containsAll(elements, combo.elements)) {
        return combo;
      }
    }

    return null;
  }

  private arraysMatch(a: MagicElement[], b: MagicElement[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }

  private containsAll(stack: MagicElement[], required: MagicElement[]): boolean {
    const stackCopy = [...stack];
    for (const req of required) {
      const idx = stackCopy.indexOf(req);
      if (idx === -1) return false;
      stackCopy.splice(idx, 1);
    }
    return true;
  }

  public calculateDamage(): number {
    const elements = this.state.stack.elements;
    if (elements.length === 0) return 0;

    const combo = this.findCombo(elements);
    if (combo) return combo.baseDamage;

    // Base damage scales with stack size
    let baseDmg = 20 * elements.length;

    // Pure stacks get bonus
    const unique = new Set(elements);
    if (unique.size === 1) baseDmg *= 1.5;

    return baseDmg;
  }

  public calculateManaCost(): number {
    const elements = this.state.stack.elements;
    if (elements.length === 0) return 0;

    const combo = this.findCombo(elements);
    if (combo) return combo.manaCost;

    return 10 * elements.length;
  }

  public cast(playerId: number, pos: Vec2, aimAngle: number): MagicProjectile[] {
    if (this.state.stack.elements.length === 0) return [];

    const elements = [...this.state.stack.elements];
    const baseDamage = this.calculateDamage();
    const combo = this.findCombo(elements);
    const modifier = this.state.modifier;
    const mult = this.getModifierMultiplier();

    const damage = Math.floor(baseDamage * mult);
    const speed = 8 + elements.length * 2;
    const projectiles: MagicProjectile[] = [];

    const createProjectile = (angle: number, speedMult: number = 1, splitCount: number = 0): MagicProjectile => ({
      id: this.nextProjectileId++,
      pos: { x: pos.x, y: pos.y },
      vel: { x: Math.cos(angle) * speed * speedMult, y: Math.sin(angle) * speed * speedMult },
      elements: [...elements],
      damage,
      radius: 12 + elements.length * 4,
      life: 120 + elements.length * 30,
      maxLife: 120 + elements.length * 30,
      playerId,
      pierce: combo ? 2 : 0,
      aoe: elements.length >= 3,
      aoeRadius: 50 + elements.length * 20,
      modifier,
      splitCount,
      homing: modifier === 'HOMING',
      homingTarget: undefined
    });

    if (modifier === 'SPLIT') {
      // Fire 3 projectiles in a spread
      projectiles.push(createProjectile(aimAngle - 0.3, 1, 2));
      projectiles.push(createProjectile(aimAngle, 1, 2));
      projectiles.push(createProjectile(aimAngle + 0.3, 1, 2));
    } else if (modifier === 'RAPID') {
      // Single fast projectile (rapid fire handled by reduced cooldown externally)
      projectiles.push(createProjectile(aimAngle, 1.5, 0));
    } else if (modifier === 'CHARGED') {
      // Big slow projectile with bonus damage already applied
      const p = createProjectile(aimAngle, 0.7, 0);
      p.radius *= 1.5;
      p.aoe = true;
      p.aoeRadius *= 1.5;
      projectiles.push(p);
    } else {
      projectiles.push(createProjectile(aimAngle, 1, 0));
    }

    projectiles.forEach(p => this.projectiles.push(p));
    this.clearStack();
    this.state.chargeLevel = 0;

    return projectiles;
  }

  public castRapidBurst(playerId: number, pos: Vec2, aimAngle: number): MagicProjectile | null {
    // For rapid fire mode - cast single smaller projectile without clearing stack
    if (this.state.stack.elements.length === 0) return null;

    const elements = [...this.state.stack.elements];
    const damage = Math.floor(this.calculateDamage() * 0.4);
    const speed = 12;

    const proj: MagicProjectile = {
      id: this.nextProjectileId++,
      pos: { x: pos.x, y: pos.y },
      vel: { x: Math.cos(aimAngle) * speed, y: Math.sin(aimAngle) * speed },
      elements,
      damage,
      radius: 8,
      life: 60,
      maxLife: 60,
      playerId,
      pierce: 0,
      aoe: false,
      aoeRadius: 0,
      modifier: 'RAPID',
      splitCount: 0,
      homing: false,
      homingTarget: undefined
    };

    this.projectiles.push(proj);
    return proj;
  }

  public castSelf(playerId: number, pos: Vec2): { heal: number; shield: boolean; boost: string | null } {
    const elements = [...this.state.stack.elements];
    const result = { heal: 0, shield: false, boost: null as string | null };

    for (const el of elements) {
      if (el === MagicElement.CURE) result.heal += 30;
      if (el === MagicElement.EARTH) result.shield = true;
      if (el === MagicElement.LUMIN) result.heal += 15;
      if (el === MagicElement.FIRE) result.boost = 'damage';
      if (el === MagicElement.ICE) result.boost = 'slow_immune';
      if (el === MagicElement.LIGHTNING) result.boost = 'speed';
    }

    this.clearStack();
    return result;
  }

  public castWall(pos: Vec2, angle: number): { pos: Vec2; angle: number; elements: MagicElement[]; hp: number } | null {
    if (this.state.stack.elements.length < 2) return null;

    const elements = [...this.state.stack.elements];
    const hp = 100 * elements.length;

    const wallPos = {
      x: pos.x + Math.cos(angle) * 60,
      y: pos.y + Math.sin(angle) * 60
    };

    this.clearStack();
    return { pos: wallPos, angle, elements, hp };
  }

  public castTower(pos: Vec2): { pos: Vec2; elements: MagicElement[]; damage: number; range: number } | null {
    if (this.state.stack.elements.length < 3) return null;

    const elements = [...this.state.stack.elements];
    const damage = 15 * elements.length;
    const range = 150 + elements.length * 30;

    this.clearStack();
    return { pos: { ...pos }, elements, damage, range };
  }

  public castArea(pos: Vec2, aimAngle: number): { pos: Vec2; elements: MagicElement[]; radius: number; damage: number; duration: number } | null {
    if (this.state.stack.elements.length === 0) return null;

    const elements = [...this.state.stack.elements];
    const targetPos = {
      x: pos.x + Math.cos(aimAngle) * 200,
      y: pos.y + Math.sin(aimAngle) * 200
    };

    this.clearStack();
    return {
      pos: targetPos,
      elements,
      radius: 60 + elements.length * 25,
      damage: 10 * elements.length,
      duration: 180 + elements.length * 60
    };
  }

  public updateProjectiles(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.pos.x += p.vel.x;
      p.pos.y += p.vel.y;
      p.life--;

      if (p.life <= 0) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  public removeProjectile(id: number): void {
    const idx = this.projectiles.findIndex(p => p.id === id);
    if (idx !== -1) this.projectiles.splice(idx, 1);
  }

  public getElementForSegment(segment: number): MagicElement {
    return SEGMENT_ELEMENTS[segment];
  }

  public getSegmentCount(): number {
    return 8;
  }

  public getStackDisplay(): string {
    return this.state.stack.elements.map(e => ELEMENT_ICONS[e]).join('');
  }

  public getComboName(): string | null {
    const combo = this.findCombo(this.state.stack.elements);
    return combo?.name || null;
  }

  public getPrimaryElement(): ElementType {
    const elements = this.state.stack.elements;
    if (elements.length === 0) return ElementType.MAGIC;

    const combo = this.findCombo(elements);
    if (combo) return combo.element;

    // Map first element to ElementType
    const first = elements[0];
    const mapping: Record<MagicElement, ElementType> = {
      [MagicElement.FIRE]: ElementType.FIRE,
      [MagicElement.ICE]: ElementType.ICE,
      [MagicElement.LIGHTNING]: ElementType.LIGHTNING,
      [MagicElement.EARTH]: ElementType.PHYSICAL,
      [MagicElement.CURE]: ElementType.MAGIC,
      [MagicElement.BLACK]: ElementType.MAGIC,
      [MagicElement.BLOOD]: ElementType.POISON,
      [MagicElement.LUMIN]: ElementType.MAGIC
    };

    return mapping[first];
  }
}

export { SEGMENT_ELEMENTS, MAGIC_COMBOS };
