import { Viewport } from '../types';

export function calculateViewports(playerCount: number, screenW: number, screenH: number): Viewport[] {
  const gap = 2;
  switch (playerCount) {
    case 0:
    case 1:
      return [{ x: 0, y: 0, width: screenW, height: screenH, playerIndex: 0 }];
    case 2: {
      const hw = Math.floor(screenW / 2) - gap;
      return [
        { x: 0, y: 0, width: hw, height: screenH, playerIndex: 0 },
        { x: hw + gap * 2, y: 0, width: hw, height: screenH, playerIndex: 1 },
      ];
    }
    case 3: {
      const hh = Math.floor(screenH / 2) - gap;
      const hw = Math.floor(screenW / 2) - gap;
      return [
        { x: 0, y: 0, width: screenW, height: hh, playerIndex: 0 },
        { x: 0, y: hh + gap * 2, width: hw, height: hh, playerIndex: 1 },
        { x: hw + gap * 2, y: hh + gap * 2, width: hw, height: hh, playerIndex: 2 },
      ];
    }
    case 4:
    default: {
      const hh = Math.floor(screenH / 2) - gap;
      const hw = Math.floor(screenW / 2) - gap;
      return [
        { x: 0, y: 0, width: hw, height: hh, playerIndex: 0 },
        { x: hw + gap * 2, y: 0, width: hw, height: hh, playerIndex: 1 },
        { x: 0, y: hh + gap * 2, width: hw, height: hh, playerIndex: 2 },
        { x: hw + gap * 2, y: hh + gap * 2, width: hw, height: hh, playerIndex: 3 },
      ];
    }
  }
}

export function drawViewportDividers(ctx: CanvasRenderingContext2D, playerCount: number, screenW: number, screenH: number): void {
  if (playerCount <= 1) return;
  ctx.save();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  const hw = Math.floor(screenW / 2);
  const hh = Math.floor(screenH / 2);
  if (playerCount === 2) {
    ctx.beginPath();
    ctx.moveTo(hw, 0);
    ctx.lineTo(hw, screenH);
    ctx.stroke();
  } else if (playerCount === 3) {
    ctx.beginPath();
    ctx.moveTo(0, hh);
    ctx.lineTo(screenW, hh);
    ctx.moveTo(hw, hh);
    ctx.lineTo(hw, screenH);
    ctx.stroke();
  } else if (playerCount >= 4) {
    ctx.beginPath();
    ctx.moveTo(hw, 0);
    ctx.lineTo(hw, screenH);
    ctx.moveTo(0, hh);
    ctx.lineTo(screenW, hh);
    ctx.stroke();
  }
  ctx.restore();
}
