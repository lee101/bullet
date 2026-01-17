
import React, { useRef, useEffect } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_RADIUS, ELEMENT_COLORS, ENEMY_TYPES, BIOME_COLORS, TOWN_RADIUS, WORLD_WIDTH, WORLD_HEIGHT, MOUNT_CONFIGS } from '../constants';
import { GameEngine } from '../engine/GameEngine';

interface GameCanvasProps { engine: GameEngine; }

export const GameCanvas: React.FC<GameCanvasProps> = ({ engine }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let animationId: number;

    const render = () => {
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

      // Fire Areas (Lingering Heat Shader Style)
      state.fireAreas.forEach(fa => {
          const pulse = 0.9 + Math.sin(Date.now() * 0.005) * 0.1;
          const gradient = ctx.createRadialGradient(fa.pos.x, fa.pos.y, 0, fa.pos.x, fa.pos.y, fa.radius);
          gradient.addColorStop(0, 'rgba(255, 100, 0, 0.85)');
          gradient.addColorStop(0.4, 'rgba(255, 30, 0, 0.6)');
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = gradient;
          ctx.beginPath(); ctx.arc(fa.pos.x, fa.pos.y, fa.radius * pulse, 0, Math.PI*2); ctx.fill();
      });

      // Mounts & Vision Cones (Mostly Opaque Light colored)
      state.mounts.forEach(m => {
          if (m.type === 'HORSE') {
              ctx.save();
              const coneRadius = 450;
              const coneAngle = 1.1; // ~60 degrees
              
              // Light colored, mostly opaque shader-like fill
              ctx.fillStyle = m.alerted ? 'rgba(255, 100, 100, 0.35)' : 'rgba(255, 255, 255, 0.35)';
              ctx.beginPath();
              ctx.moveTo(m.pos.x, m.pos.y);
              
              // LOS occlusion simulation
              for (let a = m.angle - coneAngle/2; a <= m.angle + coneAngle/2; a += 0.05) {
                  let r = coneRadius;
                  for (let d = 40; d < coneRadius; d += 40) {
                      const tx = m.pos.x + Math.cos(a) * d;
                      const ty = m.pos.y + Math.sin(a) * d;
                      if (world.getBiomeAt(tx, ty) === 'MOUNTAIN') { r = d; break; }
                  }
                  ctx.lineTo(m.pos.x + Math.cos(a) * r, m.pos.y + Math.sin(a) * r);
              }
              ctx.lineTo(m.pos.x, m.pos.y);
              ctx.fill();
              ctx.restore();
          }

          const cfg = MOUNT_CONFIGS[m.type as keyof typeof MOUNT_CONFIGS];
          ctx.save(); ctx.translate(m.pos.x, m.pos.y); ctx.rotate(m.angle);
          ctx.fillStyle = cfg.color;
          if (m.type === 'HORSE') ctx.ellipse(0, 0, 24, 14, 0, 0, Math.PI*2);
          else if (m.type === 'CHARIOT') ctx.fillRect(-25, -18, 50, 36);
          else { ctx.shadowBlur = 10; ctx.shadowColor = cfg.color; ctx.arc(0, 0, 32, 0, Math.PI*2); }
          ctx.fill(); ctx.restore();
      });

      // Wandering Traders
      state.traders.forEach(tr => {
          ctx.save(); ctx.translate(tr.pos.x, tr.pos.y); ctx.rotate(tr.angle);
          ctx.fillStyle = '#ffaa00'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#444'; ctx.fillRect(-10, -25, 20, 50); // Backpack
          ctx.restore();
          // Tooltip/Indicator
          ctx.fillStyle = 'white'; ctx.font = '10px Orbitron'; ctx.textAlign = 'center';
          ctx.fillText('TRADER [X]', tr.pos.x, tr.pos.y - 35);
      });

      // Enemies
      state.enemies.forEach(e => {
          ctx.fillStyle = ENEMY_TYPES[e.type].color; 
          if (e.slowTimer > 0) ctx.fillStyle = '#4dffff';
          if (e.burnTimer > 0) ctx.fillStyle = '#ff4d4d';
          if (e.poisonTimer > 0) ctx.fillStyle = '#a020f0';
          ctx.beginPath(); ctx.arc(e.pos.x, e.pos.y, e.radius, 0, Math.PI*2); ctx.fill();
          ctx.fillStyle = '#f00'; ctx.fillRect(e.pos.x - 10, e.pos.y - e.radius - 8, 20 * (e.hp / e.maxHp), 2);
      });

      // Bullets
      state.bullets.forEach(b => {
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

      ctx.restore(); animationId = requestAnimationFrame(render);
    };
    render(); return () => cancelAnimationFrame(animationId);
  }, [engine]);

  return <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="w-full h-full bg-black" />;
};
