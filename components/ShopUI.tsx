
import React, { useState } from 'react';
import { PlayerStats, TownState } from '../types';
import { SHOP_ITEMS, MAX_SLOTS, TOWN_DIALOGUES } from '../constants';

interface ShopUIProps {
  players: PlayerStats[];
  money: number;
  town: TownState;
  onBuy: (playerIdx: number, itemId: string, price: number) => void;
  onExit: () => void;
}

export const ShopUI: React.FC<ShopUIProps> = ({ players, money, town, onBuy, onExit }) => {
  const [activeTab, setActiveTab] = useState<'WEAPON' | 'ARMOR' | 'MAGIC' | 'UTILITY'>('WEAPON');

  const filteredItems = SHOP_ITEMS.filter(item => {
      if (item.category !== activeTab) return false;
      if (item.tier > town.level) return false;
      return true;
  });

  const dialogue = TOWN_DIALOGUES[Math.min(town.level - 1, TOWN_DIALOGUES.length - 1)];

  return (
    <div className="fixed inset-0 z-[60] bg-[#0a0a0c]/95 backdrop-blur-2xl flex flex-col p-8 font-rajdhani">
      <div className="flex justify-between items-start mb-10 border-b border-white/5 pb-8">
        <div>
          <h2 className="text-6xl font-orbitron font-bold text-white tracking-tighter uppercase italic">{town.name}</h2>
          <p className="text-yellow-500 font-bold tracking-[0.4em] text-xs mt-2">CITADEL ECONOMY: LVL {town.level}</p>
          <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded-2xl max-w-xl">
             <p className="text-white/80 italic text-sm leading-relaxed">"{dialogue}"</p>
          </div>
        </div>
        <div className="flex items-center gap-10">
          <div className="bg-yellow-400/5 border border-yellow-400/30 px-8 py-4 rounded-3xl text-center">
              <span className="text-white/40 text-[10px] uppercase font-bold block mb-1">Treasury</span>
              <span className="text-yellow-400 font-bold text-3xl font-orbitron">{money.toLocaleString()} COINS</span>
          </div>
          <button onClick={onExit} className="bg-white/5 hover:bg-white/10 text-white px-10 py-4 rounded-3xl font-bold uppercase tracking-widest transition-all border border-white/10">
            Leave Citadel [Esc]
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-8">
        {(['WEAPON', 'ARMOR', 'MAGIC', 'UTILITY'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-8 py-3 rounded-full font-bold uppercase tracking-widest transition-all border ${
              activeTab === tab ? 'bg-yellow-500 text-black border-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.3)]' : 'bg-white/5 text-white/40 border-white/10 hover:border-white/30'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 flex gap-10 overflow-hidden">
        {players.map((p, idx) => {
            const currentSlots = activeTab === 'WEAPON' ? p.weaponSlots : activeTab === 'ARMOR' ? p.armorSlots : activeTab === 'MAGIC' ? p.magicSlots : null;
            const slotsRemaining = currentSlots ? MAX_SLOTS - currentSlots.length : null;

            return (
              <div key={idx} className="flex-1 flex flex-col bg-white/5 border border-white/10 rounded-[3rem] p-10 overflow-hidden relative shadow-2xl">
                <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-6">
                    <div>
                        <span className="text-2xl font-orbitron font-bold uppercase block" style={{ color: p.color }}>PLAYER {idx + 1}</span>
                    </div>
                    {slotsRemaining !== null && (
                        <div className="text-right">
                            <span className="text-white/40 text-[10px] uppercase font-bold block mb-1">Slots Used</span>
                            <div className="flex gap-1.5 justify-end">
                                {[...Array(MAX_SLOTS)].map((_, si) => (
                                    <div key={si} className={`w-3 h-3 rounded-sm rotate-45 border ${si < currentSlots!.length ? 'bg-yellow-500 border-yellow-500' : 'border-white/10'}`} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto pr-4 space-y-4 custom-scrollbar">
                  {filteredItems.map((item) => {
                      const canAfford = money >= item.price;
                      const hasSlot = slotsRemaining === null || slotsRemaining > 0 || item.id === 'upgrade_town';
                      const disabled = !canAfford || !hasSlot;
                      return (
                        <button
                          key={item.id}
                          disabled={disabled}
                          onClick={() => onBuy(idx, item.id, item.price)}
                          className={`group relative flex items-center gap-6 p-6 rounded-[2rem] border transition-all duration-500 text-left ${
                            !disabled ? 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-yellow-500/50 hover:translate-x-2' : 'bg-black/40 border-white/5 opacity-40 grayscale'
                          }`}
                        >
                          <div className="w-16 h-16 bg-black/60 rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 transition-all border border-white/5">
                            {item.icon}
                          </div>
                          <div className="flex-1">
                            <div className="font-bold text-white text-lg font-orbitron tracking-tight">{item.name}</div>
                            <div className="text-[10px] text-white/40 uppercase font-bold mt-1 tracking-wider">{item.description}</div>
                          </div>
                          <div className={`font-orbitron font-bold text-xl ${canAfford ? 'text-yellow-400' : 'text-gray-600'}`}>
                            {item.price}
                          </div>
                        </button>
                      );
                  })}
                </div>
              </div>
            );
        })}
      </div>
    </div>
  );
};
