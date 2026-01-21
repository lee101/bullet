import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { createCanvas, CanvasRenderingContext2D } from 'canvas';

const OUTPUT_DIR = 'public/assets/generated';
const TILED_DIR = 'public/assets/tiled';

// Color palettes for different themes
const PALETTES = {
  grass: ['#4a7c20', '#5d9e24', '#6fb62a', '#3d6619'],
  forest: ['#1a3d1a', '#2d5a2d', '#1e4d1e', '#0f2e0f'],
  mountain: ['#6b6b6b', '#8a8a8a', '#5c5c5c', '#4d4d4d'],
  snow: ['#e8f4f8', '#ffffff', '#d4eaf0', '#c0dce4'],
  shore: ['#d4b896', '#c4a882', '#b89c74', '#e0c4a0'],
  river: ['#4fa4d0', '#5eb8e8', '#3d8ab8', '#6bc4f0'],
  sea: ['#1a5276', '#2874a6', '#1b4f72', '#154360'],
  swamp: ['#3d5c3d', '#4a6b3d', '#2d4a2d', '#5a6b4a'],
  lowland: ['#8b7355', '#9c8465', '#7a6245', '#6b5335'],
  town: ['#6b6b6b', '#7a7a7a', '#5c5c5c', '#8a8a8a'],
  fire: ['#ff4500', '#ff6b35', '#ff8c00', '#ffa500'],
  ice: ['#87ceeb', '#add8e6', '#b0e0e6', '#e0ffff'],
  lightning: ['#ffff00', '#fff44f', '#ffd700', '#ffffff'],
  magic: ['#9370db', '#ba55d3', '#da70d6', '#ee82ee'],
  poison: ['#32cd32', '#228b22', '#90ee90', '#adff2f'],
  heal: ['#98fb98', '#00ff7f', '#7fff00', '#ffffff'],
};

const CHARACTER_COLORS: Record<string, { primary: string; secondary: string; accent: string }> = {
  samurai: { primary: '#8b0000', secondary: '#2f2f2f', accent: '#ffd700' },
  witch: { primary: '#6a0dad', secondary: '#1a1a2e', accent: '#c0c0c0' },
  ninja: { primary: '#1a1a1a', secondary: '#2d2d2d', accent: '#ff4444' },
  paladin: { primary: '#ffd700', secondary: '#ffffff', accent: '#87ceeb' },
  necromancer: { primary: '#2d0a31', secondary: '#1a0a1f', accent: '#8b00ff' },
  bard: { primary: '#ff6b6b', secondary: '#4ecdc4', accent: '#ffe66d' },
  druid: { primary: '#228b22', secondary: '#8b4513', accent: '#98fb98' },
  fire_samurai: { primary: '#ff4500', secondary: '#8b0000', accent: '#ffd700' },
  ice_witch: { primary: '#87ceeb', secondary: '#4169e1', accent: '#ffffff' },
  storm_ninja: { primary: '#4169e1', secondary: '#1a1a2e', accent: '#ffff00' },
  shadow_paladin: { primary: '#2f2f2f', secondary: '#1a1a1a', accent: '#8b00ff' },
  earth_druid: { primary: '#8b4513', secondary: '#228b22', accent: '#daa520' },
  light_bard: { primary: '#ffd700', secondary: '#ffffff', accent: '#ffb6c1' },
  water_necro: { primary: '#1e90ff', secondary: '#000080', accent: '#00ffff' },
  wind_ninja: { primary: '#87ceeb', secondary: '#708090', accent: '#ffffff' },
  dragon_knight: { primary: '#8b0000', secondary: '#2f2f2f', accent: '#ff4500' },
  vampire: { primary: '#4a0000', secondary: '#1a1a1a', accent: '#ff0000' },
  werewolf: { primary: '#8b4513', secondary: '#4a3728', accent: '#ffcc00' },
  slime: { primary: '#32cd32', secondary: '#228b22', accent: '#adff2f' },
  angel: { primary: '#ffffff', secondary: '#ffd700', accent: '#87ceeb' },
  demon: { primary: '#8b0000', secondary: '#2d0a0a', accent: '#ff4500' },
  skeleton: { primary: '#d4d4d4', secondary: '#a0a0a0', accent: '#ffffff' },
  ghost_player: { primary: '#87ceeb', secondary: '#b0e0e6', accent: '#ffffff' },
  minotaur: { primary: '#8b4513', secondary: '#5c3317', accent: '#ffd700' },
  harpy_player: { primary: '#dda0dd', secondary: '#9370db', accent: '#ffd700' },
  golem: { primary: '#696969', secondary: '#4a4a4a', accent: '#ffa500' },
  lich: { primary: '#2d0a31', secondary: '#0f0f0f', accent: '#00ff00' },
  dark_paladin: { primary: '#1a1a2e', secondary: '#0f0f1a', accent: '#8b00ff' },
  blood_necro: { primary: '#8b0000', secondary: '#2d0a0a', accent: '#ff0000' },
  war_bard: { primary: '#dc143c', secondary: '#8b0000', accent: '#ffd700' },
  shadow_ninja: { primary: '#0f0f0f', secondary: '#1a1a1a', accent: '#8b00ff' },
  holy_druid: { primary: '#ffd700', secondary: '#228b22', accent: '#ffffff' },
  plague_witch: { primary: '#32cd32', secondary: '#228b22', accent: '#9acd32' },
  arcane_samurai: { primary: '#9370db', secondary: '#4b0082', accent: '#e6e6fa' },
  wild_druid: { primary: '#228b22', secondary: '#8b4513', accent: '#ff6347' },
  stone_paladin: { primary: '#696969', secondary: '#4a4a4a', accent: '#ffd700' },
  blade_dancer: { primary: '#c0c0c0', secondary: '#ff69b4', accent: '#ffd700' },
  chef: { primary: '#ffffff', secondary: '#ff6347', accent: '#ffd700' },
  mime: { primary: '#ffffff', secondary: '#000000', accent: '#ff0000' },
  merchant: { primary: '#daa520', secondary: '#8b4513', accent: '#ffd700' },
  scarecrow: { primary: '#8b4513', secondary: '#daa520', accent: '#ff6347' },
  chicken: { primary: '#ffd700', secondary: '#ff6347', accent: '#ffffff' },
  phoenix: { primary: '#ff4500', secondary: '#ffd700', accent: '#ffffff' },
  titan: { primary: '#4a4a4a', secondary: '#696969', accent: '#00ffff' },
  void_walker: { primary: '#1a0a2e', secondary: '#0f0f1a', accent: '#ffffff' },
  time_keeper: { primary: '#ffd700', secondary: '#4169e1', accent: '#ffffff' },
  world_eater: { primary: '#0f0f0f', secondary: '#1a0a2e', accent: '#ff0000' },
};

