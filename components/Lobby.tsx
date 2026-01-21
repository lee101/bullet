import React, { useState, useEffect, useCallback } from 'react';
import { LobbySlot, InputType } from '../types';
import { PLAYER_COLORS } from '../constants';

interface LobbyProps {
  onPlayerJoin: (slot: number, controllerId: number, inputType: InputType) => void;
  onPlayerLeave: (slot: number) => void;
  onProceed: () => void;
  onBack: () => void;
}

const createEmptySlot = (): LobbySlot => ({
  joined: false,
  controllerId: null,
  inputType: 'GAMEPAD',
  selectedCharacter: null,
  ready: false,
});

export const Lobby: React.FC<LobbyProps> = ({ onPlayerJoin, onPlayerLeave, onProceed, onBack }) => {
  const [slots, setSlots] = useState<LobbySlot[]>([createEmptySlot(), createEmptySlot(), createEmptySlot(), createEmptySlot()]);
  const [usedControllers, setUsedControllers] = useState<Set<number>>(new Set());
  const [keyboardP1Used, setKeyboardP1Used] = useState(false);
  const [keyboardP2Used, setKeyboardP2Used] = useState(false);
  const [pulseIndex, setPulseIndex] = useState(0);

  const joinedCount = slots.filter(s => s.joined).length;

  const findEmptySlot = useCallback((): number => {
    for (let i = 0; i < 4; i++) {
      if (!slots[i].joined) return i;
    }
    return -1;
  }, [slots]);

  const handleJoin = useCallback((controllerId: number, inputType: InputType) => {
    const slotIndex = findEmptySlot();
    if (slotIndex === -1) return;
    if (inputType === 'GAMEPAD' && usedControllers.has(controllerId)) return;
    if (inputType === 'KEYBOARD_WASD' && keyboardP1Used) return;
    if (inputType === 'KEYBOARD_ARROWS' && keyboardP2Used) return;

    setSlots(prev => {
      const newSlots = [...prev];
      newSlots[slotIndex] = { joined: true, controllerId, inputType, selectedCharacter: null, ready: false };
      return newSlots;
    });

    if (inputType === 'GAMEPAD') setUsedControllers(prev => new Set([...prev, controllerId]));
    else if (inputType === 'KEYBOARD_WASD') setKeyboardP1Used(true);
    else if (inputType === 'KEYBOARD_ARROWS') setKeyboardP2Used(true);

    onPlayerJoin(slotIndex, controllerId, inputType);
  }, [findEmptySlot, usedControllers, keyboardP1Used, keyboardP2Used, onPlayerJoin]);

  const handleLeave = useCallback((slotIndex: number) => {
    const slot = slots[slotIndex];
    if (!slot.joined) return;

    if (slot.inputType === 'GAMEPAD' && slot.controllerId !== null) {
      setUsedControllers(prev => {
        const next = new Set(prev);
        next.delete(slot.controllerId!);
        return next;
      });
    } else if (slot.inputType === 'KEYBOARD_WASD') setKeyboardP1Used(false);
    else if (slot.inputType === 'KEYBOARD_ARROWS') setKeyboardP2Used(false);

    setSlots(prev => {
      const newSlots = [...prev];
      newSlots[slotIndex] = createEmptySlot();
      return newSlots;
    });
    onPlayerLeave(slotIndex);
  }, [slots, onPlayerLeave]);

  useEffect(() => {
    const interval = setInterval(() => setPulseIndex(p => (p + 1) % 4), 800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (!keyboardP1Used) handleJoin(-1, 'KEYBOARD_WASD');
        else if (joinedCount > 0) onProceed();
      }
      if (e.key === 'Escape') {
        const lastJoined = slots.map((s, i) => s.joined ? i : -1).filter(i => i >= 0).pop();
        if (lastJoined !== undefined && lastJoined >= 0) handleLeave(lastJoined);
        else onBack();
      }
      if (e.key === '/' && !keyboardP2Used) handleJoin(-2, 'KEYBOARD_ARROWS');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleJoin, handleLeave, keyboardP1Used, keyboardP2Used, joinedCount, onProceed, onBack, slots]);

  useEffect(() => {
    let rafId: number;
    const pollGamepads = () => {
      const gamepads = navigator.getGamepads();
      for (let i = 0; i < 4; i++) {
        const gp = gamepads[i];
        if (!gp || !gp.connected) continue;
        if (gp.buttons[0]?.pressed && !usedControllers.has(i)) {
          handleJoin(i, 'GAMEPAD');
        }
        if (gp.buttons[1]?.pressed && usedControllers.has(i)) {
          const slotIndex = slots.findIndex(s => s.controllerId === i);
          if (slotIndex >= 0) handleLeave(slotIndex);
        }
        if (gp.buttons[9]?.pressed && joinedCount > 0) {
          onProceed();
        }
      }
      rafId = requestAnimationFrame(pollGamepads);
    };
    rafId = requestAnimationFrame(pollGamepads);
    return () => cancelAnimationFrame(rafId);
  }, [handleJoin, handleLeave, usedControllers, slots, joinedCount, onProceed]);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-xl z-50 p-8">
      <h1 className="text-5xl font-orbitron font-bold mb-4 text-white uppercase tracking-wider">Join Game</h1>
      <p className="text-white/50 mb-12 text-lg">Press A or ENTER to join</p>

      <div className="flex gap-6 mb-12">
        {slots.map((slot, i) => (
          <div
            key={i}
            className={`w-56 h-72 rounded-3xl border-2 flex flex-col items-center justify-center transition-all duration-300 ${
              slot.joined
                ? 'bg-white/10 border-white/30'
                : pulseIndex === i
                ? 'bg-white/5 border-white/20 scale-105'
                : 'bg-black/40 border-white/10'
            }`}
            style={slot.joined ? { borderColor: PLAYER_COLORS[i], boxShadow: `0 0 30px ${PLAYER_COLORS[i]}40` } : {}}
          >
            {slot.joined ? (
              <>
                <div className="w-20 h-20 rounded-full mb-4" style={{ backgroundColor: PLAYER_COLORS[i] }} />
                <div className="text-xl font-bold text-white mb-2">Player {i + 1}</div>
                <div className="text-sm text-white/50 uppercase tracking-wider">
                  {slot.inputType === 'GAMEPAD' ? `Controller ${(slot.controllerId ?? 0) + 1}` : slot.inputType === 'KEYBOARD_WASD' ? 'Keyboard WASD' : 'Keyboard Arrows'}
                </div>
                <div className="text-xs text-white/30 mt-4">Press B / ESC to leave</div>
              </>
            ) : (
              <>
                <div className="text-6xl mb-4 opacity-30">+</div>
                <div className="text-white/40 text-sm uppercase tracking-widest">Press A</div>
                <div className="text-white/20 text-xs mt-1">or ENTER</div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-4">
        {joinedCount > 0 && (
          <button
            onClick={onProceed}
            className="px-12 py-4 bg-yellow-500 text-black font-bold text-xl rounded-2xl hover:bg-yellow-400 transition-all uppercase tracking-wider"
          >
            Select Characters ({joinedCount} Player{joinedCount > 1 ? 's' : ''})
          </button>
        )}
        <button
          onClick={onBack}
          className="px-8 py-4 bg-white/10 text-white/60 font-bold rounded-2xl hover:bg-white/20 transition-all uppercase tracking-wider"
        >
          Back
        </button>
      </div>
    </div>
  );
};
