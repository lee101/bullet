
import React, { useRef, useEffect } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_RADIUS, ELEMENT_COLORS, ENEMY_TYPES, BIOME_COLORS, TOWN_RADIUS, WORLD_WIDTH, WORLD_HEIGHT, MOUNT_CONFIGS } from '../constants';
import { GameEngine } from '../engine/GameEngine';

interface GameCanvasProps { engine: GameEngine; }

// Expose FPS for e2e testing
declare global {
  interface Window {
    __GAME_FPS__: number;
    __GAME_FPS_SAMPLES__: number[];
  }
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ engine }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let animationId: number;
    let lastTime = performance.now();
    let frameCount = 0;
    let fps = 60;
    window.__GAME_FPS_SAMPLES__ = [];

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

      // Mounts (viewport culled, no vision cones)
      const viewMargin = 100;
      const viewLeft = cam.x - viewMargin;
      const viewRight = cam.x + CANVAS_WIDTH + viewMargin;
      const viewTop = cam.y - viewMargin;
      const viewBottom = cam.y + CANVAS_HEIGHT + viewMargin;

      state.mounts.forEach(m => {
          if (m.pos.x < viewLeft || m.pos.x > viewRight || m.pos.y < viewTop || m.pos.y > viewBottom) return;
          const cfg = MOUNT_CONFIGS[m.type as keyof typeof MOUNT_CONFIGS];
          ctx.save(); ctx.translate(m.pos.x, m.pos.y); ctx.rotate(m.angle);
          ctx.fillStyle = cfg.color;
          if (m.type === 'HORSE') ctx.ellipse(0, 0, 24, 14, 0, 0, Math.PI*2);
          else if (m.type === 'CHARIOT') ctx.fillRect(-25, -18, 50, 36);
          else { ctx.shadowBlur = 10; ctx.shadowColor = cfg.color; ctx.arc(0, 0, 32, 0, Math.PI*2); }
          ctx.fill(); ctx.restore();
      });

      // Wandering Traders (viewport culled)
      state.traders.forEach(tr => {
          if (tr.pos.x < viewLeft || tr.pos.x > viewRight || tr.pos.y < viewTop || tr.pos.y > viewBottom) return;
          ctx.save(); ctx.translate(tr.pos.x, tr.pos.y); ctx.rotate(tr.angle);
          ctx.fillStyle = '#ffaa00'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#444'; ctx.fillRect(-10, -25, 20, 50);
          ctx.restore();
          ctx.fillStyle = 'white'; ctx.font = '10px Orbitron'; ctx.textAlign = 'center';
          ctx.fillText('TRADER [X]', tr.pos.x, tr.pos.y - 35);
      });

      // Enemies (viewport culled)
      state.enemies.forEach(e => {
          if (e.pos.x < viewLeft - e.radius || e.pos.x > viewRight + e.radius ||
              e.pos.y < viewTop - e.radius || e.pos.y > viewBottom + e.radius) return;
          ctx.fillStyle = ENEMY_TYPES[e.type].color;
          if (e.slowTimer > 0) ctx.fillStyle = '#4dffff';
          if (e.burnTimer > 0) ctx.fillStyle = '#ff4d4d';
          if (e.poisonTimer > 0) ctx.fillStyle = '#a020f0';
          ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.radius, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#f00'; ctx.fillRect(e.pos.x - 10, e.pos.y - e.radius - 8, 20 * (e.hp / e.maxHp), 2);
      });

      // Bullets (viewport culled)
      state.bullets.forEach(b => {
        if (b.pos.x < viewLeft || b.pos.x > viewRight || b.pos.y < viewTop || b.pos.y > viewBottom) return;
        ctx.fillStyle = ELEMENT_COLORS[b.element];
        ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, b.radius, 0, Math.PI*2); ctx.fill();
      });

      // Players
      state.players.forEach((p, i) => {
        const pos = state.playerPositions[i];
        if (p.isDead) return;
        if (p.mount) {
            const cfg = MOUNT_CONFIGS[p.mount];
            ctx.fillStyle = cfg.color;
            if (p.mount === 'HORSE') { ctx.beginPath(); ctx.ellipse(pos.x, pos.y, 32, 18, 0, 0, Math.PI*2); ctx.fill(); }
            else if (p.mount === 'DRAGON') {
                const flap = Math.sin(Date.now() * 0.008) * 0.35;
                ctx.beginPath(); ctx.arc(pos.x, pos.y, 45, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(pos.x - 45, pos.y, 40, 12, flap, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.ellipse(pos.x + 45, pos.y, 40, 12, -flap, 0, Math.PI*2); ctx.fill();
            } else { ctx.fillRect(pos.x - 35, pos.y - 22, 70, 44); }
        }
        const renderY = pos.y - p.z - (p.mount ? 10 : 0);
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(pos.x, renderY, PLAYER_RADIUS, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(pos.x - 3, renderY - 3, 3, 0, Math.PI*2); ctx.fill();
      });

      ctx.restore();

      // FPS display (top-left, small)
      ctx.fillStyle = fps >= 55 ? 'rgba(0,255,0,0.7)' : fps >= 30 ? 'rgba(255,255,0,0.7)' : 'rgba(255,0,0,0.9)';
      ctx.font = '12px monospace';
      ctx.fillText(`FPS: ${fps}`, 10, 20);

      animationId = requestAnimationFrame(render);
    };
    render(); return () => cancelAnimationFrame(animationId);
  }, [engine]);

  return <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="w-full h-full bg-black" />;
};
