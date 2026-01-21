
import React, { useState, useEffect } from 'react';

interface MainMenuProps {
  onStart: (playerCount: number) => void;
}

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
  const [controllerCount, setControllerCount] = useState(0);

  useEffect(() => {
    const checkControllers = () => {
      const gamepads = navigator.getGamepads();
      let count = 0;
      for (let i = 0; i < 4; i++) {
        if (gamepads[i] && gamepads[i]!.connected) count++;
      }
      setControllerCount(count);
    };

    checkControllers();
    window.addEventListener('gamepadconnected', checkControllers);
    window.addEventListener('gamepaddisconnected', checkControllers);
    const interval = setInterval(checkControllers, 500);

    return () => {
      window.removeEventListener('gamepadconnected', checkControllers);
      window.removeEventListener('gamepaddisconnected', checkControllers);
      clearInterval(interval);
    };
  }, []);

  const hasController = controllerCount > 0;
  const c = hasController ? CONTROLS.controller : CONTROLS.keyboard;
  const maxPlayers = hasController ? Math.min(4, controllerCount) : 2;

  const playerModes = [
    { count: 1, label: 'Solo Knight', desc: 'Single player' },
    { count: 2, label: 'Battle Duo', desc: hasController ? '2 Controllers' : 'P1: WASD / P2: Arrows' },
    { count: 3, label: 'Trinity', desc: '3 Controllers' },
    { count: 4, label: 'Full Squad', desc: '4 Controllers' },
  ];

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-xl z-50 p-6">
      <div className="max-w-4xl w-full text-center p-16 bg-white/5 rounded-[3rem] border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.5)]">
        <h1 className="text-[6rem] leading-none font-orbitron font-bold mb-6 tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-white via-white/80 to-yellow-600 drop-shadow-2xl uppercase">
          Ethereal Storm
        </h1>
        <p className="text-yellow-400/60 mb-16 text-lg tracking-[0.5em] uppercase font-bold">
          {controllerCount > 0 ? `${controllerCount} Controller${controllerCount > 1 ? 's' : ''} Connected` : 'Keyboard Mode'}
        </p>

        <div className={`grid gap-5 mb-16 ${maxPlayers <= 2 ? 'grid-cols-2' : 'grid-cols-4'}`}>
          {playerModes.slice(0, maxPlayers).map(mode => (
            <button
              key={mode.count}
              onClick={() => onStart(mode.count)}
              className="group relative px-6 py-8 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 hover:border-yellow-500/30 transition-all duration-500 overflow-hidden shadow-2xl"
            >
              <div className="relative z-10 text-2xl font-bold font-orbitron text-white group-hover:scale-105 transition-transform uppercase">
                {mode.label}
              </div>
              <div className="text-sm text-white/40 mt-3 uppercase tracking-widest font-mono">
                {mode.desc}
              </div>
            </button>
          ))}
        </div>

        <div className="space-y-4 text-left p-10 bg-black/40 rounded-3xl border border-white/5 backdrop-blur-md">
          <div className="text-sm text-white/30 uppercase tracking-widest mb-4">
            {hasController ? 'Controller' : 'Keyboard'} Controls
          </div>
          <div className="grid grid-cols-2 gap-10">
            <div className="text-base text-white/40 space-y-4">
              <div className="flex justify-between border-b border-white/5 pb-2"><span className="text-white/80 font-mono text-lg">SPELL</span> <span className="text-purple-400 text-lg">{c.spell}</span></div>
              <div className="flex justify-between border-b border-white/5 pb-2"><span className="text-white/80 font-mono text-lg">PARRY</span> <span className="text-blue-400 text-lg">{c.parry}</span></div>
              <div className="flex justify-between border-b border-white/5 pb-2"><span className="text-white/80 font-mono text-lg">JUMP</span> <span className="text-green-400 text-lg">{c.jump}</span></div>
              <div className="flex justify-between border-b border-white/5 pb-2"><span className="text-white/80 font-mono text-lg">MOUNT</span> <span className="text-yellow-400 text-lg">{c.mount}</span></div>
            </div>
            <div className="text-base text-white/40 space-y-3 border-l border-white/10 pl-10 flex flex-col justify-center">
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