function noise(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

function drawTerrain(ctx: CanvasRenderingContext2D, size: number, palette: string[]) {
  for (let y = 0; y < size; y += 4) {
    for (let x = 0; x < size; x += 4) {
      const n = noise(x * 0.1, y * 0.1, 0);
      ctx.fillStyle = palette[Math.floor(n * palette.length)];
      ctx.fillRect(x, y, 4, 4);
    }
  }
  // Add some texture variation
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
    ctx.beginPath();
    ctx.arc(x, y, 2 + Math.random() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawDecor(ctx: CanvasRenderingContext2D, size: number, type: string) {
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;

  if (type.includes('tree')) {
    // Draw tree canopy
    const color = type.includes('pine') ? '#1a5c1a' :
                  type.includes('dead') ? '#5c4033' :
                  type.includes('palm') ? '#228b22' :
                  type.includes('frozen') ? '#87ceeb' : '#2d7d2d';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // Add shadow/depth
    ctx.fillStyle = type.includes('frozen') ? '#5fb5d5' : '#1a4d1a';
    ctx.beginPath();
    ctx.arc(cx + 4, cy + 4, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
  } else if (type.includes('rock')) {
    ctx.fillStyle = '#5c5c5c';
    ctx.beginPath();
    ctx.ellipse(cx, cy, size * 0.4, size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a7a7a';
    ctx.beginPath();
    ctx.ellipse(cx - 2, cy - 2, size * 0.3, size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (type.includes('bush')) {
    ctx.fillStyle = '#228b22';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(cx + (Math.random() - 0.5) * size * 0.4,
              cy + (Math.random() - 0.5) * size * 0.4,
              size * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type.includes('flower')) {
    const colors = ['#ff69b4', '#ffff00', '#ff6347', '#9370db'];
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc(cx + (Math.random() - 0.5) * size * 0.6,
              cy + (Math.random() - 0.5) * size * 0.6,
              3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type.includes('mushroom')) {
    ctx.fillStyle = '#ff4500';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.25, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 4, cy - 4, 3, 0, Math.PI * 2);
    ctx.arc(cx + 4, cy - 2, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (type.includes('ruins')) {
    ctx.fillStyle = '#6b6b6b';
    ctx.fillRect(cx - 20, cy - 15, 15, 30);
    ctx.fillRect(cx + 5, cy - 10, 15, 25);
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(cx - 5, cy, 10, 15);
  } else if (type.includes('bones')) {
    ctx.fillStyle = '#e0e0e0';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 8, 6, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 15, cy + 5, 30, 3);
    ctx.fillRect(cx - 10, cy - 8, 3, 15);
  } else if (type.includes('campfire')) {
    ctx.fillStyle = '#8b4513';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff4500';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 15);
    ctx.lineTo(cx - 8, cy + 5);
    ctx.lineTo(cx + 8, cy + 5);
    ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx - 4, cy + 2);
    ctx.lineTo(cx + 4, cy + 2);
    ctx.fill();
  } else if (type.includes('tent')) {
    ctx.fillStyle = '#8b7355';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 25);
    ctx.lineTo(cx - 30, cy + 20);
    ctx.lineTo(cx + 30, cy + 20);
    ctx.fill();
    ctx.fillStyle = '#5c4033';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - 10, cy + 20);
    ctx.lineTo(cx + 10, cy + 20);
    ctx.fill();
  } else if (type.includes('waterlily')) {
    ctx.fillStyle = '#228b22';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff69b4';
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (type.includes('reeds')) {
    ctx.fillStyle = '#556b2f';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(cx - 12 + i * 6, cy - 20 + Math.random() * 10, 2, 35);
    }
  }
}

function drawCity(ctx: CanvasRenderingContext2D, size: number, style: string) {
  const colors: Record<string, { main: string; roof: string; accent: string }> = {
    medieval: { main: '#8b8b8b', roof: '#4a3728', accent: '#2f4f4f' },
    desert: { main: '#daa520', roof: '#8b7355', accent: '#cd853f' },
    asian: { main: '#8b0000', roof: '#2f2f2f', accent: '#ffd700' },
    nordic: { main: '#5c4033', roof: '#2f2f2f', accent: '#87ceeb' },
    elven: { main: '#228b22', roof: '#006400', accent: '#ffd700' },
    dwarven: { main: '#4a4a4a', roof: '#8b4513', accent: '#ff4500' },
  };
  const c = colors[style] || colors.medieval;

  // Base
  ctx.fillStyle = c.main;
  ctx.fillRect(size * 0.2, size * 0.2, size * 0.6, size * 0.6);

  // Towers
  ctx.fillStyle = c.roof;
  ctx.beginPath();
  ctx.arc(size * 0.25, size * 0.25, size * 0.12, 0, Math.PI * 2);
  ctx.arc(size * 0.75, size * 0.25, size * 0.12, 0, Math.PI * 2);
  ctx.arc(size * 0.25, size * 0.75, size * 0.12, 0, Math.PI * 2);
  ctx.arc(size * 0.75, size * 0.75, size * 0.12, 0, Math.PI * 2);
  ctx.fill();

  // Central keep
  ctx.fillStyle = c.accent;
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.5, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.main;
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.5, size * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

function drawCharacterPortrait(ctx: CanvasRenderingContext2D, size: number, colors: { primary: string; secondary: string; accent: string }) {
  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, colors.secondary);
  grad.addColorStop(1, colors.primary);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Character silhouette
  const cx = size / 2, cy = size * 0.45;

  // Head
  ctx.fillStyle = '#ffd5b4';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.18, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = colors.primary;
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.05, size * 0.2, Math.PI, 0);
  ctx.fill();

  // Body/shoulders
  ctx.fillStyle = colors.primary;
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.35, size * 0.3, size * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();

  // Accent details
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.25, size * 0.08, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(cx - size * 0.06, cy, 4, 0, Math.PI * 2);
  ctx.arc(cx + size * 0.06, cy, 4, 0, Math.PI * 2);
  ctx.fill();

  // Eye shine
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx - size * 0.06 + 1, cy - 1, 2, 0, Math.PI * 2);
  ctx.arc(cx + size * 0.06 + 1, cy - 1, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawCharacterSprite(ctx: CanvasRenderingContext2D, size: number, colors: { primary: string; secondary: string; accent: string }) {
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size * 0.5;

  // Body
  ctx.fillStyle = colors.primary;
  ctx.beginPath();
  ctx.ellipse(cx, cy + size * 0.15, size * 0.2, size * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#ffd5b4';
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.15, size * 0.15, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = colors.secondary;
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.2, size * 0.12, Math.PI, 0);
  ctx.fill();

  // Eyes (chibi style)
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(cx - size * 0.05, cy - size * 0.15, 3, 0, Math.PI * 2);
  ctx.arc(cx + size * 0.05, cy - size * 0.15, 3, 0, Math.PI * 2);
  ctx.fill();

  // Accent
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.05, size * 0.05, 0, Math.PI * 2);
  ctx.fill();
}

function drawCharacterIcon(ctx: CanvasRenderingContext2D, size: number, colors: { primary: string; secondary: string; accent: string }) {
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;

  // Background circle
  ctx.fillStyle = colors.primary;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.45, 0, Math.PI * 2);
  ctx.fill();

  // Face
  ctx.fillStyle = '#ffd5b4';
  ctx.beginPath();
  ctx.arc(cx, cy + 2, size * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Hair
  ctx.fillStyle = colors.secondary;
  ctx.beginPath();
  ctx.arc(cx, cy - 4, size * 0.25, Math.PI, 0);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(cx - 6, cy + 2, 2, 0, Math.PI * 2);
  ctx.arc(cx + 6, cy + 2, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawEffect(ctx: CanvasRenderingContext2D, size: number, type: string) {
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;

  if (type.includes('fire') || type.includes('ember')) {
    const palette = PALETTES.fire;
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
      ctx.globalAlpha = 0.7 + Math.random() * 0.3;
      ctx.beginPath();
      const x = cx + (Math.random() - 0.5) * size * 0.6;
      const y = cy + (Math.random() - 0.5) * size * 0.6;
      ctx.moveTo(x, y - 10 - Math.random() * 20);
      ctx.lineTo(x - 5, y + 5);
      ctx.lineTo(x + 5, y + 5);
      ctx.fill();
    }
  } else if (type.includes('ice') || type.includes('frost')) {
    const palette = PALETTES.ice;
    for (let i = 0; i < 15; i++) {
      ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
      ctx.globalAlpha = 0.6 + Math.random() * 0.4;
      ctx.beginPath();
      const x = cx + (Math.random() - 0.5) * size * 0.8;
      const y = cy + (Math.random() - 0.5) * size * 0.8;
      // Crystal shape
      ctx.moveTo(x, y - 15);
      ctx.lineTo(x - 5, y);
      ctx.lineTo(x, y + 15);
      ctx.lineTo(x + 5, y);
      ctx.fill();
    }
  } else if (type.includes('lightning') || type.includes('spark') || type.includes('electric')) {
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      let x = size * 0.2 + Math.random() * size * 0.6;
      let y = 0;
      ctx.moveTo(x, y);
      while (y < size) {
        y += 10 + Math.random() * 20;
        x += (Math.random() - 0.5) * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (type.includes('magic') || type.includes('nova') || type.includes('orb')) {
    const palette = PALETTES.magic;
    ctx.globalAlpha = 0.8;
    for (let r = size * 0.4; r > 0; r -= 10) {
      ctx.fillStyle = palette[Math.floor((r / (size * 0.4)) * palette.length)];
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type.includes('poison')) {
    const palette = PALETTES.poison;
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
      ctx.globalAlpha = 0.3 + Math.random() * 0.4;
      ctx.beginPath();
      ctx.arc(cx + (Math.random() - 0.5) * size * 0.8,
              cy + (Math.random() - 0.5) * size * 0.8,
              5 + Math.random() * 15, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type.includes('heal')) {
    const palette = PALETTES.heal;
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = palette[Math.floor(Math.random() * palette.length)];
      ctx.globalAlpha = 0.5 + Math.random() * 0.5;
      ctx.beginPath();
      ctx.arc(cx + (Math.random() - 0.5) * size * 0.6,
              cy + (Math.random() - 0.5) * size * 0.6,
              2 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type.includes('shield')) {
    ctx.strokeStyle = '#4169e1';
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#87ceeb';
    ctx.fill();
  } else if (type.includes('teleport') || type.includes('swirl')) {
    ctx.strokeStyle = '#9370db';
    ctx.lineWidth = 3;
    for (let a = 0; a < Math.PI * 4; a += 0.2) {
      ctx.globalAlpha = 1 - a / (Math.PI * 4);
      const r = a * 8;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (type.includes('meteor')) {
    ctx.fillStyle = '#8b4513';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.25, 0, Math.PI * 2);
    ctx.fill();
    // Fire trail
    ctx.fillStyle = '#ff4500';
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.15, cy);
    ctx.lineTo(cx + size * 0.4, cy - size * 0.3);
    ctx.lineTo(cx + size * 0.4, cy + size * 0.3);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!existsSync(TILED_DIR)) mkdirSync(TILED_DIR, { recursive: true });

  console.log('Generating local art assets...');

  // Terrain tiles
  const terrains = ['grass', 'forest', 'mountain', 'snow', 'shore', 'river', 'sea', 'swamp', 'lowland', 'town'];
  for (const terrain of terrains) {
    const canvas = createCanvas(256, 256);
    const ctx = canvas.getContext('2d');
    drawTerrain(ctx, 256, PALETTES[terrain as keyof typeof PALETTES] || PALETTES.grass);
    writeFileSync(join(TILED_DIR, `terrain_${terrain}.png`), canvas.toBuffer('image/png'));
    console.log(`  terrain_${terrain}.png`);
  }

  // Decor
  const decors = ['tree_oak', 'tree_pine', 'tree_dead', 'tree_palm', 'tree_frozen', 'rock_small', 'rock_large', 'bush', 'flowers', 'mushrooms', 'ruins', 'bones', 'campfire', 'tent', 'waterlily', 'reeds'];
  for (const decor of decors) {
    const size = decor.includes('ruins') || decor.includes('tent') ? 128 : 64;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    drawDecor(ctx, size, decor);
    writeFileSync(join(OUTPUT_DIR, `decor_${decor}.png`), canvas.toBuffer('image/png'));
    console.log(`  decor_${decor}.png`);
  }

  // Cities
  const cityStyles = ['medieval', 'desert', 'asian', 'nordic', 'elven', 'dwarven'];
  for (const style of cityStyles) {
    const canvas = createCanvas(512, 512);
    const ctx = canvas.getContext('2d');
    drawCity(ctx, 512, style);
    writeFileSync(join(OUTPUT_DIR, `city_${style}.png`), canvas.toBuffer('image/png'));
    console.log(`  city_${style}.png`);
  }

  // Character assets
  for (const [charId, colors] of Object.entries(CHARACTER_COLORS)) {
    // Portrait
    const pCanvas = createCanvas(512, 512);
    drawCharacterPortrait(pCanvas.getContext('2d'), 512, colors);
    writeFileSync(join(OUTPUT_DIR, `char_${charId}_portrait.png`), pCanvas.toBuffer('image/png'));

    // Sprite
    const sCanvas = createCanvas(256, 256);
    drawCharacterSprite(sCanvas.getContext('2d'), 256, colors);
    writeFileSync(join(OUTPUT_DIR, `char_${charId}_sprite.png`), sCanvas.toBuffer('image/png'));

    // Icon
    const iCanvas = createCanvas(64, 64);
    drawCharacterIcon(iCanvas.getContext('2d'), 64, colors);
    writeFileSync(join(OUTPUT_DIR, `char_${charId}_icon.png`), iCanvas.toBuffer('image/png'));

    console.log(`  char_${charId} (portrait, sprite, icon)`);
  }

  // Effects
  const effects = ['fire_base', 'fire_ember', 'fire_explosion', 'ice_crystal', 'ice_shard', 'frost_aura', 'lightning_bolt', 'lightning_arc', 'spark_burst', 'magic_rune', 'magic_orb', 'nova_ring', 'poison_cloud', 'poison_drip', 'heal_sparkle', 'shield_bubble', 'teleport_swirl', 'meteor_rock'];
  for (const effect of effects) {
    const size = effect.includes('explosion') || effect.includes('arc') || effect.includes('nova') ? 512 :
                 effect.includes('rune') || effect.includes('cloud') || effect.includes('shield') || effect.includes('swirl') || effect.includes('meteor') || effect.includes('frost') ? 256 : 128;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    drawEffect(ctx, size, effect);
    writeFileSync(join(OUTPUT_DIR, `${effect}.png`), canvas.toBuffer('image/png'));
    console.log(`  ${effect}.png`);
  }

  console.log('Done! Generated all placeholder art.');
}

main();
