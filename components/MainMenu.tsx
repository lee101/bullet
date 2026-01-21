
import React, { useState, useEffect } from 'react';

interface MainMenuProps {
  onStart: (multiplayer: boolean) => void;
}

// Control mappings for keyboard and controller
const CONTROLS = {
  keyboard: {
    move: 'WASD',
    spell: 'E',
    parry: 'SHIFT',
    jump: 'SPACE',
    mount: 'R',
    melee: 'F',
  },
  controller: {
    move: 'L-STICK',
    spell: 'RT',
    parry: 'LT',
    jump: 'A',
    mount: 'X',
    melee: 'B',
  },
};

export const MainMenu: React.FC<MainMenuProps> = ({ onStart }) => {
  const [hasController, setHasController] = useState(false);

  useEffect(() => {
    const checkController = () => {
      const gamepads = navigator.getGamepads();
      setHasController(Array.from(gamepads).some(gp => gp && gp.connected));
    };

    checkController();
    window.addEventListener('gamepadconnected', checkController);
    window.addEventListener('gamepaddisconnected', checkController);
    const interval = setInterval(checkController, 1000);

    return () => {
      window.removeEventListener('gamepadconnected', checkController);
      window.removeEventListener('gamepaddisconnected', checkController);
      clearInterval(interval);
    };
  }, []);

  const c = hasController ? CONTROLS.controller : CONTROLS.keyboard;
  const inputType = hasController ? 'Controller' : 'Keyboard';

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-xl z-50 p-6">
      <div className="max-w-3xl w-full text-center p-12 bg-white/5 rounded-[3rem] border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.5)]">
        <h1 className="text-8xl font-orbitron font-bold mb-4 tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-white via-white/80 to-yellow-600 drop-shadow-2xl uppercase">
          Ethereal Storm
        </h1>
        <p className="text-yellow-400/60 mb-12 text-sm tracking-[0.5em] uppercase font-bold">
          {hasController ? 'Controller Detected' : 'Keyboard Mode'}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <button
            onClick={() => onStart(false)}
            className="group relative px-8 py-10 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 hover:border-yellow-500/30 transition-all duration-500 overflow-hidden shadow-2xl"
          >
            <div className="relative z-10 text-2xl font-bold font-orbitron text-white group-hover:scale-105 transition-transform uppercase">
              Lone Knight
            </div>
            <div className="text-[10px] text-white/30 mt-3 uppercase tracking-widest font-mono">
              {c.move} + {c.spell}/{c.melee} + {c.parry} + {c.jump}
            </div>
          </button>

          <button
            onClick={() => onStart(true)}
            className="group relative px-8 py-10 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 hover:border-yellow-500/30 transition-all duration-500 overflow-hidden shadow-2xl"
          >
            <div className="relative z-10 text-2xl font-bold font-orbitron text-white group-hover:scale-105 transition-transform uppercase">
              Battle Duo
            </div>
            <div className="text-[10px] text-white/30 mt-3 uppercase tracking-widest font-mono">
              {hasController ? '2 Controllers' : 'P1: WASD / P2: Arrows'}
            </div>
          </button>
        </div>

        <div className="space-y-4 text-left p-8 bg-black/40 rounded-3xl border border-white/5 backdrop-blur-md">
          <div className="text-[10px] text-white/20 uppercase tracking-widest mb-2">{inputType} Controls</div>
          <div className="grid grid-cols-2 gap-8">
            <div className="text-[11px] text-white/40 space-y-3">
              <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-white/80 font-mono">SPELL</span> <span className="text-purple-400">{c.spell}</span></div>
              <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-white/80 font-mono">PARRY</span> <span className="text-blue-400">{c.parry}</span></div>
              <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-white/80 font-mono">JUMP</span> <span className="text-green-400">{c.jump}</span></div>
              <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-white/80 font-mono">MOUNT/INTERACT</span> <span className="text-yellow-400">{c.mount}</span></div>
            </div>
            <div className="text-[11px] text-white/40 space-y-2 border-l border-white/10 pl-8 flex flex-col justify-center">
              <div><span className="text-yellow-500 font-bold">MOUNTS:</span> Find steeds or drakes for speed.</div>
              <div><span className="text-red-500 font-bold">RESCUE:</span> Hold [{c.mount}] near fallen allies.</div>
              <div><span className="text-blue-400 font-bold">COINS:</span> Gather gold to buy artifacts.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
