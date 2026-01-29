
import React, { useRef, useEffect, useState } from 'react';
import { PLAYER_RADIUS, ELEMENT_COLORS, ENEMY_TYPES, BIOME_COLORS, TOWN_RADIUS, WORLD_WIDTH, WORLD_HEIGHT, MOUNT_CONFIGS, updateCanvasSize, WALL_CONFIGS, BUILD_GRID_SIZE, CITY_STYLES, CITY_HEAL_COOLDOWN } from '../constants';
import { GameEngine } from '../engine/GameEngine';
import { assetManager } from '../engine/AssetManager';
import { ShaderManager } from '../engine/ShaderManager';
import { ElementType, CityStyle, MagicElement } from '../types';
import { FEATURE_COLORS, blendBiomeColors, TerrainFeature } from '../engine/TerrainTiles';
import { ELEMENT_COLORS as MAGIC_ELEMENT_COLORS } from '../engine/MagicWheel';
import { terrainRenderer } from '../engine/TerrainRenderer';
import { calculateViewports, drawViewportDividers } from '../engine/ViewportManager';

interface GameCanvasProps { engine: GameEngine; }

// Expose FPS for e2e testing
declare global {
  interface Window {
    __GAME_FPS__: number;
    __GAME_FPS_SAMPLES__: number[];
  }
}

// Map element enum to string for asset lookup
const elementToString: Record<ElementType, string> = {
  [ElementType.PHYSICAL]: 'PHYSICAL',
  [ElementType.FIRE]: 'FIRE',
  [ElementType.ICE]: 'ICE',
  [ElementType.MAGIC]: 'MAGIC',
  [ElementType.LIGHTNING]: 'LIGHTNING',
  [ElementType.POISON]: 'POISON',
  [ElementType.MELEE]: 'PHYSICAL',
};

// Button prompt helper - shows keyboard or controller button based on active input
const getButtonPrompt = (action: 'interact' | 'shoot' | 'block' | 'jump' | 'melee'): string => {
  const gamepads = navigator.getGamepads();
  const hasController = gamepads.some(gp => gp && gp.connected);

  const prompts: Record<string, { keyboard: string; controller: string }> = {
    interact: { keyboard: 'R', controller: 'X' },
    shoot: { keyboard: 'E', controller: 'RT' },
    block: { keyboard: 'SHIFT', controller: 'LT' },
    jump: { keyboard: 'SPACE', controller: 'A' },
    melee: { keyboard: 'F', controller: 'B' },
  };

  return hasController ? prompts[action].controller : prompts[action].keyboard;
};

