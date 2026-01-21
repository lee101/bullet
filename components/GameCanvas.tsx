
import React, { useRef, useEffect, useState } from 'react';
import { PLAYER_RADIUS, ELEMENT_COLORS, ENEMY_TYPES, BIOME_COLORS, TOWN_RADIUS, WORLD_WIDTH, WORLD_HEIGHT, MOUNT_CONFIGS, updateCanvasSize, WALL_CONFIGS, BUILD_GRID_SIZE, CITY_STYLES, CITY_HEAL_COOLDOWN } from '../constants';
import { GameEngine } from '../engine/GameEngine';
import { assetManager } from '../engine/AssetManager';
import { ShaderManager } from '../engine/ShaderManager';
import { ElementType, CityStyle } from '../types';
import { FEATURE_COLORS, blendBiomeColors, TerrainFeature } from '../engine/TerrainTiles';

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
    assetManager.load().then(() => setAssetsLoaded(true));
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
      ctx.translate(vx, vy);

      ctx.fillStyle = BIOME_COLORS.SEA;
      ctx.fillRect(0, 0, vw, vh);

      const world = state.world;
      const tileSize = world.gridSize;
      const startTileX = Math.floor(cam.x / tileSize);
      const startTileY = Math.floor(cam.y / tileSize);
      const tilesAcross = Math.ceil(vw / tileSize) + 1;
      const tilesDown = Math.ceil(vh / tileSize) + 1;

      // Render terrain tiles with transitions and features
      const featuresToDraw: { x: number; y: number; type: TerrainFeature; size: number }[] = [];

      for (let x = startTileX; x < startTileX + tilesAcross; x++) {
        for (let y = startTileY; y < startTileY + tilesDown; y++) {
          const worldX = x * tileSize;
          const worldY = y * tileSize;
          const tile = world.getTileAt(worldX, worldY);

          if (tile.biome === 'SEA') continue;

          const screenX = worldX - cam.x;
          const screenY = worldY - cam.y;

          // Base biome color
          ctx.fillStyle = BIOME_COLORS[tile.biome as keyof typeof BIOME_COLORS];
          ctx.fillRect(screenX, screenY, tileSize + 1, tileSize + 1);

          // Edge transitions - blend with neighbors
          if (tile.edgeCode > 0) {
            ctx.globalAlpha = 0.3;
            if (tile.neighbors.n !== tile.biome && tile.neighbors.n !== 'SEA') {
              const grad = ctx.createLinearGradient(screenX, screenY, screenX, screenY + tileSize * 0.3);
              grad.addColorStop(0, BIOME_COLORS[tile.neighbors.n as keyof typeof BIOME_COLORS]);
              grad.addColorStop(1, 'transparent');
              ctx.fillStyle = grad;
              ctx.fillRect(screenX, screenY, tileSize, tileSize * 0.3);
            }
            if (tile.neighbors.s !== tile.biome && tile.neighbors.s !== 'SEA') {
              const grad = ctx.createLinearGradient(screenX, screenY + tileSize, screenX, screenY + tileSize * 0.7);
              grad.addColorStop(0, BIOME_COLORS[tile.neighbors.s as keyof typeof BIOME_COLORS]);
              grad.addColorStop(1, 'transparent');
              ctx.fillStyle = grad;
              ctx.fillRect(screenX, screenY + tileSize * 0.7, tileSize, tileSize * 0.3);
            }
            ctx.globalAlpha = 1;
          }

          // Collect features to draw on top
          for (const feat of tile.features) {
            const size = feat.type.includes('TREE') ? 28 : feat.type.includes('ROCK') || feat.type.includes('BOULDER') ? 18 : 12;
            featuresToDraw.push({
              x: worldX + feat.x,
              y: worldY + feat.y,
              type: feat.type,
              size
            });
          }
        }
      }

      ctx.save(); ctx.translate(-cam.x, -cam.y);

      // Draw terrain features
      for (const feat of featuresToDraw) {
        const color = FEATURE_COLORS[feat.type];
        if (!color) continue;

        ctx.fillStyle = color;
        if (feat.type.includes('TREE')) {
          // Tree: trunk + canopy
          ctx.fillStyle = '#4a3a2a';
          ctx.fillRect(feat.x - 3, feat.y - 2, 6, 8);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(feat.x, feat.y - 8, feat.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (feat.type.includes('ROCK') || feat.type === 'BOULDER') {
          ctx.beginPath();
          ctx.ellipse(feat.x, feat.y, feat.size / 2, feat.size / 3, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (feat.type === 'FLOWERS' || feat.type === 'MUSHROOMS') {
          for (let i = 0; i < 4; i++) {
            const ox = (Math.sin(i * 1.5 + feat.x) * 6);
            const oy = (Math.cos(i * 1.5 + feat.y) * 6);
            ctx.beginPath();
            ctx.arc(feat.x + ox, feat.y + oy, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (feat.type.includes('RUINS')) {
          ctx.fillRect(feat.x - feat.size / 2, feat.y - feat.size / 2, feat.size, feat.size);
        } else if (feat.type === 'TALL_GRASS' || feat.type === 'REEDS') {
          for (let i = 0; i < 5; i++) {
            const ox = (i - 2) * 3;
            ctx.fillRect(feat.x + ox, feat.y - 8, 2, 10);
          }
        } else {
          ctx.beginPath();
          ctx.arc(feat.x, feat.y, feat.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const fireViewMargin = 200;
      state.fireAreas.forEach(fa => {
          if (fa.pos.x < cam.x - fireViewMargin || fa.pos.x > cam.x + vw + fireViewMargin ||
              fa.pos.y < cam.y - fireViewMargin || fa.pos.y > cam.y + vh + fireViewMargin) return;
          const pulse = 0.9 + Math.sin(Date.now() * 0.005) * 0.1;
          const gradient = ctx.createRadialGradient(fa.pos.x, fa.pos.y, 0, fa.pos.x, fa.pos.y, fa.radius);
          gradient.addColorStop(0, 'rgba(255, 100, 0, 0.85)');
          gradient.addColorStop(0.4, 'rgba(255, 30, 0, 0.6)');
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = gradient;
          ctx.beginPath(); ctx.arc(fa.pos.x, fa.pos.y, fa.radius * pulse, 0, Math.PI*2); ctx.fill();
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
            else { ctx.shadowBlur = 10; ctx.shadowColor = cfg.color; ctx.beginPath(); ctx.arc(0, 0, 32, 0, Math.PI*2); ctx.fill(); }
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
          if (e.slowTimer > 0 || e.burnTimer > 0 || e.poisonTimer > 0) ctx.globalAlpha = 0.7;
          if (!drawImage(enemyImg, e.pos.x, e.pos.y, size, e.angle)) {
            ctx.fillStyle = ENEMY_TYPES[e.type].color;
            if (e.slowTimer > 0) ctx.fillStyle = '#4dffff';
            if (e.burnTimer > 0) ctx.fillStyle = '#ff4d4d';
            if (e.poisonTimer > 0) ctx.fillStyle = '#a020f0';
            ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.radius, 0, Math.PI*2); ctx.fill();
          }
          ctx.globalAlpha = 1;
          if (e.slowTimer > 0) { ctx.strokeStyle = '#4dffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.radius + 3, 0, Math.PI*2); ctx.stroke(); }
          if (e.burnTimer > 0) { ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.radius + 5, 0, Math.PI*2); ctx.stroke(); }
          ctx.fillStyle = '#333'; ctx.fillRect(e.pos.x - 12, e.pos.y - e.radius - 10, 24, 4);
          ctx.fillStyle = '#f00'; ctx.fillRect(e.pos.x - 11, e.pos.y - e.radius - 9, 22 * (e.hp / e.maxHp), 2);
      });

      state.coins.forEach(c => {
          if (c.pos.x < viewLeft || c.pos.x > viewRight || c.pos.y < viewTop || c.pos.y > viewBottom) return;
          const coinImg = assetManager.getItem('coin');
          if (!drawImage(coinImg, c.pos.x, c.pos.y, 24)) {
            ctx.fillStyle = '#ffd700'; ctx.beginPath(); ctx.arc(c.pos.x, c.pos.y, 8, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#aa8800'; ctx.beginPath(); ctx.arc(c.pos.x - 2, c.pos.y - 2, 3, 0, Math.PI*2); ctx.fill();
          }
      });

      state.bullets.forEach(b => {
        if (b.pos.x < viewLeft || b.pos.x > viewRight || b.pos.y < viewTop || b.pos.y > viewBottom) return;
        const elementStr = elementToString[b.element];
        const bulletImg = assetManager.getProjectile(elementStr);
        const angle = Math.atan2(b.vel.y, b.vel.x);
        if (!drawImage(bulletImg, b.pos.x, b.pos.y, b.radius * 3, angle)) {
          ctx.fillStyle = ELEMENT_COLORS[b.element];
          ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI*2); ctx.fill();
        }
      });

      state.particles.forEach(p => {
        ctx.globalAlpha = p.life / p.maxLife;
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
      });

      // Render campfires
      state.campfires?.forEach(cf => {
        if (cf.pos.x < viewLeft - 80 || cf.pos.x > viewRight + 80 || cf.pos.y < viewTop - 80 || cf.pos.y > viewBottom + 80) return;
        // Glow effect
        const pulse = 0.8 + Math.sin(Date.now() * 0.004) * 0.2;
        const gradient = ctx.createRadialGradient(cf.pos.x, cf.pos.y, 0, cf.pos.x, cf.pos.y, cf.radius * pulse);
        gradient.addColorStop(0, 'rgba(255, 150, 50, 0.6)');
        gradient.addColorStop(0.5, 'rgba(255, 100, 20, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath(); ctx.arc(cf.pos.x, cf.pos.y, cf.radius * pulse, 0, Math.PI*2); ctx.fill();
        // Fire core
        ctx.fillStyle = '#ff6600';
        ctx.beginPath(); ctx.arc(cf.pos.x, cf.pos.y, 12, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ffaa00';
        ctx.beginPath(); ctx.arc(cf.pos.x, cf.pos.y - 5, 8, 0, Math.PI*2); ctx.fill();
        // Logs
        ctx.fillStyle = '#4a3020';
        ctx.fillRect(cf.pos.x - 15, cf.pos.y + 5, 12, 4);
        ctx.fillRect(cf.pos.x + 3, cf.pos.y + 5, 12, 4);
      });

      // Render all towns with varied styles
      state.towns?.forEach(town => {
        if (town.pos.x < viewLeft - 150 || town.pos.x > viewRight + 150 || town.pos.y < viewTop - 150 || town.pos.y > viewBottom + 150) return;
        const style = CITY_STYLES[town.style] || CITY_STYLES.MEDIEVAL;
        // Draw city base
        ctx.fillStyle = style.color;
        ctx.beginPath(); ctx.arc(town.pos.x, town.pos.y, 70, 0, Math.PI*2); ctx.fill();
        // Draw accent buildings/features based on style
        ctx.fillStyle = style.accent;
        if (town.style === 'MEDIEVAL') {
          ctx.fillRect(town.pos.x - 25, town.pos.y - 40, 20, 50);
          ctx.fillRect(town.pos.x + 5, town.pos.y - 35, 20, 45);
          ctx.beginPath(); ctx.moveTo(town.pos.x - 25, town.pos.y - 40); ctx.lineTo(town.pos.x - 15, town.pos.y - 55); ctx.lineTo(town.pos.x - 5, town.pos.y - 40); ctx.fill();
        } else if (town.style === 'DESERT') {
          ctx.beginPath(); ctx.arc(town.pos.x, town.pos.y - 20, 30, Math.PI, 0); ctx.fill();
          ctx.fillRect(town.pos.x + 25, town.pos.y - 50, 8, 40);
        } else if (town.style === 'ASIAN') {
          for (let i = 0; i < 3; i++) {
            ctx.fillRect(town.pos.x - 30, town.pos.y - 20 - i * 15, 60 - i * 15, 8);
          }
        } else if (town.style === 'NORDIC') {
          ctx.beginPath(); ctx.moveTo(town.pos.x - 35, town.pos.y); ctx.lineTo(town.pos.x, town.pos.y - 50); ctx.lineTo(town.pos.x + 35, town.pos.y); ctx.fill();
        } else if (town.style === 'ELVEN') {
          ctx.beginPath(); ctx.arc(town.pos.x - 20, town.pos.y - 25, 20, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(town.pos.x + 20, town.pos.y - 20, 18, 0, Math.PI*2); ctx.fill();
        } else if (town.style === 'DWARVEN') {
          ctx.fillRect(town.pos.x - 30, town.pos.y - 10, 60, 25);
          ctx.fillStyle = '#222';
          ctx.fillRect(town.pos.x - 15, town.pos.y - 5, 30, 20);
        }
        // Town name and shop prompt
        ctx.fillStyle = 'white'; ctx.font = '12px Orbitron'; ctx.textAlign = 'center';
        ctx.fillText(town.name, town.pos.x, town.pos.y - 80);
        ctx.fillText(`[${getButtonPrompt('interact')}] SHOP`, town.pos.x, town.pos.y - 65);
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

      if (numPlayers <= 1) {
        const cam = { x: state.playerPositions[0]?.x - W/2 || state.camera.x, y: state.playerPositions[0]?.y - H/2 || state.camera.y };
        renderViewport(0, 0, W, H, cam, state, 0);
      } else {
        const hw = W / 2, hh = H / 2;
        const viewports = [
          { x: 0, y: 0, w: hw - 1, h: hh - 1 },
          { x: hw + 1, y: 0, w: hw - 1, h: hh - 1 },
          { x: 0, y: hh + 1, w: hw - 1, h: hh - 1 },
          { x: hw + 1, y: hh + 1, w: hw - 1, h: hh - 1 },
        ];
        for (let i = 0; i < Math.min(numPlayers, 4); i++) {
          const v = viewports[i];
          const pos = state.playerPositions[i];
          if (!pos) continue;
          const cam = { x: pos.x - v.w/2, y: pos.y - v.h/2 };
          renderViewport(v.x, v.y, v.w, v.h, cam, state, i);
        }
        ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(hw, 0); ctx.lineTo(hw, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, hh); ctx.lineTo(W, hh); ctx.stroke();
      }

      ctx.fillStyle = fps >= 55 ? 'rgba(0,255,0,0.7)' : fps >= 30 ? 'rgba(255,255,0,0.7)' : 'rgba(255,0,0,0.9)';
      ctx.font = '12px monospace';
      ctx.fillText(`FPS: ${fps} | Players: ${numPlayers} | Pos: ${state.playerPositions.length}`, 10, 20);

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
        });
      }

      if (shaderRef.current && numPlayers <= 1) {
        const cam = { x: state.playerPositions[0]?.x - W/2 || 0, y: state.playerPositions[0]?.y - H/2 || 0 };
        shaderRef.current.render(cam.x, cam.y);
      }

      // Minimap with friend direction arrows
      const mapSize = 120;
      const mapMargin = 15;
      const mapX = W - mapSize - mapMargin;
      const mapY = H - mapSize - mapMargin;
      const mapScale = mapSize / Math.max(WORLD_WIDTH, WORLD_HEIGHT);

      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#0a1520';
      ctx.beginPath();
      ctx.arc(mapX + mapSize/2, mapY + mapSize/2, mapSize/2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#334455';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // clip to circle
      ctx.beginPath();
      ctx.arc(mapX + mapSize/2, mapY + mapSize/2, mapSize/2 - 2, 0, Math.PI * 2);
      ctx.clip();

      // town dot
      const townMx = mapX + state.town.pos.x * mapScale;
      const townMy = mapY + state.town.pos.y * mapScale;
      ctx.fillStyle = '#aaa';
      ctx.beginPath();
      ctx.arc(townMx, townMy, 4, 0, Math.PI * 2);
      ctx.fill();

      // player dots
      state.playerPositions.forEach((pos, i) => {
        if (state.players[i]?.isDead) return;
        const px = mapX + pos.x * mapScale;
        const py = mapY + pos.y * mapScale;
        ctx.fillStyle = state.players[i].color;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();

      // Friend direction arrows (per viewport for multiplayer)
      if (numPlayers > 1) {
        const arrowLen = 12;
        const arrowDist = 50;

        for (let i = 0; i < numPlayers; i++) {
          const myPos = state.playerPositions[i];
          if (!myPos || state.players[i]?.isDead) continue;

          // viewport bounds for this player
          let vx = 0, vy = 0, vw = W, vh = H;
          if (numPlayers > 1) {
            const hw = W / 2, hh = H / 2;
            const viewports = [
              { x: 0, y: 0, w: hw - 1, h: hh - 1 },
              { x: hw + 1, y: 0, w: hw - 1, h: hh - 1 },
              { x: 0, y: hh + 1, w: hw - 1, h: hh - 1 },
              { x: hw + 1, y: hh + 1, w: hw - 1, h: hh - 1 },
            ];
            const v = viewports[i];
            vx = v.x; vy = v.y; vw = v.w; vh = v.h;
          }

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
