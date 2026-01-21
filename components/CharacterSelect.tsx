import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LobbySlot, CharacterDef, InputType } from '../types';
import { ALL_CHARACTERS, PLAYER_COLORS } from '../constants';
import { progressManager } from '../engine/ProgressManager';
import { assetManager } from '../engine/AssetManager';

interface CharacterSelectProps {
  slots: LobbySlot[];
  onSelectCharacter: (slotIndex: number, characterId: string) => void;
  onReady: (slotIndex: number, ready: boolean) => void;
  onBack: () => void;
  onStartGame: (selections: { slotIndex: number; characterId: string; controllerId: number; inputType: InputType }[]) => void;
}

interface PlayerSelection {
  selectedIndex: number;
  ready: boolean;
  characterId: string | null;
}

export const CharacterSelect: React.FC<CharacterSelectProps> = ({ slots, onSelectCharacter, onReady, onBack, onStartGame }) => {
  const unlockedIds = progressManager.getUnlockedCharacters();
  const joinedSlots = slots.map((s, i) => ({ ...s, slotIndex: i })).filter(s => s.joined);
  const [selections, setSelections] = useState<PlayerSelection[]>(joinedSlots.map(() => ({ selectedIndex: 0, ready: false, characterId: null })));
  const [navCooldowns, setNavCooldowns] = useState<number[]>(joinedSlots.map(() => 0));

  const columns = 7;
  const allReady = selections.every(s => s.ready);

  const isCharacterTaken = useCallback((charId: string, excludePlayer: number): boolean => {
    return selections.some((s, i) => i !== excludePlayer && s.characterId === charId);
  }, [selections]);

  const handleNavigation = useCallback((playerIndex: number, dx: number, dy: number) => {
    if (navCooldowns[playerIndex] > 0) return;
    setSelections(prev => {
      const newSel = [...prev];
      const current = newSel[playerIndex].selectedIndex;
      const row = Math.floor(current / columns);
      const col = current % columns;
      let newCol = col + dx;
      let newRow = row + dy;
      if (newCol < 0) newCol = columns - 1;
      if (newCol >= columns) newCol = 0;
      if (newRow < 0) newRow = Math.floor((ALL_CHARACTERS.length - 1) / columns);
      if (newRow * columns + newCol >= ALL_CHARACTERS.length) newRow = 0;
      newSel[playerIndex] = { ...newSel[playerIndex], selectedIndex: newRow * columns + newCol };
      return newSel;
    });
    setNavCooldowns(prev => {
      const n = [...prev];
      n[playerIndex] = 8;
      return n;
    });
  }, [navCooldowns, columns]);

  const handleConfirm = useCallback((playerIndex: number) => {
    const sel = selections[playerIndex];
    const char = ALL_CHARACTERS[sel.selectedIndex];
    if (!unlockedIds.includes(char.id)) return;
    if (isCharacterTaken(char.id, playerIndex)) return;
    if (sel.ready) return;
    setSelections(prev => {
      const newSel = [...prev];
      newSel[playerIndex] = { ...newSel[playerIndex], ready: true, characterId: char.id };
      return newSel;
    });
    onSelectCharacter(joinedSlots[playerIndex].slotIndex, char.id);
    onReady(joinedSlots[playerIndex].slotIndex, true);
  }, [selections, unlockedIds, isCharacterTaken, onSelectCharacter, onReady, joinedSlots]);

  const handleCancel = useCallback((playerIndex: number) => {
    const sel = selections[playerIndex];
    if (sel.ready) {
      setSelections(prev => {
        const newSel = [...prev];
        newSel[playerIndex] = { ...newSel[playerIndex], ready: false, characterId: null };
        return newSel;
      });
      onReady(joinedSlots[playerIndex].slotIndex, false);
    } else if (playerIndex === 0) {
      onBack();
    }
  }, [selections, onReady, joinedSlots, onBack]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNavCooldowns(prev => prev.map(c => Math.max(0, c - 1)));
    }, 16);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const p1Index = joinedSlots.findIndex(s => s.inputType === 'KEYBOARD_WASD');
      const p2Index = joinedSlots.findIndex(s => s.inputType === 'KEYBOARD_ARROWS');
      if (p1Index >= 0 && !selections[p1Index].ready) {
        if (e.key === 'w' || e.key === 'W') handleNavigation(p1Index, 0, -1);
        if (e.key === 's' || e.key === 'S') handleNavigation(p1Index, 0, 1);
        if (e.key === 'a' || e.key === 'A') handleNavigation(p1Index, -1, 0);
        if (e.key === 'd' || e.key === 'D') handleNavigation(p1Index, 1, 0);
      }
      if (e.key === 'Enter' || e.key === ' ') {
        if (p1Index >= 0) handleConfirm(p1Index);
      }
      if (e.key === 'Escape') {
        if (p1Index >= 0) handleCancel(p1Index);
      }
      if (p2Index >= 0 && !selections[p2Index].ready) {
        if (e.key === 'ArrowUp') handleNavigation(p2Index, 0, -1);
        if (e.key === 'ArrowDown') handleNavigation(p2Index, 0, 1);
        if (e.key === 'ArrowLeft') handleNavigation(p2Index, -1, 0);
        if (e.key === 'ArrowRight') handleNavigation(p2Index, 1, 0);
      }
      if (e.key === '/') {
        if (p2Index >= 0) handleConfirm(p2Index);
      }
      if (e.key === '.') {
        if (p2Index >= 0) handleCancel(p2Index);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [joinedSlots, selections, handleNavigation, handleConfirm, handleCancel]);

  useEffect(() => {
    let rafId: number;
    const poll = () => {
      const gamepads = navigator.getGamepads();
      joinedSlots.forEach((slot, pi) => {
        if (slot.inputType !== 'GAMEPAD' || slot.controllerId === null) return;
        const gp = gamepads[slot.controllerId];
        if (!gp) return;
        if (!selections[pi].ready) {
          const lx = gp.axes[0] ?? 0;
          const ly = gp.axes[1] ?? 0;
          if (Math.abs(lx) > 0.5) handleNavigation(pi, lx > 0 ? 1 : -1, 0);
          if (Math.abs(ly) > 0.5) handleNavigation(pi, 0, ly > 0 ? 1 : -1);
          const dpadUp = gp.buttons[12]?.pressed;
          const dpadDown = gp.buttons[13]?.pressed;
          const dpadLeft = gp.buttons[14]?.pressed;
          const dpadRight = gp.buttons[15]?.pressed;
          if (dpadUp) handleNavigation(pi, 0, -1);
          if (dpadDown) handleNavigation(pi, 0, 1);
          if (dpadLeft) handleNavigation(pi, -1, 0);
          if (dpadRight) handleNavigation(pi, 1, 0);
        }
        if (gp.buttons[0]?.pressed) handleConfirm(pi);
        if (gp.buttons[1]?.pressed) handleCancel(pi);
      });
      rafId = requestAnimationFrame(poll);
    };
    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [joinedSlots, selections, handleNavigation, handleConfirm, handleCancel]);

  useEffect(() => {
    if (allReady) {
      const timer = setTimeout(() => {
        onStartGame(joinedSlots.map((slot, i) => ({
          slotIndex: slot.slotIndex,
          characterId: selections[i].characterId!,
          controllerId: slot.controllerId ?? -1,
          inputType: slot.inputType,
        })));
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [allReady, joinedSlots, selections, onStartGame]);

  const currentChars = selections.map(s => ALL_CHARACTERS[s.selectedIndex]);

  return (
    <div className="fixed inset-0 flex bg-black/90 z-50">
      {joinedSlots.map((slot, pi) => {
        const sel = selections[pi];
        const char = currentChars[pi];
        const isUnlocked = unlockedIds.includes(char.id);
        const isTaken = isCharacterTaken(char.id, pi);
        const viewWidth = 100 / joinedSlots.length;

        return (
          <div key={slot.slotIndex} className="flex flex-col h-full p-4" style={{ width: `${viewWidth}%`, borderRight: pi < joinedSlots.length - 1 ? '2px solid #333' : 'none' }}>
            <div className="text-center mb-2">
              <span className="text-lg font-bold uppercase tracking-wider" style={{ color: PLAYER_COLORS[slot.slotIndex] }}>
                Player {slot.slotIndex + 1}
              </span>
              {sel.ready && <span className="ml-2 text-green-400 font-bold">READY</span>}
            </div>

            <div className="flex-1 flex gap-4 min-h-0">
              <div className="flex-1 overflow-y-auto pr-2">
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(columns, Math.max(3, Math.floor(viewWidth / 15)))}, 1fr)` }}>
                  {ALL_CHARACTERS.map((c, ci) => {
                    const unlocked = unlockedIds.includes(c.id);
                    const taken = isCharacterTaken(c.id, pi);
                    const selected = sel.selectedIndex === ci;
                    const confirmed = sel.characterId === c.id;
                    const icon = assetManager.getCharacterIcon(c.id);
                    return (
                      <div
                        key={c.id}
                        className={`aspect-square rounded-lg border-2 flex items-center justify-center text-xs font-bold uppercase transition-all cursor-pointer relative overflow-hidden ${
                          confirmed ? 'border-green-400 bg-green-400/20 shadow-[0_0_20px_rgba(74,222,128,0.5)]' :
                          selected ? 'border-yellow-400 bg-yellow-400/20 scale-110 shadow-[0_0_15px_rgba(250,204,21,0.4)] z-10' :
                          taken ? 'border-red-500/50 bg-red-500/10 opacity-40 grayscale' :
                          unlocked ? 'border-white/20 bg-white/5 hover:bg-white/10 opacity-60 hover:opacity-100' :
                          'border-white/10 bg-black/50 opacity-30 grayscale'
                        }`}
                        style={{ transition: 'all 0.2s ease-out' }}
                        onClick={() => {
                          if (!sel.ready) {
                            setSelections(prev => {
                              const n = [...prev];
                              n[pi] = { ...n[pi], selectedIndex: ci };
                              return n;
                            });
                          }
                        }}
                        onDoubleClick={() => {
                          if (!sel.ready && unlocked && !taken) handleConfirm(pi);
                        }}
                      >
                        {icon && icon.width > 0 ? (
                          <img src={icon.src} alt={c.name} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />
                        ) : (
                          <CharacterPlaceholder name={c.name} color={c.stats.hp > 150 ? '#ff6666' : c.stats.magic > 120 ? '#aa66ff' : '#66aaff'} />
                        )}
                        {!unlocked && (
                          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                            <span className="text-2xl">?</span>
                          </div>
                        )}
                        {selected && !confirmed && (
                          <div className="absolute inset-0 border-2 border-yellow-400 animate-pulse pointer-events-none" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="w-56 flex-shrink-0 bg-gradient-to-b from-white/10 to-white/5 rounded-xl p-4 flex flex-col border border-white/10">
                {/* Large character portrait */}
                <div className="relative w-full aspect-[3/4] mb-3 rounded-lg overflow-hidden bg-gradient-to-b from-black/40 to-black/60">
                  <CharacterPortrait characterId={char.id} />
                  {sel.ready && (
                    <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                      <span className="text-green-400 text-2xl font-bold drop-shadow-lg">READY</span>
                    </div>
                  )}
                  {!isUnlocked && (
                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center backdrop-blur-sm">
                      <span className="text-4xl">?</span>
                    </div>
                  )}
                </div>

                <div className="text-center mb-2">
                  <div className="text-xl font-bold text-white drop-shadow-lg">{char.name}</div>
                  <div className="text-xs text-white/50">{char.description}</div>
                </div>
                <div className="space-y-2 text-sm">
                  <StatBar label="HP" value={char.stats.hp} max={300} color="#ff4444" />
                  <StatBar label="SPD" value={char.stats.speed} max={5} color="#44ff44" />
                  <StatBar label="DMG" value={char.stats.damage} max={40} color="#ffaa00" />
                  <StatBar label="MAG" value={char.stats.magic} max={180} color="#aa44ff" />
                </div>
                <div className="mt-3 p-2 bg-black/30 rounded-lg">
                  <div className="text-xs text-yellow-400 font-bold">{char.passive.name}</div>
                  <div className="text-[10px] text-white/60 mt-1">{char.passive.description}</div>
                </div>
                {!isUnlocked && char.unlockCondition && (
                  <div className="mt-2 p-2 bg-red-500/20 rounded-lg">
                    <div className="text-xs text-red-400 font-bold">LOCKED</div>
                    <div className="text-[10px] text-white/60">{char.unlockCondition.description}</div>
                  </div>
                )}
                {isTaken && isUnlocked && (
                  <div className="mt-2 p-2 bg-orange-500/20 rounded-lg text-center">
                    <div className="text-xs text-orange-400 font-bold">TAKEN</div>
                  </div>
                )}
              </div>
            </div>

            <div className="text-center text-xs text-white/30 mt-2">
              {sel.ready ? 'Press B/ESC to unready' : 'Press A/ENTER to confirm'}
            </div>
          </div>
        );
      })}

      {allReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
          <div className="text-4xl font-bold text-green-400 animate-pulse">STARTING GAME...</div>
        </div>
      )}
    </div>
  );
};

const StatBar: React.FC<{ label: string; value: number; max: number; color: string }> = ({ label, value, max, color }) => (
  <div className="flex items-center gap-2">
    <span className="text-white/60 w-8 text-right text-xs">{label}</span>
    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${(value / max) * 100}%`, backgroundColor: color }} />
    </div>
    <span className="text-white/40 w-8 text-xs">{value}</span>
  </div>
);

// Large character portrait component
const CharacterPortrait: React.FC<{ characterId: string }> = ({ characterId }) => {
  const portrait = assetManager.getCharacterPortrait(characterId);
  const char = ALL_CHARACTERS.find(c => c.id === characterId);

  if (portrait && portrait.width > 0) {
    return (
      <img
        src={portrait.src}
        alt={characterId}
        className="w-full h-full object-cover"
        style={{ filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.5))' }}
      />
    );
  }

  // Fallback: styled placeholder with character initial
  const colors: Record<string, string> = {
    samurai: '#ff6b6b', witch: '#a855f7', ninja: '#3b82f6', paladin: '#fbbf24',
    necromancer: '#6b21a8', bard: '#ec4899', druid: '#22c55e',
  };
  const bgColor = colors[characterId] || '#666';

  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{
        background: `linear-gradient(135deg, ${bgColor}40 0%, ${bgColor}80 50%, ${bgColor}40 100%)`,
      }}
    >
      <div className="text-6xl font-bold text-white/80 drop-shadow-lg" style={{ textShadow: `0 0 40px ${bgColor}` }}>
        {char?.name?.charAt(0) || '?'}
      </div>
    </div>
  );
};

// Small pixel art placeholder for grid
const CharacterPlaceholder: React.FC<{ name: string; color: string }> = ({ name, color }) => (
  <div
    className="w-full h-full flex items-center justify-center"
    style={{
      background: `linear-gradient(135deg, ${color}30 0%, ${color}60 100%)`,
    }}
  >
    <span
      className="text-lg font-bold"
      style={{ color, textShadow: `0 0 8px ${color}` }}
    >
      {name.charAt(0)}
    </span>
  </div>
);
