import React, { useState, useEffect, useCallback } from 'react';
import { CharacterDef, InputType } from '../types';
import { ALL_CHARACTERS, PLAYER_COLORS } from '../constants';
import { progressManager } from '../engine/ProgressManager';

interface MidGameJoinProps {
  controllerId: number;
  inputType: InputType;
  playerSlot: number;
  onConfirm: (characterId: string) => void;
  onCancel: () => void;
  takenCharacters: string[];
}

export const MidGameJoin: React.FC<MidGameJoinProps> = ({ controllerId, inputType, playerSlot, onConfirm, onCancel, takenCharacters }) => {
  const unlockedIds = progressManager.getUnlockedCharacters();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [navCooldown, setNavCooldown] = useState(0);

  const columns = 7;
  const char = ALL_CHARACTERS[selectedIndex];
  const isUnlocked = unlockedIds.includes(char.id);
  const isTaken = takenCharacters.includes(char.id);

  const handleNav = useCallback((dx: number, dy: number) => {
    if (navCooldown > 0) return;
    const row = Math.floor(selectedIndex / columns);
    const col = selectedIndex % columns;
    let newCol = col + dx;
    let newRow = row + dy;
    if (newCol < 0) newCol = columns - 1;
    if (newCol >= columns) newCol = 0;
    if (newRow < 0) newRow = Math.floor((ALL_CHARACTERS.length - 1) / columns);
    if (newRow * columns + newCol >= ALL_CHARACTERS.length) newRow = 0;
    setSelectedIndex(newRow * columns + newCol);
    setNavCooldown(8);
  }, [navCooldown, selectedIndex]);

  const handleConfirm = useCallback(() => {
    if (!isUnlocked || isTaken) return;
    onConfirm(char.id);
  }, [isUnlocked, isTaken, char.id, onConfirm]);

  useEffect(() => {
    const interval = setInterval(() => setNavCooldown(c => Math.max(0, c - 1)), 16);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (inputType !== 'GAMEPAD') return;
    let rafId: number;
    const poll = () => {
      const gp = navigator.getGamepads()[controllerId];
      if (gp) {
        const lx = gp.axes[0] ?? 0;
        const ly = gp.axes[1] ?? 0;
        if (Math.abs(lx) > 0.5) handleNav(lx > 0 ? 1 : -1, 0);
        if (Math.abs(ly) > 0.5) handleNav(0, ly > 0 ? 1 : -1);
        if (gp.buttons[12]?.pressed) handleNav(0, -1);
        if (gp.buttons[13]?.pressed) handleNav(0, 1);
        if (gp.buttons[14]?.pressed) handleNav(-1, 0);
        if (gp.buttons[15]?.pressed) handleNav(1, 0);
        if (gp.buttons[0]?.pressed) handleConfirm();
        if (gp.buttons[1]?.pressed) onCancel();
      }
      rafId = requestAnimationFrame(poll);
    };
    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [controllerId, inputType, handleNav, handleConfirm, onCancel]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (inputType === 'KEYBOARD_WASD') {
        if (e.key === 'w' || e.key === 'W') handleNav(0, -1);
        if (e.key === 's' || e.key === 'S') handleNav(0, 1);
        if (e.key === 'a' || e.key === 'A') handleNav(-1, 0);
        if (e.key === 'd' || e.key === 'D') handleNav(1, 0);
        if (e.key === 'Enter' || e.key === ' ') handleConfirm();
        if (e.key === 'Escape') onCancel();
      } else if (inputType === 'KEYBOARD_ARROWS') {
        if (e.key === 'ArrowUp') handleNav(0, -1);
        if (e.key === 'ArrowDown') handleNav(0, 1);
        if (e.key === 'ArrowLeft') handleNav(-1, 0);
        if (e.key === 'ArrowRight') handleNav(1, 0);
        if (e.key === '/') handleConfirm();
        if (e.key === '.') onCancel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [inputType, handleNav, handleConfirm, onCancel]);

  return (
    <div className="fixed top-4 right-4 w-80 bg-black/90 border-2 rounded-2xl p-4 z-50" style={{ borderColor: PLAYER_COLORS[playerSlot] }}>
      <div className="text-center mb-3">
        <span className="text-lg font-bold" style={{ color: PLAYER_COLORS[playerSlot] }}>Player {playerSlot + 1} Joining</span>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-3">
        {ALL_CHARACTERS.slice(0, 21).map((c, i) => {
          const unlocked = unlockedIds.includes(c.id);
          const taken = takenCharacters.includes(c.id);
          const selected = selectedIndex === i;
          return (
            <div
              key={c.id}
              className={`aspect-square rounded border flex items-center justify-center text-[8px] ${
                selected ? 'border-yellow-400 bg-yellow-400/20' :
                taken ? 'border-red-500/50 opacity-40' :
                unlocked ? 'border-white/20 bg-white/5' :
                'border-white/10 opacity-30'
              }`}
              onClick={() => setSelectedIndex(i)}
            >
              {!unlocked ? '?' : c.name.slice(0, 3)}
            </div>
          );
        })}
      </div>

      <div className="bg-white/5 rounded-lg p-2 mb-3">
        <div className="font-bold text-white text-sm">{char.name}</div>
        <div className="text-xs text-white/50">{char.description}</div>
        <div className="flex gap-2 mt-2 text-xs">
          <span className="text-red-400">HP:{char.stats.hp}</span>
          <span className="text-green-400">SPD:{char.stats.speed}</span>
          <span className="text-yellow-400">DMG:{char.stats.damage}</span>
          <span className="text-purple-400">MAG:{char.stats.magic}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={!isUnlocked || isTaken}
          className={`flex-1 py-2 rounded-lg font-bold text-sm ${
            isUnlocked && !isTaken ? 'bg-green-500 text-black' : 'bg-gray-600 text-gray-400 cursor-not-allowed'
          }`}
        >
          {!isUnlocked ? 'LOCKED' : isTaken ? 'TAKEN' : 'JOIN'}
        </button>
        <button onClick={onCancel} className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg font-bold text-sm">X</button>
      </div>
    </div>
  );
};
