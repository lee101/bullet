
import React, { useEffect, useState } from 'react';
import { PlayerStats, WanderingTrader, TownState, Vec2 } from '../types';
import { SKILL_COOLDOWNS, MAX_SLOTS } from '../constants';
import { audioManager } from '../engine/AudioManager';

interface HUDProps {
  players: PlayerStats[];
  score: number;
  money: number;
  onRestart: () => void;
  traders?: WanderingTrader[];
  town?: TownState;
  playerPositions?: Vec2[];
}

const SkillCircle: React.FC<{ label: string, cd: number, maxCd: number, posClass: string }> = ({ label, cd, maxCd, posClass }) => {
    const ready = cd <= 0;
    const progress = ready ? 100 : (1 - cd / maxCd) * 100;
    
    return (
        <div className={`absolute w-7 h-7 flex items-center justify-center rounded-full border border-white/20 transition-all duration-300 ${posClass} ${ready ? 'bg-white/5 border-white/50 shadow-[0_0_8px_white/10]' : 'bg-black/60 opacity-60'}`}>
            {!ready && (
                <div className="absolute inset-0">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle
                            cx="14" cy="14" r="12"
                            stroke="white"
                            strokeWidth="1.5"
                            fill="transparent"
                            className="text-white/20"
                            strokeDasharray="75"
                            strokeDashoffset={75 - (progress / 100) * 75}
                        />
                    </svg>
                </div>
            )}
            <span className={`text-[7px] font-bold font-orbitron z-10 ${ready ? 'text-white' : 'text-white/30'}`}>
                {label}
            </span>
        </div>
    );
};

const CompactPanel: React.FC<{ p: PlayerStats, index: number }> = ({ p, index }) => {
    const corner = [
        "top-2 left-2", "top-2 right-2", "bottom-2 left-2", "bottom-2 right-2"
    ][index];

    return (
        <div className={`fixed ${corner} pointer-events-none p-2 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl w-44 flex flex-col gap-1 shadow-xl z-50`}>
            <div className="flex justify-between items-center px-1">
                <span className="text-[9px] font-bold tracking-widest uppercase font-orbitron" style={{ color: p.color }}>S-LINK {index + 1}</span>
                <span className="text-[8px] text-white/30 font-bold uppercase">LV {p.level}</span>
            </div>
            
            <div className="h-1 w-full bg-black/50 rounded-full overflow-hidden">
                <div className="h-full transition-all duration-300 shadow-[0_0_5px_white/20]" style={{ width: `${(p.hp / p.maxHp) * 100}%`, backgroundColor: p.color }} />
            </div>

            <div className="flex items-center gap-3 mt-1">
                <div className="relative w-16 h-16">
                    <SkillCircle label="Y" cd={p.skillCooldowns[1]} maxCd={SKILL_COOLDOWNS[1]} posClass="top-0 left-1/2 -translate-x-1/2" />
                    <SkillCircle label="X" cd={p.skillCooldowns[0]} maxCd={SKILL_COOLDOWNS[0]} posClass="left-0 top-1/2 -translate-y-1/2" />
                    <SkillCircle label="B" cd={p.skillCooldowns[2]} maxCd={SKILL_COOLDOWNS[2]} posClass="right-0 top-1/2 -translate-y-1/2" />
                    <SkillCircle label="A" cd={p.skillCooldowns[3]} maxCd={SKILL_COOLDOWNS[3]} posClass="bottom-0 left-1/2 -translate-x-1/2" />
                </div>
                <div className="flex flex-col gap-0.5">
                    <div className="flex gap-0.5 opacity-60">
                        {[...Array(MAX_SLOTS)].map((_, idx) => <div key={idx} className={`w-1 h-1 rounded-full ${idx < p.weaponSlots.length ? 'bg-yellow-400' : 'bg-white/5'}`} />)}
                    </div>
                    <div className="flex gap-0.5 opacity-60">
                        {[...Array(MAX_SLOTS)].map((_, idx) => <div key={idx} className={`w-1 h-1 rounded-full ${idx < p.armorSlots.length ? 'bg-blue-400' : 'bg-white/5'}`} />)}
                    </div>
                </div>
            </div>
        </div>
    );
};

export const HUD: React.FC<HUDProps> = ({ players, score, money, town, traders, playerPositions }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [volume, setVolume] = useState(audioManager.getVolume());
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (!playerPositions) return;
    let nearby = false;
    playerPositions.forEach(pp => {
        if (town && Math.sqrt((pp.x - town.pos.x)**2 + (pp.y - town.pos.y)**2) < 300) nearby = true;
        traders?.forEach(tr => {
            if (Math.sqrt((pp.x - tr.pos.x)**2 + (pp.y - tr.pos.y)**2) < 150) nearby = true;
        });
    });
    setShowTooltip(nearby);
  }, [playerPositions, town, traders]);

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    audioManager.setVolume(newVol);
    if (newVol > 0) setMuted(false);
  };

  const toggleMute = () => {
    if (muted) {
      audioManager.setVolume(volume || 0.5);
      setMuted(false);
    } else {
      audioManager.setVolume(0);
      setMuted(true);
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-10 font-rajdhani">
      {players.map((p, i) => <CompactPanel key={p.id} p={p} index={i} />)}

      <div className="fixed top-2 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <div className="bg-black/60 backdrop-blur-xl border border-white/10 px-6 py-1.5 rounded-full flex items-center gap-6 shadow-2xl">
            <span className="text-xl font-orbitron font-bold text-white tracking-tighter leading-none">{score.toLocaleString()}</span>
            <span className="text-[10px] tracking-[0.3em] text-yellow-400 uppercase font-bold">{money.toLocaleString()} GOLD</span>
        </div>
      </div>

      <div className="fixed bottom-4 right-4 pointer-events-auto flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-full px-3 py-1.5">
        <button
          onClick={toggleMute}
          className="text-white/70 hover:text-white transition-colors text-sm"
        >
          {muted ? '🔇' : volume > 0.5 ? '🔊' : '🔉'}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={muted ? 0 : volume}
          onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
          className="w-16 h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
        />
      </div>

      {showTooltip && (
          <div className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-yellow-500/90 text-black px-6 py-2 rounded-full font-bold uppercase tracking-widest text-[12px] animate-bounce shadow-2xl border border-white/20">
              PRESS [ACTION / X] TO TRADE
          </div>
      )}
    </div>
  );
};
