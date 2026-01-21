
import React from 'react';
import { MagicWheelState, MagicElement, CastMode } from '../types';
import { ELEMENT_COLORS, ELEMENT_ICONS, SEGMENT_ELEMENTS } from '../engine/MagicWheel';

interface Props {
  state: MagicWheelState;
  playerIndex: number;
  screenPos: { x: number; y: number };
  mana: number;
  manaCost: number;
  comboName: string | null;
}

const WHEEL_RADIUS = 80;
const SEGMENT_INNER = 30;

export const MagicWheelUI: React.FC<Props> = ({ state, playerIndex, screenPos, mana, manaCost, comboName }) => {
  if (!state.isOpen) return null;

  const segments = Array.from({ length: 8 }, (_, i) => {
    const startAngle = (i * Math.PI / 4) - Math.PI / 2 - Math.PI / 8;
    const endAngle = startAngle + Math.PI / 4;
    const midAngle = (startAngle + endAngle) / 2;
    const element = SEGMENT_ELEMENTS[i];
    const isSelected = state.selectedSegment === i;

    const x1 = Math.cos(startAngle) * SEGMENT_INNER;
    const y1 = Math.sin(startAngle) * SEGMENT_INNER;
    const x2 = Math.cos(startAngle) * WHEEL_RADIUS;
    const y2 = Math.sin(startAngle) * WHEEL_RADIUS;
    const x3 = Math.cos(endAngle) * WHEEL_RADIUS;
    const y3 = Math.sin(endAngle) * WHEEL_RADIUS;
    const x4 = Math.cos(endAngle) * SEGMENT_INNER;
    const y4 = Math.sin(endAngle) * SEGMENT_INNER;

    const iconX = Math.cos(midAngle) * ((WHEEL_RADIUS + SEGMENT_INNER) / 2);
    const iconY = Math.sin(midAngle) * ((WHEEL_RADIUS + SEGMENT_INNER) / 2);

    return { startAngle, endAngle, midAngle, element, isSelected, x1, y1, x2, y2, x3, y3, x4, y4, iconX, iconY };
  });

  const canCast = mana >= manaCost && state.stack.elements.length > 0;

  return (
    <div style={{
      position: 'absolute',
      left: screenPos.x - WHEEL_RADIUS - 20,
      top: screenPos.y - WHEEL_RADIUS - 60,
      pointerEvents: 'none',
      zIndex: 100
    }}>
      <svg width={WHEEL_RADIUS * 2 + 40} height={WHEEL_RADIUS * 2 + 40} style={{ overflow: 'visible' }}>
        <defs>
          {/* Glow filters for each element */}
          {segments.map((seg, i) => (
            <filter key={`glow-${i}`} id={`glow-${seg.element}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
              <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          ))}
          <filter id="outerGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#333"/>
            <stop offset="100%" stopColor="#111"/>
          </radialGradient>
        </defs>
        <g transform={`translate(${WHEEL_RADIUS + 20}, ${WHEEL_RADIUS + 20})`}>
          {/* Outer ring glow */}
          <circle cx={0} cy={0} r={WHEEL_RADIUS + 5} fill="none" stroke="rgba(100,150,255,0.3)" strokeWidth={2}>
            <animate attributeName="stroke-opacity" values="0.3;0.6;0.3" dur="2s" repeatCount="indefinite"/>
          </circle>
          <circle cx={0} cy={0} r={WHEEL_RADIUS + 8} fill="none" stroke="rgba(100,150,255,0.15)" strokeWidth={1}>
            <animate attributeName="r" values={`${WHEEL_RADIUS + 8};${WHEEL_RADIUS + 12};${WHEEL_RADIUS + 8}`} dur="1.5s" repeatCount="indefinite"/>
          </circle>

          {/* Wheel segments */}
          {segments.map((seg, i) => (
            <g key={i}>
              {/* Segment glow effect when selected */}
              {seg.isSelected && (
                <path
                  d={`M ${seg.x1} ${seg.y1} L ${seg.x2} ${seg.y2} A ${WHEEL_RADIUS} ${WHEEL_RADIUS} 0 0 1 ${seg.x3} ${seg.y3} L ${seg.x4} ${seg.y4} A ${SEGMENT_INNER} ${SEGMENT_INNER} 0 0 0 ${seg.x1} ${seg.y1}`}
                  fill={ELEMENT_COLORS[seg.element]}
                  filter={`url(#glow-${seg.element})`}
                  opacity={0.6}
                >
                  <animate attributeName="opacity" values="0.4;0.7;0.4" dur="0.8s" repeatCount="indefinite"/>
                </path>
              )}
              <path
                d={`M ${seg.x1} ${seg.y1} L ${seg.x2} ${seg.y2} A ${WHEEL_RADIUS} ${WHEEL_RADIUS} 0 0 1 ${seg.x3} ${seg.y3} L ${seg.x4} ${seg.y4} A ${SEGMENT_INNER} ${SEGMENT_INNER} 0 0 0 ${seg.x1} ${seg.y1}`}
                fill={seg.isSelected ? ELEMENT_COLORS[seg.element] : `${ELEMENT_COLORS[seg.element]}40`}
                stroke={ELEMENT_COLORS[seg.element]}
                strokeWidth={seg.isSelected ? 3 : 1.5}
                opacity={seg.isSelected ? 1 : 0.85}
              />
              {/* Element icon with glow */}
              <text
                x={seg.iconX}
                y={seg.iconY + 4}
                textAnchor="middle"
                fill={seg.isSelected ? '#fff' : ELEMENT_COLORS[seg.element]}
                fontSize={seg.isSelected ? 18 : 14}
                fontWeight="bold"
                fontFamily="monospace"
                filter={seg.isSelected ? 'url(#outerGlow)' : undefined}
                style={{ textShadow: seg.isSelected ? `0 0 10px ${ELEMENT_COLORS[seg.element]}` : 'none' }}
              >
                {ELEMENT_ICONS[seg.element]}
              </text>
            </g>
          ))}

          {/* Aim indicator with glow */}
          {state.selectedSegment >= 0 && (
            <>
              <line
                x1={0} y1={0}
                x2={Math.cos(state.aimAngle) * (WHEEL_RADIUS + 20)}
                y2={Math.sin(state.aimAngle) * (WHEEL_RADIUS + 20)}
                stroke={ELEMENT_COLORS[SEGMENT_ELEMENTS[state.selectedSegment]]}
                strokeWidth={3}
                opacity={0.6}
                filter="url(#outerGlow)"
              />
              <circle
                cx={Math.cos(state.aimAngle) * (WHEEL_RADIUS + 20)}
                cy={Math.sin(state.aimAngle) * (WHEEL_RADIUS + 20)}
                r={6}
                fill={ELEMENT_COLORS[SEGMENT_ELEMENTS[state.selectedSegment]]}
              >
                <animate attributeName="r" values="5;7;5" dur="0.5s" repeatCount="indefinite"/>
              </circle>
            </>
          )}

          {/* Charge ring */}
          {state.modifier === 'CHARGED' && state.chargeLevel > 0 && (
            <circle
              cx={0} cy={0}
              r={SEGMENT_INNER - 2}
              fill="none"
              stroke="#ff8800"
              strokeWidth={4}
              strokeDasharray={`${(state.chargeLevel / 100) * Math.PI * 2 * (SEGMENT_INNER - 2)} 1000`}
              transform="rotate(-90)"
              filter="url(#outerGlow)"
            />
          )}

          {/* Center - cast mode with gradient */}
          <circle cx={0} cy={0} r={SEGMENT_INNER - 5} fill="url(#centerGlow)" stroke="#555" strokeWidth={2} />
          <text x={0} y={-2} textAnchor="middle" fill="#ccc" fontSize={9} fontFamily="monospace" fontWeight="bold">
            {state.castMode}
          </text>

          {/* Modifier indicator */}
          {state.modifier !== 'NONE' && (
            <text x={0} y={10} textAnchor="middle" fill={
              state.modifier === 'CHARGED' ? '#ff8800' :
              state.modifier === 'RAPID' ? '#00ff88' :
              state.modifier === 'SPLIT' ? '#ff00ff' :
              state.modifier === 'HOMING' ? '#00ffff' : '#fff'
            } fontSize={8} fontFamily="monospace" fontWeight="bold">
              {state.modifier}
            </text>
          )}
        </g>
      </svg>

      {/* Element stack display - floating above */}
      {state.stack.elements.length > 0 && (
        <div style={{
          position: 'absolute',
          top: -40,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 4,
          padding: '4px 8px',
          background: 'rgba(0,0,0,0.8)',
          borderRadius: 4,
          border: '1px solid #444'
        }}>
          {state.stack.elements.map((el, i) => (
            <div key={i} style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              background: ELEMENT_COLORS[el],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: el === MagicElement.BLACK || el === MagicElement.BLOOD ? '#fff' : '#000',
              fontWeight: 'bold',
              fontFamily: 'monospace',
              fontSize: 14,
              border: '1px solid rgba(255,255,255,0.3)'
            }}>
              {ELEMENT_ICONS[el]}
            </div>
          ))}
        </div>
      )}

      {/* Combo name */}
      {comboName && (
        <div style={{
          position: 'absolute',
          top: -65,
          left: '50%',
          transform: 'translateX(-50%)',
          color: '#ffd700',
          fontSize: 12,
          fontWeight: 'bold',
          fontFamily: 'monospace',
          textShadow: '0 0 8px #ffd700',
          whiteSpace: 'nowrap'
        }}>
          {comboName}
        </div>
      )}

      {/* Mana cost */}
      <div style={{
        position: 'absolute',
        bottom: -25,
        left: '50%',
        transform: 'translateX(-50%)',
        color: canCast ? '#4af' : '#f44',
        fontSize: 11,
        fontFamily: 'monospace'
      }}>
        {manaCost > 0 ? `MANA: ${manaCost}` : 'SELECT ELEMENTS'}
      </div>
    </div>
  );
};

