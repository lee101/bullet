
import React, { useRef, useEffect, useState } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_RADIUS, ELEMENT_COLORS, ENEMY_TYPES, BIOME_COLORS, TOWN_RADIUS, WORLD_WIDTH, WORLD_HEIGHT, MOUNT_CONFIGS } from '../constants';
import { GameEngine } from '../engine/GameEngine';
import { assetManager } from '../engine/AssetManager';
import { ElementType } from '../types';

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
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  // Load assets on mount
  useEffect(() => {
    assetManager.load().then(() => setAssetsLoaded(true));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let animationId: number;
    let lastTime = performance.now();
    let frameCount = 0;
    let fps = 60;
    window.__GAME_FPS_SAMPLES__ = [];

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

    const render = () => {
      // FPS calculation
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastTime = now;
        window.__GAME_FPS__ = fps;
        window.__GAME_FPS_SAMPLES__.push(fps);
        if (window.__GAME_FPS_SAMPLES__.length > 60) window.__GAME_FPS_SAMPLES__.shift();
      }

      engine.update();
      const state = engine.getDrawState();
      const cam = state.camera;

      ctx.fillStyle = BIOME_COLORS.SEA;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const world = state.world;
      const tileSize = world.gridSize;
      const startTileX = Math.floor(cam.x / tileSize);
      const startTileY = Math.floor(cam.y / tileSize);
      const tilesAcross = Math.ceil(CANVAS_WIDTH / tileSize) + 1;
      const tilesDown = Math.ceil(CANVAS_HEIGHT / tileSize) + 1;

      for (let x = startTileX; x < startTileX + tilesAcross; x++) {
        for (let y = startTileY; y < startTileY + tilesDown; y++) {
          const biome = world.getBiomeAt(x * tileSize, y * tileSize);
          if (biome === 'SEA') continue;
          ctx.fillStyle = BIOME_COLORS[biome as keyof typeof BIOME_COLORS];
          ctx.fillRect(x * tileSize - cam.x, y * tileSize - cam.y, tileSize + 1, tileSize + 1);
        }
      }

      ctx.save(); ctx.translate(-cam.x, -cam.y);

      // Fire Areas (viewport culled)
      const fireViewMargin = 200;
      state.fireAreas.forEach(fa => {
          if (fa.pos.x < cam.x - fireViewMargin || fa.pos.x > cam.x + CANVAS_WIDTH + fireViewMargin ||
              fa.pos.y < cam.y - fireViewMargin || fa.pos.y > cam.y + CANVAS_HEIGHT + fireViewMargin) return;
          const pulse = 0.9 + Math.sin(Date.now() * 0.005) * 0.1;
          const gradient = ctx.createRadialGradient(fa.pos.x, fa.pos.y, 0, fa.pos.x, fa.pos.y, fa.radius);
          gradient.addColorStop(0, 'rgba(255, 100, 0, 0.85)');
          gradient.addColorStop(0.4, 'rgba(255, 30, 0, 0.6)');
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = gradient;
          ctx.beginPath(); ctx.arc(fa.pos.x, fa.pos.y, fa.radius * pulse, 0, Math.PI*2); ctx.fill();
      });

      // Mounts (viewport culled)
      const viewMargin = 100;
      const viewLeft = cam.x - viewMargin;
      const viewRight = cam.x + CANVAS_WIDTH + viewMargin;
      const viewTop = cam.y - viewMargin;
      const viewBottom = cam.y + CANVAS_HEIGHT + viewMargin;

      state.mounts.forEach(m => {
          if (m.pos.x < viewLeft || m.pos.x > viewRight || m.pos.y < viewTop || m.pos.y > viewBottom) return;
          const mountImg = assetManager.getMount(m.type);
          const size = m.type === 'DRAGON' ? 80 : m.type === 'CHARIOT' ? 64 : m.type === 'BOAT' ? 56 : 48;
          if (!drawImage(mountImg, m.pos.x, m.pos.y, size, m.angle)) {
            // Fallback to shapes
            const cfg = MOUNT_CONFIGS[m.type as keyof typeof MOUNT_CONFIGS];
            ctx.save(); ctx.translate(m.pos.x, m.pos.y); ctx.rotate(m.angle);
            ctx.fillStyle = cfg.color;
            if (m.type === 'HORSE') { ctx.beginPath(); ctx.ellipse(0, 0, 24, 14, 0, 0, Math.PI*2); ctx.fill(); }
            else if (m.type === 'CHARIOT') ctx.fillRect(-25, -18, 50, 36);
            else if (m.type === 'BOAT') {
              // Boat shape
              ctx.beginPath();
              ctx.moveTo(-28, 8); ctx.lineTo(-20, -12); ctx.lineTo(28, -12);
              ctx.lineTo(32, 8); ctx.lineTo(-28, 8);
              ctx.fill();
              ctx.fillStyle = '#8B4513';
              ctx.fillRect(-5, -25, 4, 20); // Mast
            }
            else { ctx.shadowBlur = 10; ctx.shadowColor = cfg.color; ctx.beginPath(); ctx.arc(0, 0, 32, 0, Math.PI*2); ctx.fill(); }
            ctx.restore();
          }
      });

      // Wandering Traders (viewport culled)
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

      // Enemies (viewport culled)
      state.enemies.forEach(e => {
          if (e.pos.x < viewLeft - e.radius || e.pos.x > viewRight + e.radius ||
              e.pos.y < viewTop - e.radius || e.pos.y > viewBottom + e.radius) return;

          const enemyImg = assetManager.getEnemy(e.type);
          const size = e.radius * 2.5;

          // Apply status effect tint
          if (e.slowTimer > 0 || e.burnTimer > 0 || e.poisonTimer > 0) {
            ctx.globalAlpha = 0.7;
          }

          if (!drawImage(enemyImg, e.pos.x, e.pos.y, size, e.angle)) {
            // Fallback to shapes
            ctx.fillStyle = ENEMY_TYPES[e.type].color;
            if (e.slowTimer > 0) ctx.fillStyle = '#4dffff';
            if (e.burnTimer > 0) ctx.fillStyle = '#ff4d4d';
            if (e.poisonTimer > 0) ctx.fillStyle = '#a020f0';
            ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.radius, 0, Math.PI*2); ctx.fill();
          }

          ctx.globalAlpha = 1;

          // Status effect overlay
          if (e.slowTimer > 0) {
            ctx.strokeStyle = '#4dffff';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.radius + 3, 0, Math.PI*2); ctx.stroke();
          }
          if (e.burnTimer > 0) {
            ctx.strokeStyle = '#ff4d4d';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.radius + 5, 0, Math.PI*2); ctx.stroke();
          }

          // HP bar
          ctx.fillStyle = '#333'; ctx.fillRect(e.pos.x - 12, e.pos.y - e.radius - 10, 24, 4);
          ctx.fillStyle = '#f00'; ctx.fillRect(e.pos.x - 11, e.pos.y - e.radius - 9, 22 * (e.hp / e.maxHp), 2);
      });

      // Coins (viewport culled)
      state.coins.forEach(c => {
          if (c.pos.x < viewLeft || c.pos.x > viewRight || c.pos.y < viewTop || c.pos.y > viewBottom) return;
          const coinImg = assetManager.getItem('coin');
          if (!drawImage(coinImg, c.pos.x, c.pos.y, 24)) {
            ctx.fillStyle = '#ffd700';
            ctx.beginPath(); ctx.arc(c.pos.x, c.pos.y, 8, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#aa8800';
            ctx.beginPath(); ctx.arc(c.pos.x - 2, c.pos.y - 2, 3, 0, Math.PI*2); ctx.fill();
          }
      });

      // Bullets (viewport culled)
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

      // Particles
      state.particles.forEach(p => {
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI*2); ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Damage numbers
      state.damageNumbers.forEach(dn => {
        ctx.globalAlpha = dn.life / dn.maxLife;
        ctx.fillStyle = dn.color;
        ctx.font = dn.isCrit ? 'bold 16px Orbitron' : '12px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(dn.value.toString(), dn.pos.x, dn.pos.y);
      });
      ctx.globalAlpha = 1;

      // Players
      state.players.forEach((p, i) => {
        const pos = state.playerPositions[i];
        if (p.isDead) return;

        // Draw mount if riding
        if (p.mount) {
          const mountImg = assetManager.getMount(p.mount);
          const mountSize = p.mount === 'DRAGON' ? 100 : p.mount === 'CHARIOT' ? 80 : p.mount === 'BOAT' ? 70 : 64;
          if (!drawImage(mountImg, pos.x, pos.y, mountSize)) {
            const cfg = MOUNT_CONFIGS[p.mount];
            ctx.fillStyle = cfg.color;
            if (p.mount === 'HORSE') { ctx.beginPath(); ctx.ellipse(pos.x, pos.y, 32, 18, 0, 0, Math.PI*2); ctx.fill(); }
            else if (p.mount === 'DRAGON') {
                const flap = Math.sin(Date.now() * 0.008) * 0.35;
                ctx.beginPath(); ctx.arc(pos.x, pos.y, 45, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(pos.x - 45, pos.y, 40, 12, flap, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(pos.x + 45, pos.y, 40, 12, -flap, 0, Math.PI*2); ctx.fill();
            } else if (p.mount === 'BOAT') {
                ctx.beginPath();
                ctx.moveTo(pos.x - 35, pos.y + 10); ctx.lineTo(pos.x - 25, pos.y - 15);
                ctx.lineTo(pos.x + 35, pos.y - 15); ctx.lineTo(pos.x + 40, pos.y + 10);
                ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#8B4513';
                ctx.fillRect(pos.x - 3, pos.y - 35, 6, 25);
            } else { ctx.fillRect(pos.x - 35, pos.y - 22, 70, 44); }
          }
        }

        // Draw player
        const renderY = pos.y - p.z - (p.mount ? 10 : 0);
        const playerImg = assetManager.getPlayer(i);
        if (!drawImage(playerImg, pos.x, renderY, PLAYER_RADIUS * 3)) {
          ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(pos.x, renderY, PLAYER_RADIUS, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(pos.x - 3, renderY - 3, 3, 0, Math.PI*2); ctx.fill();
        }

        // Blocking indicator
        if (p.isBlocking) {
          ctx.strokeStyle = '#4df';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(pos.x, renderY, PLAYER_RADIUS + 8, 0, Math.PI*2); ctx.stroke();
        }
      });

      // Town
      const townImg = assetManager.getNPC('town');
      if (!drawImage(townImg, state.town.pos.x, state.town.pos.y, 120)) {
        ctx.fillStyle = BIOME_COLORS.TOWN;
        ctx.beginPath(); ctx.arc(state.town.pos.x, state.town.pos.y, 60, 0, Math.PI*2); ctx.fill();
      }
      ctx.fillStyle = 'white'; ctx.font = '12px Orbitron'; ctx.textAlign = 'center';
      ctx.fillText(state.town.name, state.town.pos.x, state.town.pos.y - 70);
      ctx.fillText(`[${getButtonPrompt('interact')}] SHOP`, state.town.pos.x, state.town.pos.y - 55);

      ctx.restore();

      // FPS display (top-left, small)
      ctx.fillStyle = fps >= 55 ? 'rgba(0,255,0,0.7)' : fps >= 30 ? 'rgba(255,255,0,0.7)' : 'rgba(255,0,0,0.9)';
      ctx.font = '12px monospace';
      ctx.fillText(`FPS: ${fps}`, 10, 20);

      animationId = requestAnimationFrame(render);
    };
    render(); return () => cancelAnimationFrame(animationId);
  }, [engine, assetsLoaded]);

  return <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="w-full h-full bg-black" />;
};
