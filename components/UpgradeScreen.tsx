
import React from 'react';
import { UpgradeOption } from '../types';

interface UpgradeScreenProps {
  onSelect: (id: string) => void;
}

const UPGRADES: UpgradeOption[] = [
  { id: 'damage', name: 'PLASMA COILS', description: 'Weapon damage +12', icon: '⚡' },
  { id: 'health', name: 'NANO-REPAIR', description: 'HP +60 & Full Recovery', icon: '💉' },
  { id: 'speed', name: 'THRUSTER OVERDRIVE', description: 'Speed +0.6', icon: '🚀' },
  { id: 'magic', name: 'FOCUS CRYSTAL', description: 'Refine Magic Cycling', icon: '🔮' },
];

export const UpgradeScreen: React.FC<UpgradeScreenProps> = ({ onSelect }) => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 backdrop-blur-3xl z-50 p-6">
      <div className="max-w-4xl w-full p-12 bg-white/5 rounded-[3rem] border border-white/10 shadow-3xl">
        <h2 className="text-6xl font-orbitron font-bold text-white mb-2 text-center tracking-tighter">WAVE COLLAPSE</h2>
        <p className="text-blue-400 text-center uppercase tracking-[0.5em] mb-12 font-bold text-xs">Evolution Choice Required</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {UPGRADES.map((up) => (
            <button
              key={up.id}
              onClick={() => onSelect(up.id)}
              className="group flex items-center gap-6 p-8 bg-white/5 border border-white/10 rounded-3xl hover:bg-white/10 hover:border-blue-500/50 transition-all duration-500 text-left shadow-xl"
            >
              <div className="text-4xl w-20 h-20 flex items-center justify-center bg-black/40 rounded-2xl group-hover:scale-110 group-hover:rotate-6 transition-all">
                {up.icon}
              </div>
              <div>
                <div className="text-xl font-orbitron font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">{up.name}</div>
                <div className="text-xs text-white/40 leading-relaxed">{up.description}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-12 text-center text-white/20 animate-pulse uppercase tracking-[0.3em] text-[10px] font-bold">
          Confirming augmentations...
        </div>
      </div>
    </div>
  );
};