// Compact stack display for HUD (when wheel is closed)
export const MagicStackHUD: React.FC<{ elements: MagicElement[]; comboName: string | null }> = ({ elements, comboName }) => {
  if (elements.length === 0) return null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2
    }}>
      {comboName && (
        <span style={{ color: '#ffd700', fontSize: 10, fontFamily: 'monospace' }}>{comboName}</span>
      )}
      <div style={{ display: 'flex', gap: 2 }}>
        {elements.map((el, i) => (
          <div key={i} style={{
            width: 16,
            height: 16,
            borderRadius: 2,
            background: ELEMENT_COLORS[el],
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: el === MagicElement.BLACK || el === MagicElement.BLOOD ? '#fff' : '#000',
            fontSize: 10,
            fontWeight: 'bold',
            fontFamily: 'monospace'
          }}>
            {ELEMENT_ICONS[el]}
          </div>
        ))}
      </div>
    </div>
  );
};

// Cast mode selector
export const CastModeIndicator: React.FC<{ mode: CastMode }> = ({ mode }) => {
  const icons: Record<CastMode, string> = {
    ATTACK: '>',
    SELF: 'O',
    WALL: '|',
    TOWER: '^',
    AREA: '*'
  };

  const colors: Record<CastMode, string> = {
    ATTACK: '#ff4444',
    SELF: '#44ff44',
    WALL: '#8888ff',
    TOWER: '#ffaa44',
    AREA: '#ff44ff'
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 6px',
      background: 'rgba(0,0,0,0.6)',
      borderRadius: 3,
      border: `1px solid ${colors[mode]}`
    }}>
      <span style={{ color: colors[mode], fontWeight: 'bold', fontFamily: 'monospace', fontSize: 12 }}>
        {icons[mode]}
      </span>
      <span style={{ color: '#aaa', fontSize: 9, fontFamily: 'monospace' }}>
        {mode}
      </span>
    </div>
  );
};

export default MagicWheelUI;