export const GameCanvas: React.FC<GameCanvasProps> = ({ engine }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const shaderRef = useRef<ShaderManager | null>(null);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    Promise.all([
      assetManager.load(),
      terrainRenderer.load()
    ]).then(() => setAssetsLoaded(true));
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const sm = new ShaderManager();
    if (sm.init(containerRef.current)) {
      shaderRef.current = sm;
    }
    return () => sm.destroy();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      updateCanvasSize();
      setCanvasSize({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Build mode controls
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!engine.buildMode) return;
      const state = engine.getDrawState();
      const cam = state.camera;
      const worldX = e.clientX + cam.x;
      const worldY = e.clientY + cam.y;
      engine.placeBuilding(worldX, worldY);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') engine.rotateBuild();
      if (e.key === 'Escape') engine.cancelBuild();
    };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [engine]);

  // Persistent pattern cache to avoid recreating patterns every frame
  const patternCacheRef = useRef<Record<string, CanvasPattern | null>>({});
  const seaPatternRef = useRef<CanvasPattern | null>(null);
  // Player position history for trail effects
  const playerTrailsRef = useRef<{ x: number; y: number; alpha: number }[][]>([[], [], [], []]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let animationId: number;
    let lastTime = performance.now();
    let frameCount = 0;
    let fps = 60;
    window.__GAME_FPS_SAMPLES__ = [];

    const W = canvasSize.w;
    const H = canvasSize.h;
    const patternCache = patternCacheRef.current;

    // Helper to draw image centered at position with size
    const drawImage = (img: HTMLImageElement | null, x: number, y: number, size: number, angle?: number) => {
      if (!img || img.width === 0) return false;
      ctx.save();
      ctx.translate(x, y);
      if (angle !== undefined) ctx.rotate(angle);
      ctx.drawImage(img, -size/2, -size/2, size, size);
      ctx.restore();
      return true;
    };

    // Pre-cache sea pattern
    const seaImg = assetManager.getTerrain('SEA');
    if (seaImg && seaImg.width > 0 && !seaPatternRef.current) {
      seaPatternRef.current = ctx.createPattern(seaImg, 'repeat');
    }

    const renderViewport = (
      vx: number, vy: number, vw: number, vh: number,
      cam: { x: number; y: number },
      state: ReturnType<typeof engine.getDrawState>,
      playerIdx: number
    ) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(vx, vy, vw, vh);
      ctx.clip();
      ctx.translate(vx - cam.x, vy - cam.y);

      if (seaPatternRef.current) {
        ctx.save();
        ctx.fillStyle = seaPatternRef.current;
        ctx.translate(-cam.x % 256, -cam.y % 256);
        ctx.fillRect(cam.x, cam.y, vw + 256, vh + 256);
        ctx.restore();
      } else {
        ctx.fillStyle = BIOME_COLORS.SEA;
        ctx.fillRect(cam.x, cam.y, vw, vh);
      }

      const world = state.world;
      const tileSize = world.gridSize;
      const startTileX = Math.floor(cam.x / tileSize);
      const startTileY = Math.floor(cam.y / tileSize);
      const tilesAcross = Math.ceil(vw / tileSize) + 1;
      const tilesDown = Math.ceil(vh / tileSize) + 1;

      // Fast terrain rendering - solid colors only, no features
      for (let x = startTileX; x < startTileX + tilesAcross; x++) {
        for (let y = startTileY; y < startTileY + tilesDown; y++) {
          const worldX = x * tileSize;
          const worldY = y * tileSize;
          const biome = world.getBiomeAtFast(worldX, worldY);
          if (biome === 'SEA') continue;
          ctx.fillStyle = BIOME_COLORS[biome as keyof typeof BIOME_COLORS];
          ctx.fillRect(worldX, worldY, tileSize + 1, tileSize + 1);
        }
      }

      const fireViewMargin = 200;
      state.fireAreas.forEach(fa => {
          if (fa.pos.x < cam.x - fireViewMargin || fa.pos.x > cam.x + vw + fireViewMargin ||
              fa.pos.y < cam.y - fireViewMargin || fa.pos.y > cam.y + vh + fireViewMargin) return;
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = '#ff4400';
          ctx.beginPath(); ctx.arc(fa.pos.x, fa.pos.y, fa.radius, 0, Math.PI*2); ctx.fill();
          ctx.globalAlpha = 1;
      });

      // Fire telegraphs - flashing warning circles
      state.fireTelegraphs?.forEach(ft => {
          if (ft.pos.x < cam.x - fireViewMargin || ft.pos.x > cam.x + vw + fireViewMargin ||
              ft.pos.y < cam.y - fireViewMargin || ft.pos.y > cam.y + vh + fireViewMargin) return;
          const flash = Math.sin(Date.now() * 0.02 * ft.flashRate) > 0;
          const urgency = 1 - ft.life / ft.maxLife;
          ctx.strokeStyle = flash ? `rgba(255, ${100 - urgency * 100}, 0, ${0.5 + urgency * 0.5})` : 'rgba(255, 200, 0, 0.3)';
          ctx.lineWidth = 3 + urgency * 4;
          ctx.setLineDash([10, 5]);
          ctx.beginPath(); ctx.arc(ft.pos.x, ft.pos.y, ft.radius, 0, Math.PI*2); ctx.stroke();
          ctx.setLineDash([]);
          if (flash) {
            ctx.fillStyle = `rgba(255, 100, 0, ${0.1 + urgency * 0.2})`;
            ctx.beginPath(); ctx.arc(ft.pos.x, ft.pos.y, ft.radius, 0, Math.PI*2); ctx.fill();
          }
      });

      // Slash effects
      state.slashEffects?.forEach(s => {
          if (s.pos.x < cam.x - 150 || s.pos.x > cam.x + vw + 150 ||
              s.pos.y < cam.y - 150 || s.pos.y > cam.y + vh + 150) return;
          const progress = 1 - s.life / s.maxLife;
          const alpha = 1 - progress;
          ctx.save();
          ctx.translate(s.pos.x, s.pos.y);
          ctx.rotate(s.angle);
          ctx.strokeStyle = s.color;
          ctx.lineWidth = s.width * (1 - progress * 0.5);
          ctx.lineCap = 'round';
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.moveTo(-s.range * 0.5 * progress, 0);
          ctx.quadraticCurveTo(0, -15 * (1 - progress), s.range * 0.5 + s.range * progress * 0.3, 0);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.restore();
      });

      const viewMargin = 100;
      const viewLeft = cam.x - viewMargin;
      const viewRight = cam.x + vw + viewMargin;
      const viewTop = cam.y - viewMargin;
      const viewBottom = cam.y + vh + viewMargin;

      state.mounts.forEach(m => {
          if (m.pos.x < viewLeft || m.pos.x > viewRight || m.pos.y < viewTop || m.pos.y > viewBottom) return;
          const mountImg = assetManager.getMount(m.type);
          const size = m.type === 'DRAGON' ? 80 : m.type === 'CHARIOT' ? 64 : m.type === 'BOAT' ? 56 : 48;
          if (!drawImage(mountImg, m.pos.x, m.pos.y, size, m.angle)) {
            const cfg = MOUNT_CONFIGS[m.type as keyof typeof MOUNT_CONFIGS];
            ctx.save(); ctx.translate(m.pos.x, m.pos.y); ctx.rotate(m.angle);
            ctx.fillStyle = cfg.color;
            if (m.type === 'HORSE') { ctx.beginPath(); ctx.ellipse(0, 0, 24, 14, 0, 0, Math.PI*2); ctx.fill(); }
            else if (m.type === 'CHARIOT') ctx.fillRect(-25, -18, 50, 36);
            else if (m.type === 'BOAT') {
              ctx.beginPath();
              ctx.moveTo(-28, 8); ctx.lineTo(-20, -12); ctx.lineTo(28, -12);
              ctx.lineTo(32, 8); ctx.lineTo(-28, 8);
              ctx.fill();
              ctx.fillStyle = '#8B4513';
              ctx.fillRect(-5, -25, 4, 20);
            }
            else { ctx.fillStyle = cfg.color; ctx.beginPath(); ctx.arc(0, 0, 32, 0, Math.PI*2); ctx.fill(); }
            ctx.restore();
          }
          // Health bar
          const hpPct = m.hp / m.maxHp;
          const barY = m.pos.y - (size / 2) - 8;
          ctx.fillStyle = '#333'; ctx.fillRect(m.pos.x - 15, barY, 30, 4);
          ctx.fillStyle = hpPct > 0.5 ? '#0f0' : hpPct > 0.25 ? '#ff0' : '#f00';
          ctx.fillRect(m.pos.x - 14, barY + 1, 28 * hpPct, 2);
      });

      state.traders.forEach(tr => {
          if (tr.pos.x < viewLeft || tr.pos.x > viewRight || tr.pos.y < viewTop || tr.pos.y > viewBottom) return;
          const traderImg = assetManager.getNPC('trader');
          if (!drawImage(traderImg, tr.pos.x, tr.pos.y, 48, tr.angle)) {
            ctx.save(); ctx.translate(tr.pos.x, tr.pos.y); ctx.rotate(tr.angle);
            ctx.fillStyle = '#ffaa00'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#444'; ctx.fillRect(-10, -25, 20, 50);
            ctx.restore();
          }
          ctx.fillStyle = 'white'; ctx.font = '10px Orbitron'; ctx.textAlign = 'center';
          ctx.fillText(`TRADER [${getButtonPrompt('interact')}]`, tr.pos.x, tr.pos.y - 35);
      });

      // Render walls
      state.walls?.forEach(w => {
        if (w.pos.x < viewLeft - 50 || w.pos.x > viewRight + 50 || w.pos.y < viewTop - 50 || w.pos.y > viewBottom + 50) return;
        const cfg = WALL_CONFIGS[w.type];
        ctx.save();
        ctx.translate(w.pos.x, w.pos.y);
        ctx.rotate(w.rotation * Math.PI / 180);

        // Wall base with 3D effect
        ctx.fillStyle = w.isOpen ? '#5a6a5f' : cfg.color;
        if (w.type === 'WALL_STRAIGHT') {
          ctx.fillRect(-cfg.width/2, -cfg.height/2, cfg.width, cfg.height);
          ctx.fillStyle = '#4a4a3f';
          ctx.fillRect(-cfg.width/2, -cfg.height/2 - 8, cfg.width, 8); // top edge
        } else if (w.type === 'WALL_CORNER') {
          ctx.fillRect(-cfg.width/2, -cfg.height/2, cfg.width, cfg.height);
          ctx.fillStyle = '#4a4a3f';
          ctx.fillRect(-cfg.width/2, -cfg.height/2 - 8, cfg.width, 8);
        } else if (w.type === 'WALL_GATE') {
          if (w.isOpen) {
            ctx.fillRect(-cfg.width/2, -cfg.height/2, 20, cfg.height);
            ctx.fillRect(cfg.width/2 - 20, -cfg.height/2, 20, cfg.height);
          } else {
            ctx.fillRect(-cfg.width/2, -cfg.height/2, cfg.width, cfg.height);
            ctx.strokeStyle = '#3a3a2f'; ctx.lineWidth = 2;
            ctx.strokeRect(-cfg.width/4, -cfg.height/2, cfg.width/2, cfg.height);
          }
        }
        ctx.restore();

        // HP bar
        const hpPct = w.hp / w.maxHp;
        if (hpPct < 1) {
          ctx.fillStyle = '#333'; ctx.fillRect(w.pos.x - 20, w.pos.y - 25, 40, 4);
          ctx.fillStyle = hpPct > 0.5 ? '#0f0' : hpPct > 0.25 ? '#ff0' : '#f00';
          ctx.fillRect(w.pos.x - 19, w.pos.y - 24, 38 * hpPct, 2);
        }
      });

      // Render towers
      state.towers?.forEach(t => {
        if (t.pos.x < viewLeft - 40 || t.pos.x > viewRight + 40 || t.pos.y < viewTop - 40 || t.pos.y > viewBottom + 40) return;
        const cfg = WALL_CONFIGS.TOWER;

        // Tower base
        ctx.fillStyle = cfg.color;
        ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y, cfg.width/2, 0, Math.PI * 2); ctx.fill();

        // Tower top (lighter)
        ctx.fillStyle = '#5a4a3f';
        ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y - 8, cfg.width/2 - 5, 0, Math.PI * 2); ctx.fill();

        // Battlements
        ctx.fillStyle = '#3a2a1f';
        for (let i = 0; i < 6; i++) {
          const ang = i * Math.PI / 3;
          ctx.fillRect(t.pos.x + Math.cos(ang) * (cfg.width/2 - 3) - 4, t.pos.y + Math.sin(ang) * (cfg.width/2 - 3) - 12, 8, 8);
        }

        // Range indicator when cooldown low
        if (t.cooldown < 10) {
          ctx.strokeStyle = 'rgba(255,100,100,0.2)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(t.pos.x, t.pos.y, t.range, 0, Math.PI * 2); ctx.stroke();
        }

        // HP bar
        const hpPct = t.hp / t.maxHp;
        if (hpPct < 1) {
          ctx.fillStyle = '#333'; ctx.fillRect(t.pos.x - 20, t.pos.y - 40, 40, 4);
          ctx.fillStyle = hpPct > 0.5 ? '#0f0' : hpPct > 0.25 ? '#ff0' : '#f00';
          ctx.fillRect(t.pos.x - 19, t.pos.y - 39, 38 * hpPct, 2);
        }
      });

      state.enemies.forEach(e => {
          if (e.pos.x < viewLeft - e.radius || e.pos.x > viewRight + e.radius ||
              e.pos.y < viewTop - e.radius || e.pos.y > viewBottom + e.radius) return;
          const enemyImg = assetManager.getEnemy(e.type);
          const size = e.radius * 2.5;

          // Check if enemy was recently hit (knockback indicates hit)
          const knockbackMag = Math.sqrt(e.knockbackVel.x * e.knockbackVel.x + e.knockbackVel.y * e.knockbackVel.y);
          const isHit = knockbackMag > 0.5;

          if (e.slowTimer > 0 || e.burnTimer > 0 || e.poisonTimer > 0) ctx.globalAlpha = 0.7;

          // Hit flash effect - draw white overlay when hit
          if (isHit) {
            ctx.globalAlpha = Math.min(1, knockbackMag * 0.2);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.radius * 1.2, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1;
          }

          if (!drawImage(enemyImg, e.pos.x, e.pos.y, size, e.angle)) {
            ctx.fillStyle = ENEMY_TYPES[e.type].color;
            if (e.slowTimer > 0) ctx.fillStyle = '#4dffff';
            if (e.burnTimer > 0) ctx.fillStyle = '#ff4d4d';
            if (e.poisonTimer > 0) ctx.fillStyle = '#a020f0';
            if (isHit) ctx.fillStyle = '#ffffff'; // Flash white when hit
            ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.radius, 0, Math.PI*2); ctx.fill();
          }
          ctx.globalAlpha = 1;

          // Status effect auras with glow
          if (e.slowTimer > 0) {
            const slowGlow = ctx.createRadialGradient(e.pos.x, e.pos.y, e.radius, e.pos.x, e.pos.y, e.radius + 8);
            slowGlow.addColorStop(0, '#4dffff44');
            slowGlow.addColorStop(1, 'transparent');
            ctx.fillStyle = slowGlow;
            ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.radius + 8, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#4dffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.radius + 3, 0, Math.PI*2); ctx.stroke();
          }
          if (e.burnTimer > 0) {
            const burnGlow = ctx.createRadialGradient(e.pos.x, e.pos.y, e.radius, e.pos.x, e.pos.y, e.radius + 10);
            burnGlow.addColorStop(0, '#ff4d4d44');
            burnGlow.addColorStop(1, 'transparent');
            ctx.fillStyle = burnGlow;
            ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.radius + 10, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.radius + 5, 0, Math.PI*2); ctx.stroke();
          }
          if (e.poisonTimer > 0) {
            const poisonGlow = ctx.createRadialGradient(e.pos.x, e.pos.y, e.radius, e.pos.x, e.pos.y, e.radius + 8);
            poisonGlow.addColorStop(0, '#a020f044');
            poisonGlow.addColorStop(1, 'transparent');
            ctx.fillStyle = poisonGlow;
            ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.radius + 8, 0, Math.PI*2); ctx.fill();
          }

          ctx.fillStyle = '#333'; ctx.fillRect(e.pos.x - 12, e.pos.y - e.radius - 10, 24, 4);
          ctx.fillStyle = '#f00'; ctx.fillRect(e.pos.x - 11, e.pos.y - e.radius - 9, 22 * (e.hp / e.maxHp), 2);
      });

      // Draw faction castles
      state.factionCastles?.forEach(castle => {
        if (castle.pos.x < viewLeft - 100 || castle.pos.x > viewRight + 100 ||
            castle.pos.y < viewTop - 100 || castle.pos.y > viewBottom + 100) return;

        const isBlue = castle.faction === 'BLUE';
        const baseColor = isBlue ? '#1e90ff' : '#dc143c';
        const darkColor = isBlue ? '#0a4a8a' : '#8b0000';
        const lightColor = isBlue ? '#4dc3ff' : '#ff6666';

        // Castle base
        ctx.fillStyle = darkColor;
        ctx.fillRect(castle.pos.x - 50, castle.pos.y - 30, 100, 60);

        // Castle walls
        ctx.fillStyle = baseColor;
        ctx.fillRect(castle.pos.x - 45, castle.pos.y - 40, 90, 10);

        // Towers
        ctx.fillStyle = darkColor;
        ctx.fillRect(castle.pos.x - 55, castle.pos.y - 50, 20, 70);
        ctx.fillRect(castle.pos.x + 35, castle.pos.y - 50, 20, 70);

        // Tower tops
        ctx.fillStyle = lightColor;
        ctx.beginPath();
        ctx.moveTo(castle.pos.x - 55, castle.pos.y - 50);
        ctx.lineTo(castle.pos.x - 45, castle.pos.y - 70);
        ctx.lineTo(castle.pos.x - 35, castle.pos.y - 50);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(castle.pos.x + 35, castle.pos.y - 50);
        ctx.lineTo(castle.pos.x + 45, castle.pos.y - 70);
        ctx.lineTo(castle.pos.x + 55, castle.pos.y - 50);
        ctx.fill();

        // Flag
        ctx.fillStyle = baseColor;
        ctx.fillRect(castle.pos.x - 2, castle.pos.y - 80, 4, 40);
        ctx.beginPath();
        ctx.moveTo(castle.pos.x + 2, castle.pos.y - 80);
        ctx.lineTo(castle.pos.x + 25, castle.pos.y - 70);
        ctx.lineTo(castle.pos.x + 2, castle.pos.y - 60);
        ctx.fill();

        // Gate
        ctx.fillStyle = '#2a1a0a';
        ctx.fillRect(castle.pos.x - 15, castle.pos.y, 30, 30);

        // HP bar
        const hpPct = castle.hp / castle.maxHp;
        ctx.fillStyle = '#333'; ctx.fillRect(castle.pos.x - 40, castle.pos.y + 40, 80, 6);
        ctx.fillStyle = isBlue ? '#4dc3ff' : '#ff4444';
        ctx.fillRect(castle.pos.x - 39, castle.pos.y + 41, 78 * hpPct, 4);

        // Siege indicator
        if (castle.siegeActive) {
          ctx.strokeStyle = '#ffaa00';
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 5]);
          ctx.beginPath();
          ctx.arc(castle.pos.x, castle.pos.y, 120, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });

      // Draw allies
      state.allies?.forEach(ally => {
        if (ally.pos.x < viewLeft - 20 || ally.pos.x > viewRight + 20 ||
            ally.pos.y < viewTop - 20 || ally.pos.y > viewBottom + 20) return;

        const size = ally.type === 'KNIGHT' ? 18 : ally.type === 'MAGE' ? 14 : 15;

        // Body
        ctx.fillStyle = ally.color;
        ctx.beginPath();
        ctx.arc(ally.pos.x, ally.pos.y, size, 0, Math.PI * 2);
        ctx.fill();

        // Direction indicator
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(
          ally.pos.x + Math.cos(ally.angle) * size * 0.6,
          ally.pos.y + Math.sin(ally.angle) * size * 0.6,
          4, 0, Math.PI * 2
        );
        ctx.fill();

        // Type indicator
        if (ally.type === 'KNIGHT') {
          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ally.pos.x, ally.pos.y, size + 3, 0, Math.PI * 2);
          ctx.stroke();
        } else if (ally.type === 'MAGE') {
          ctx.strokeStyle = '#cc33ff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(ally.pos.x, ally.pos.y, size + 2, 0, Math.PI * 2);
          ctx.stroke();
        }

        // HP bar
        const hpPct = ally.hp / ally.maxHp;
        if (hpPct < 1) {
          ctx.fillStyle = '#333'; ctx.fillRect(ally.pos.x - 10, ally.pos.y - size - 8, 20, 3);
          ctx.fillStyle = '#4dc3ff';
          ctx.fillRect(ally.pos.x - 9, ally.pos.y - size - 7, 18 * hpPct, 2);
        }
      });

      state.coins.forEach(c => {
          if (c.pos.x < viewLeft || c.pos.x > viewRight || c.pos.y < viewTop || c.pos.y > viewBottom) return;
          const coinImg = assetManager.getItem('coin');
          if (!drawImage(coinImg, c.pos.x, c.pos.y, 24)) {
            ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(c.pos.x, c.pos.y, 8, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#aa8800'; ctx.beginPath(); ctx.arc(c.pos.x - 2, c.pos.y - 2, 3, 0, Math.PI*2); ctx.fill();
          }
      });

      // Render pickups
      state.pickups?.forEach(pk => {
          if (pk.pos.x < viewLeft || pk.pos.x > viewRight || pk.pos.y < viewTop || pk.pos.y > viewBottom) return;
          const bob = Math.sin(Date.now() * 0.004 + pk.id) * 3;
          const colors: Record<string, string> = {
            'HEALTH_POTION': '#ff4444', 'MANA_POTION': '#4444ff', 'COIN_BAG': '#ffd700',
            'SPEED_BOOST': '#00ff88', 'DAMAGE_BOOST': '#ff8800', 'CHEST': '#aa7744'
          };
          ctx.fillStyle = colors[pk.type] || '#fff';
          if (pk.type === 'CHEST') {
            ctx.fillRect(pk.pos.x - 12, pk.pos.y - 8 + bob, 24, 16);
            ctx.fillStyle = '#886633';
            ctx.fillRect(pk.pos.x - 10, pk.pos.y - 6 + bob, 20, 4);
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(pk.pos.x - 3, pk.pos.y - 2 + bob, 6, 6);
          } else if (pk.type.includes('POTION')) {
            ctx.beginPath(); ctx.arc(pk.pos.x, pk.pos.y + bob, 10, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffffff44';
            ctx.beginPath(); ctx.arc(pk.pos.x - 3, pk.pos.y - 3 + bob, 3, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.beginPath(); ctx.arc(pk.pos.x, pk.pos.y + bob, 12, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(pk.pos.x, pk.pos.y + bob, 12, 0, Math.PI * 2); ctx.stroke();
          }
      });

      state.bullets.forEach(b => {
        if (b.pos.x < viewLeft || b.pos.x > viewRight || b.pos.y < viewTop || b.pos.y > viewBottom) return;
        const elementStr = elementToString[b.element];
        const bulletImg = assetManager.getProjectile(elementStr);
        const angle = Math.atan2(b.vel.y, b.vel.x);
        const color = ELEMENT_COLORS[b.element];

        // Draw bullet trail
        const speed = Math.sqrt(b.vel.x * b.vel.x + b.vel.y * b.vel.y);
        const trailLen = Math.min(speed * 3, 30);
        const gradient = ctx.createLinearGradient(
          b.pos.x - Math.cos(angle) * trailLen,
          b.pos.y - Math.sin(angle) * trailLen,
          b.pos.x, b.pos.y
        );
        gradient.addColorStop(0, 'transparent');
        gradient.addColorStop(1, color);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = b.radius * 1.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.pos.x - Math.cos(angle) * trailLen, b.pos.y - Math.sin(angle) * trailLen);
        ctx.lineTo(b.pos.x, b.pos.y);
        ctx.stroke();

        // Draw glow effect
        const glowGradient = ctx.createRadialGradient(b.pos.x, b.pos.y, 0, b.pos.x, b.pos.y, b.radius * 2.5);
        glowGradient.addColorStop(0, color);
        glowGradient.addColorStop(0.4, color + '88');
        glowGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = glowGradient;
        ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius * 2.5, 0, Math.PI*2); ctx.fill();

        if (!drawImage(bulletImg, b.pos.x, b.pos.y, b.radius * 3, angle)) {
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI*2); ctx.fill();
        }
      });

      // Magic projectiles - enhanced with glow and trails
      state.magicProjectiles?.forEach(mp => {
        if (mp.pos.x < viewLeft - 50 || mp.pos.x > viewRight + 50 || mp.pos.y < viewTop - 50 || mp.pos.y > viewBottom + 50) return;
        const mpColor = MAGIC_ELEMENT_COLORS[mp.elements[0]];
        const angle = Math.atan2(mp.vel.y, mp.vel.x);
        const speed = Math.sqrt(mp.vel.x * mp.vel.x + mp.vel.y * mp.vel.y);

        // Trail effect
        const trailLen = Math.min(speed * 4, 50);
        const trailGradient = ctx.createLinearGradient(
          mp.pos.x - Math.cos(angle) * trailLen,
          mp.pos.y - Math.sin(angle) * trailLen,
          mp.pos.x, mp.pos.y
        );
        trailGradient.addColorStop(0, 'transparent');
        trailGradient.addColorStop(1, mpColor + 'aa');
        ctx.strokeStyle = trailGradient;
        ctx.lineWidth = mp.radius * 1.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(mp.pos.x - Math.cos(angle) * trailLen, mp.pos.y - Math.sin(angle) * trailLen);
        ctx.lineTo(mp.pos.x, mp.pos.y);
        ctx.stroke();

        // Outer glow
        const outerGlow = ctx.createRadialGradient(mp.pos.x, mp.pos.y, 0, mp.pos.x, mp.pos.y, mp.radius * 3);
        outerGlow.addColorStop(0, mpColor);
        outerGlow.addColorStop(0.3, mpColor + 'aa');
        outerGlow.addColorStop(0.7, mpColor + '44');
        outerGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = outerGlow;
        ctx.beginPath();
        ctx.arc(mp.pos.x, mp.pos.y, mp.radius * 3, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = mpColor;
        ctx.beginPath();
        ctx.arc(mp.pos.x, mp.pos.y, mp.radius, 0, Math.PI * 2);
        ctx.fill();

        // White center for intensity
        ctx.fillStyle = '#ffffff88';
        ctx.beginPath();
        ctx.arc(mp.pos.x, mp.pos.y, mp.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
      });

      state.particles.forEach(p => {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        // Outer glow for larger particles
        if (p.size > 2) {
          const particleGlow = ctx.createRadialGradient(p.pos.x, p.pos.y, 0, p.pos.x, p.pos.y, p.size * 2);
          particleGlow.addColorStop(0, p.color);
          particleGlow.addColorStop(0.5, p.color + '66');
          particleGlow.addColorStop(1, 'transparent');
          ctx.fillStyle = particleGlow;
          ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, p.size * 2, 0, Math.PI*2); ctx.fill();
        }
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI*2); ctx.fill();
      });
      ctx.globalAlpha = 1;

      state.damageNumbers.forEach(dn => {
        const alpha = dn.life / dn.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = dn.color;
        const size = dn.fontSize || (dn.isCrit ? 16 : 12);
        const scale = dn.text ? 1 + (1 - alpha) * 0.5 : 1;
        ctx.font = `bold ${Math.floor(size * scale)}px Orbitron`;
        ctx.textAlign = 'center';
        const displayText = dn.text || dn.value.toString();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.strokeText(displayText, dn.pos.x, dn.pos.y);
        ctx.fillText(displayText, dn.pos.x, dn.pos.y);
      });
      ctx.globalAlpha = 1;

      state.players.forEach((p, i) => {
        const pos = state.playerPositions[i];
        if (!pos || p.isDead) return;

        // Update player trail for speed effect
        const trail = playerTrailsRef.current[i];
        if (trail) {
          // Add current position to trail
          trail.unshift({ x: pos.x, y: pos.y - p.z, alpha: 0.5 });
          // Limit trail length and fade out
          while (trail.length > 8) trail.pop();
          trail.forEach((t, idx) => { t.alpha *= 0.75; });
          // Draw trail (afterimages) - only if moving fast
          if (trail.length > 2) {
            const dx = trail[0].x - (trail[2]?.x || trail[0].x);
            const dy = trail[0].y - (trail[2]?.y || trail[0].y);
            const speed = Math.sqrt(dx * dx + dy * dy);
            if (speed > 4) {
              trail.forEach((t, idx) => {
                if (idx === 0 || t.alpha < 0.05) return;
                ctx.globalAlpha = t.alpha * 0.4;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(t.x, t.y, PLAYER_RADIUS * (1 - idx * 0.08), 0, Math.PI * 2);
                ctx.fill();
              });
              ctx.globalAlpha = 1;
            }
          }
        }

        const mountZ = p.z;
        if (p.mount) {
          const mountImg = assetManager.getMount(p.mount);
          const mountSize = p.mount === 'DRAGON' ? 100 : p.mount === 'CHARIOT' ? 80 : p.mount === 'BOAT' ? 70 : 64;
          const mountRenderY = pos.y - mountZ;
          if (!drawImage(mountImg, pos.x, mountRenderY, mountSize)) {
            const cfg = MOUNT_CONFIGS[p.mount];
            ctx.fillStyle = cfg.color;
            if (p.mount === 'HORSE') { ctx.beginPath(); ctx.ellipse(pos.x, mountRenderY, 32, 18, 0, 0, Math.PI*2); ctx.fill(); }
            else if (p.mount === 'DRAGON') {
                const flap = Math.sin(Date.now() * 0.008) * 0.35;
                ctx.beginPath(); ctx.arc(pos.x, mountRenderY, 45, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(pos.x - 45, mountRenderY, 40, 12, flap, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(pos.x + 45, mountRenderY, 40, 12, -flap, 0, Math.PI*2); ctx.fill();
            } else if (p.mount === 'BOAT') {
                ctx.beginPath();
                ctx.moveTo(pos.x - 35, mountRenderY + 10); ctx.lineTo(pos.x - 25, mountRenderY - 15);
                ctx.lineTo(pos.x + 35, mountRenderY - 15); ctx.lineTo(pos.x + 40, mountRenderY + 10);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#8B4513';
                ctx.fillRect(pos.x - 3, mountRenderY - 35, 6, 25);
            } else { ctx.fillRect(pos.x - 35, mountRenderY - 22, 70, 44); }
          }
        }
        const renderY = pos.y - p.z - (p.mount ? 10 : 0);
        const playerImg = assetManager.getPlayer(i);
        if (!drawImage(playerImg, pos.x, renderY, PLAYER_RADIUS * 3)) {
          ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(pos.x, renderY, PLAYER_RADIUS, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(pos.x - 3, renderY - 3, 3, 0, Math.PI*2); ctx.fill();
        }
        if (p.isBlocking) { ctx.strokeStyle = '#4df'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(pos.x, renderY, PLAYER_RADIUS + 8, 0, Math.PI*2); ctx.stroke(); }

        // Render floating magic element orbs above player with charge effects
        const wheelState = state.magicWheels?.[i];
        if (wheelState?.stack?.elements?.length > 0) {
          const elements = wheelState.stack.elements;
          const chargeLevel = wheelState.chargeLevel || 0;
          const orbRadius = 10 + (chargeLevel > 0 ? Math.sin(Date.now() * 0.01) * 2 : 0);
          const spacing = 24;
          const baseY = renderY - PLAYER_RADIUS - 35;
          const totalWidth = (elements.length - 1) * spacing;
          const startX = pos.x - totalWidth / 2;

          // Draw charging ring around player when charging
          if (chargeLevel > 0) {
            const chargeRadius = PLAYER_RADIUS + 15 + chargeLevel * 0.3;
            const chargeAlpha = 0.3 + chargeLevel * 0.005;
            ctx.strokeStyle = MAGIC_ELEMENT_COLORS[elements[0]] + Math.floor(chargeAlpha * 255).toString(16).padStart(2, '0');
            ctx.lineWidth = 2 + chargeLevel * 0.04;
            ctx.beginPath();
            ctx.arc(pos.x, renderY, chargeRadius, 0, Math.PI * 2);
            ctx.stroke();
            // Inner pulse
            const pulseRadius = PLAYER_RADIUS + 5 + Math.sin(Date.now() * 0.02) * 5 * (chargeLevel / 100);
            ctx.strokeStyle = '#ffffff44';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(pos.x, renderY, pulseRadius, 0, Math.PI * 2);
            ctx.stroke();
          }

          elements.forEach((el: MagicElement, idx: number) => {
            const orbX = startX + idx * spacing;
            const orbColor = MAGIC_ELEMENT_COLORS[el];
            // Glow effect for orbs
            const orbGlow = ctx.createRadialGradient(orbX, baseY, 0, orbX, baseY, orbRadius * 2);
            orbGlow.addColorStop(0, orbColor);
            orbGlow.addColorStop(0.5, orbColor + '66');
            orbGlow.addColorStop(1, 'transparent');
            ctx.fillStyle = orbGlow;
            ctx.beginPath();
            ctx.arc(orbX, baseY, orbRadius * 2, 0, Math.PI * 2);
            ctx.fill();
            // Orb core
            ctx.fillStyle = orbColor;
            ctx.beginPath();
            ctx.arc(orbX, baseY, orbRadius, 0, Math.PI * 2);
            ctx.fill();
            // Highlight
            ctx.fillStyle = '#ffffff66';
            ctx.beginPath();
            ctx.arc(orbX - orbRadius * 0.3, baseY - orbRadius * 0.3, orbRadius * 0.4, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      });

      // Render campfires with flame glow effect
      state.campfires?.forEach(cf => {
        if (cf.pos.x < viewLeft - 80 || cf.pos.x > viewRight + 80 || cf.pos.y < viewTop - 80 || cf.pos.y > viewBottom + 80) return;
        const flicker = 0.8 + Math.sin(Date.now() * 0.01 + cf.id) * 0.2;
        // Outer glow
        const campGlow = ctx.createRadialGradient(cf.pos.x, cf.pos.y, 0, cf.pos.x, cf.pos.y, 60 * flicker);
        campGlow.addColorStop(0, 'rgba(255, 150, 50, 0.4)');
        campGlow.addColorStop(0.5, 'rgba(255, 100, 0, 0.15)');
        campGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = campGlow;
        ctx.beginPath(); ctx.arc(cf.pos.x, cf.pos.y, 60 * flicker, 0, Math.PI*2); ctx.fill();
        // Inner flame
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath(); ctx.arc(cf.pos.x, cf.pos.y - 3 * flicker, 8 * flicker, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ff6600';
        ctx.beginPath(); ctx.arc(cf.pos.x, cf.pos.y, 10, 0, Math.PI*2); ctx.fill();
      });

      // Render torches with flame effect
      state.torches?.forEach(torch => {
        if (torch.pos.x < viewLeft - 40 || torch.pos.x > viewRight + 40 || torch.pos.y < viewTop - 40 || torch.pos.y > viewBottom + 40) return;
        const flicker = 0.85 + Math.sin(Date.now() * 0.015 + torch.id) * 0.15;
        // Glow
        const torchGlow = ctx.createRadialGradient(torch.pos.x, torch.pos.y - 10, 0, torch.pos.x, torch.pos.y - 10, 35 * flicker);
        torchGlow.addColorStop(0, 'rgba(255, 180, 50, 0.35)');
        torchGlow.addColorStop(0.6, 'rgba(255, 100, 0, 0.1)');
        torchGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = torchGlow;
        ctx.beginPath(); ctx.arc(torch.pos.x, torch.pos.y - 10, 35 * flicker, 0, Math.PI*2); ctx.fill();
        // Flame
        ctx.fillStyle = '#ffdd44';
        ctx.beginPath(); ctx.arc(torch.pos.x, torch.pos.y - 12 * flicker, 4 * flicker, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ff8800';
        ctx.beginPath(); ctx.arc(torch.pos.x, torch.pos.y - 10, 5, 0, Math.PI*2); ctx.fill();
      });

      // Render towns - simplified
      state.towns?.forEach(town => {
        if (town.pos.x < viewLeft - 150 || town.pos.x > viewRight + 150 || town.pos.y < viewTop - 150 || town.pos.y > viewBottom + 150) return;
        const style = CITY_STYLES[town.style] || CITY_STYLES.MEDIEVAL;
        ctx.fillStyle = style.color;
        ctx.beginPath(); ctx.arc(town.pos.x, town.pos.y, 70, 0, Math.PI*2); ctx.fill();

        ctx.fillStyle = 'white'; ctx.font = '12px Orbitron'; ctx.textAlign = 'center';
        ctx.fillText(town.name, town.pos.x, town.pos.y - 85);
        ctx.fillText(`[${getButtonPrompt('interact')}] SHOP`, town.pos.x, town.pos.y - 70);
      });

      // Show heal cooldown for player in viewport if in town
      const p = state.players[playerIdx];
      const pPos = state.playerPositions[playerIdx];
      if (p && pPos && state.playerCityHealCooldowns) {
        const cooldown = state.playerCityHealCooldowns[playerIdx] || 0;
        if (cooldown > 0) {
          const pct = cooldown / CITY_HEAL_COOLDOWN;
          const secs = Math.ceil(cooldown / 60);
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(pPos.x - 25, pPos.y + 25, 50, 8);
          ctx.fillStyle = '#00ff88';
          ctx.fillRect(pPos.x - 24, pPos.y + 26, 48 * (1 - pct), 6);
          ctx.fillStyle = '#aaa'; ctx.font = '9px Orbitron'; ctx.textAlign = 'center';
          ctx.fillText(`HEAL ${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`, pPos.x, pPos.y + 42);
        }
      }

      ctx.restore();
      ctx.restore();
    };

    const seenFireAreas = new Set<number>();
    let prevTime = performance.now();

    const render = () => {
      frameCount++;
      const now = performance.now();
      const dt = (now - prevTime) / 1000;
      prevTime = now;

      if (now - lastTime >= 1000) {
        fps = frameCount; frameCount = 0; lastTime = now;
        window.__GAME_FPS__ = fps;
        window.__GAME_FPS_SAMPLES__.push(fps);
        if (window.__GAME_FPS_SAMPLES__.length > 60) window.__GAME_FPS_SAMPLES__.shift();
      }

      engine.update();
      const state = engine.getDrawState();

      if (shaderRef.current) {
        state.fireAreas.forEach(fa => {
          if (!seenFireAreas.has(fa.id)) {
            seenFireAreas.add(fa.id);
            const type = fa.color.includes('ff44') || fa.color.includes('ff66') ? 'fire'
              : fa.color.includes('4df') || fa.color.includes('00ff') ? 'ice'
              : fa.color.includes('a020') ? 'poison'
              : fa.color.includes('ffff') ? 'lightning'
              : 'magic';
            shaderRef.current!.addEffect({ x: fa.pos.x, y: fa.pos.y, radius: fa.radius * 1.5, type, intensity: 1, duration: fa.maxLife / 60 });
          }
        });
        shaderRef.current.update(dt);
      }
      const numPlayers = state.players.length;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      const viewports = calculateViewports(numPlayers, W, H);
      // Apply screen shake offset
      const shakeIntensity = state.screenShake || 0;
      const shakeX = shakeIntensity > 0 ? (Math.random() - 0.5) * shakeIntensity * 2 : 0;
      const shakeY = shakeIntensity > 0 ? (Math.random() - 0.5) * shakeIntensity * 2 : 0;
      for (const vp of viewports) {
        const pos = state.playerPositions[vp.playerIndex];
        if (!pos) continue;
        const cam = { x: pos.x - vp.width / 2 + shakeX, y: pos.y - vp.height / 2 + shakeY };
        renderViewport(vp.x, vp.y, vp.width, vp.height, cam, state, vp.playerIndex);
      }
      drawViewportDividers(ctx, numPlayers, W, H);

      // Build mode preview
      if (state.buildMode) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(W/2 - 150, 10, 300, 40);
        ctx.fillStyle = '#fff'; ctx.font = '14px Orbitron'; ctx.textAlign = 'center';
        ctx.fillText(`BUILD: ${state.buildMode} [E]=place [Shift]=rotate [Esc]=cancel`, W/2, 35);
      }

      // Announcements
      if (state.announcements && state.announcements.length > 0) {
        const topAnnouncement = state.announcements.reduce((a, b) => b.priority > a.priority ? b : a);
        const alpha = Math.min(1, topAnnouncement.life / 30);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(W/2 - 200, H/4 - 30, 400, 60);
        ctx.strokeStyle = topAnnouncement.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(W/2 - 200, H/4 - 30, 400, 60);
        ctx.fillStyle = topAnnouncement.color;
        ctx.font = 'bold 20px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(topAnnouncement.text, W/2, H/4 + 8);
        ctx.globalAlpha = 1;
      }

      // Event warnings - directional indicators
      if (state.events) {
        state.events.forEach(ev => {
          if (!ev.active || ev.startTime > ev.warningTime) return;
          const pulse = 0.5 + Math.sin(Date.now() * 0.01) * 0.3;
          ctx.globalAlpha = pulse;
          ctx.strokeStyle = '#ff4444';
          ctx.lineWidth = 4;

          ev.directions?.forEach(dir => {
            let x = W/2, y = H/2;
            switch (dir) {
              case 'NORTH': x = W/2; y = 40; break;
              case 'SOUTH': x = W/2; y = H - 40; break;
              case 'EAST': x = W - 40; y = H/2; break;
              case 'WEST': x = 40; y = H/2; break;
              case 'NORTHEAST': x = W - 60; y = 60; break;
              case 'NORTHWEST': x = 60; y = 60; break;
              case 'SOUTHEAST': x = W - 60; y = H - 60; break;
              case 'SOUTHWEST': x = 60; y = H - 60; break;
            }
            ctx.beginPath();
            ctx.arc(x, y, 20, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 12px Orbitron';
            ctx.textAlign = 'center';
            ctx.fillText('!', x, y + 4);
          });
          ctx.globalAlpha = 1;

          // Siege-specific indicators
          if (ev.type === 'SIEGE' && ev.pos) {
            const playerPos = state.playerPositions[0] || { x: 0, y: 0 };
            const evCam = { x: playerPos.x - W / 2, y: playerPos.y - H / 2 };
            const siegeX = ev.pos.x - evCam.x;
            const siegeY = ev.pos.y - evCam.y;
            const pulse = 0.6 + Math.sin(Date.now() * 0.008) * 0.4;

            // Large pulsing circle at siege location
            ctx.strokeStyle = '#ffaa00';
            ctx.lineWidth = 4;
            ctx.globalAlpha = pulse * 0.7;
            ctx.beginPath();
            ctx.arc(siegeX, siegeY, 150 + pulse * 30, 0, Math.PI * 2);
            ctx.stroke();

            // Wave indicator
            if (ev.waveNum && ev.totalWaves) {
              ctx.globalAlpha = 1;
              ctx.fillStyle = '#ffaa00';
              ctx.font = 'bold 16px Orbitron';
              ctx.textAlign = 'center';
              ctx.fillText(`WAVE ${ev.waveNum}/${ev.totalWaves}`, siegeX, siegeY - 180);
            }
          }
        });
      }

      if (shaderRef.current && numPlayers <= 1) {
        const cam = { x: state.playerPositions[0]?.x - W/2 || 0, y: state.playerPositions[0]?.y - H/2 || 0 };
        shaderRef.current.render(cam.x, cam.y);
      }

      // Minimap centered on player
      const mapSize = 120;
      const mapMargin = 15;
      const mapCenterX = W - mapSize/2 - mapMargin;
      const mapCenterY = H - mapSize/2 - mapMargin;
      const viewRadius = 1500;
      const mapScale = mapSize / (viewRadius * 2);
      const playerPos = state.playerPositions[0] || { x: 0, y: 0 };

      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#0a1520';
      ctx.beginPath();
      ctx.arc(mapCenterX, mapCenterY, mapSize/2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#334455';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(mapCenterX, mapCenterY, mapSize/2 - 2, 0, Math.PI * 2);
      ctx.clip();

      // town dot
      const townDx = state.town.pos.x - playerPos.x;
      const townDy = state.town.pos.y - playerPos.y;
      if (Math.abs(townDx) < viewRadius && Math.abs(townDy) < viewRadius) {
        ctx.fillStyle = '#aaa';
        ctx.beginPath();
        ctx.arc(mapCenterX + townDx * mapScale, mapCenterY + townDy * mapScale, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // castle dots
      state.factionCastles?.forEach(castle => {
        const dx = castle.pos.x - playerPos.x;
        const dy = castle.pos.y - playerPos.y;
        if (Math.abs(dx) > viewRadius || Math.abs(dy) > viewRadius) return;
        const cx = mapCenterX + dx * mapScale;
        const cy = mapCenterY + dy * mapScale;
        ctx.fillStyle = castle.faction === 'BLUE' ? '#4dc3ff' : '#ff4444';
        ctx.fillRect(cx - 3, cy - 3, 6, 6);
        if (castle.siegeActive) {
          ctx.strokeStyle = '#ffaa00';
          ctx.lineWidth = 1;
          ctx.strokeRect(cx - 5, cy - 5, 10, 10);
        }
      });

      // player dots
      state.playerPositions.forEach((pos, i) => {
        if (state.players[i]?.isDead) return;
        const dx = pos.x - playerPos.x;
        const dy = pos.y - playerPos.y;
        ctx.fillStyle = state.players[i].color;
        ctx.beginPath();
        ctx.arc(mapCenterX + dx * mapScale, mapCenterY + dy * mapScale, i === 0 ? 5 : 4, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();

      // Friend direction arrows (per viewport for multiplayer)
      if (numPlayers > 1) {
        const arrowLen = 12;
        const arrowDist = 50;
        const friendViewports = calculateViewports(numPlayers, W, H);

        for (let i = 0; i < numPlayers; i++) {
          const myPos = state.playerPositions[i];
          if (!myPos || state.players[i]?.isDead) continue;

          const vp = friendViewports.find(v => v.playerIndex === i);
          if (!vp) continue;
          const vx = vp.x, vy = vp.y, vw = vp.width, vh = vp.height;

          const cam = { x: myPos.x - vw/2, y: myPos.y - vh/2 };

          for (let j = 0; j < numPlayers; j++) {
            if (i === j) continue;
            const friendPos = state.playerPositions[j];
            if (!friendPos || state.players[j]?.isDead) continue;

            // check if friend is off-screen for this player's viewport
            const screenX = friendPos.x - cam.x;
            const screenY = friendPos.y - cam.y;
            const margin = 60;

            if (screenX < -margin || screenX > vw + margin || screenY < -margin || screenY > vh + margin) {
              // friend is off-screen, draw arrow
              const dx = friendPos.x - myPos.x;
              const dy = friendPos.y - myPos.y;
              const ang = Math.atan2(dy, dx);

              // position arrow at edge of viewport
              const centerX = vx + vw / 2;
              const centerY = vy + vh / 2;
              const edgeX = centerX + Math.cos(ang) * arrowDist;
              const edgeY = centerY + Math.sin(ang) * arrowDist;

              ctx.save();
              ctx.translate(edgeX, edgeY);
              ctx.rotate(ang);

              // arrow shape
              ctx.fillStyle = state.players[j].color;
              ctx.beginPath();
              ctx.moveTo(arrowLen, 0);
              ctx.lineTo(-arrowLen/2, -arrowLen/2);
              ctx.lineTo(-arrowLen/3, 0);
              ctx.lineTo(-arrowLen/2, arrowLen/2);
              ctx.closePath();
              ctx.fill();

              ctx.restore();
            }
          }
        }
      }

      animationId = requestAnimationFrame(render);
    };
    render(); return () => cancelAnimationFrame(animationId);
  }, [engine, assetsLoaded, canvasSize]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <canvas ref={canvasRef} width={canvasSize.w} height={canvasSize.h} className="block bg-black" style={{ width: '100vw', height: '100vh' }} />
    </div>
  );
};
