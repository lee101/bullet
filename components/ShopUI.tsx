
import React, { useState, useEffect, useCallback } from 'react';
import { PlayerStats, TownState } from '../types';
import { SHOP_ITEMS, MAX_SLOTS, TOWN_DIALOGUES, SPELL_DATA } from '../constants';
import { InputManager } from '../engine/InputManager';

interface ShopUIProps {
  players: PlayerStats[];
  money: number;
  town: TownState;
  onBuy: (playerIdx: number, itemId: string, price: number) => void;
  onEquipSpell?: (playerIdx: number, spellId: string, slotIdx: number) => void;
  onExit: () => void;
  inputManager?: InputManager;
}

export const ShopUI: React.FC<ShopUIProps> = ({ players, money, town, onBuy, onEquipSpell, onExit, inputManager }) => {
  const [activeTab, setActiveTab] = useState<'WEAPON' | 'ARMOR' | 'MAGIC' | 'SPELL' | 'UTILITY'>('WEAPON');
  const [selectedPlayer, setSelectedPlayer] = useState(0);
  const [selectedItem, setSelectedItem] = useState(0);
  const [hasController, setHasController] = useState(false);
  const [equipMode, setEquipMode] = useState<number | null>(null); // Which slot we're equipping to

  const tabs: ('WEAPON' | 'ARMOR' | 'MAGIC' | 'SPELL' | 'UTILITY')[] = ['WEAPON', 'ARMOR', 'MAGIC', 'SPELL', 'UTILITY'];

  const filteredItems = SHOP_ITEMS.filter(item => {
      if (item.category !== activeTab) return false;
      if (item.tier > town.level) return false;
      return true;
  });

  const dialogue = TOWN_DIALOGUES[Math.min(town.level - 1, TOWN_DIALOGUES.length - 1)];

  useEffect(() => {
    const checkController = () => {
      const gamepads = navigator.getGamepads();
      for (const gp of gamepads) {
        if (gp && gp.connected) {
          setHasController(true);
          return;
        }
      }
      setHasController(false);
    };
    checkController();
    const interval = setInterval(checkController, 500);
    window.addEventListener('gamepadconnected', () => setHasController(true));
    window.addEventListener('gamepaddisconnected', checkController);
    return () => {
      clearInterval(interval);
      window.removeEventListener('gamepadconnected', () => setHasController(true));
      window.removeEventListener('gamepaddisconnected', checkController);
    };
  }, []);

  useEffect(() => {
    setSelectedItem(0);
  }, [activeTab]);

  useEffect(() => {
    let animFrame: number;
    let lastLB = false, lastRB = false, lastA = false, lastB = false;

    const pollController = () => {
      const gp = navigator.getGamepads()[0];
      if (gp) {
        const threshold = 0.5;
        const now = Date.now();

        // LB/RB for tab switching
        if (gp.buttons[4]?.pressed && !lastLB) {
          const idx = tabs.indexOf(activeTab);
          if (idx > 0) setActiveTab(tabs[idx - 1]);
        }
        if (gp.buttons[5]?.pressed && !lastRB) {
          const idx = tabs.indexOf(activeTab);
          if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1]);
        }
        lastLB = gp.buttons[4]?.pressed || false;
        lastRB = gp.buttons[5]?.pressed || false;

        // D-pad or stick for navigation
        if (gp.buttons[12]?.pressed || gp.axes[1] < -threshold) {
          setSelectedItem(prev => Math.max(0, prev - 1));
        }
        if (gp.buttons[13]?.pressed || gp.axes[1] > threshold) {
          setSelectedItem(prev => Math.min(filteredItems.length - 1, prev + 1));
        }
        if (gp.buttons[14]?.pressed || gp.axes[0] < -threshold) {
          setSelectedPlayer(prev => Math.max(0, prev - 1));
        }
        if (gp.buttons[15]?.pressed || gp.axes[0] > threshold) {
          setSelectedPlayer(prev => Math.min(players.length - 1, prev + 1));
        }

        // A to buy
        if (gp.buttons[0]?.pressed && !lastA) {
          const item = filteredItems[selectedItem];
          if (item && money >= item.price) {
            onBuy(selectedPlayer, item.id, item.price);
          }
        }
        lastA = gp.buttons[0]?.pressed || false;

        // B to exit
        if (gp.buttons[1]?.pressed && !lastB) {
          onExit();
        }
        lastB = gp.buttons[1]?.pressed || false;
      }
      animFrame = requestAnimationFrame(pollController);
    };

    animFrame = requestAnimationFrame(pollController);
    return () => cancelAnimationFrame(animFrame);
  }, [activeTab, filteredItems, money, onBuy, onExit, players.length, selectedItem, selectedPlayer, tabs]);

  const exitLabel = hasController ? 'Ⓑ Back' : 'Esc';
  const buyLabel = hasController ? 'Ⓐ Buy' : 'Click';
  const tabHint = hasController ? 'ⓁⒷ/ⓇⒷ' : '';

  return (
    <div className="fixed inset-0 z-[60] bg-[#0a0a0c]/95 backdrop-blur-2xl flex flex-col p-4 font-rajdhani">
      <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-3">
        <div className="flex items-center gap-6">
          <div>
            <h2 className="text-3xl font-orbitron font-bold text-white tracking-tighter uppercase italic">{town.name}</h2>
            <p className="text-yellow-500 font-bold tracking-[0.3em] text-[10px]">CITADEL LVL {town.level}</p>
          </div>
          <div className="p-2 bg-white/5 border border-white/10 rounded-xl max-w-sm hidden lg:block">
             <p className="text-white/60 italic text-xs leading-snug">"{dialogue}"</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-yellow-400/5 border border-yellow-400/30 px-4 py-2 rounded-2xl text-center">
              <span className="text-yellow-400 font-bold text-xl font-orbitron">{money.toLocaleString()}</span>
              <span className="text-yellow-400/60 text-xs ml-1">GOLD</span>
          </div>
          <button onClick={onExit} className="bg-white/5 hover:bg-white/10 text-white px-6 py-2 rounded-2xl font-bold uppercase tracking-wider text-sm transition-all border border-white/10">
            {exitLabel}
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        {tabs.map((tab, idx) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full font-bold uppercase tracking-wider text-xs transition-all border ${
              activeTab === tab ? 'bg-yellow-500 text-black border-yellow-500' : 'bg-white/5 text-white/40 border-white/10 hover:border-white/30'
            }`}
          >
            {tab}
          </button>
        ))}
        {tabHint && <span className="text-white/30 text-xs self-center ml-2">{tabHint}</span>}
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
        {players.map((p, idx) => {
            const currentSlots = activeTab === 'WEAPON' ? p.weaponSlots : activeTab === 'ARMOR' ? p.armorSlots : activeTab === 'MAGIC' ? p.magicSlots : null;
            const slotsRemaining = currentSlots ? MAX_SLOTS - currentSlots.length : null;
            const isSelectedPlayer = idx === selectedPlayer && hasController;

            // Get owned spells for this player
            const freeSpells = SHOP_ITEMS.filter(i => i.category === 'SPELL' && i.price === 0).map(i => i.id);
            const ownedSpells = [...freeSpells, ...p.magicSlots.filter(s => s.startsWith('spell_'))];

            return (
              <div key={idx} className={`flex-1 flex flex-col bg-white/5 border rounded-2xl p-4 overflow-hidden relative ${isSelectedPlayer ? 'border-yellow-500/50' : 'border-white/10'}`}>
                <div className="flex justify-between items-center mb-3 border-b border-white/5 pb-2">
                    <span className="text-lg font-orbitron font-bold uppercase" style={{ color: p.color }}>P{idx + 1}</span>
                    {activeTab !== 'SPELL' && slotsRemaining !== null && (
                        <div className="flex gap-1">
                            {[...Array(MAX_SLOTS)].map((_, si) => (
                                <div key={si} className={`w-2 h-2 rounded-sm rotate-45 border ${si < currentSlots!.length ? 'bg-yellow-500 border-yellow-500' : 'border-white/20'}`} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Spell slots display for SPELL tab */}
                {activeTab === 'SPELL' && (
                  <div className="mb-3 p-2 bg-black/30 rounded-xl border border-white/10">
                    <div className="text-[9px] text-white/40 uppercase font-bold mb-2">EQUIPPED SPELLS</div>
                    <div className="grid grid-cols-4 gap-2">
                      {['X', 'Y', 'B', 'A'].map((btn, slotIdx) => {
                        const spellId = p.equippedSpells[slotIdx];
                        const spell = spellId ? SHOP_ITEMS.find(i => i.id === spellId) : null;
                        const isEquipping = equipMode === slotIdx && idx === selectedPlayer;

                        return (
                          <button
                            key={btn}
                            onClick={() => setEquipMode(isEquipping ? null : slotIdx)}
                            className={`p-2 rounded-lg border text-center transition-all ${
                              isEquipping ? 'bg-yellow-500/30 border-yellow-500' : 'bg-white/5 border-white/10 hover:border-white/30'
                            }`}
                          >
                            <div className="text-[10px] font-bold text-white/60">{btn}</div>
                            <div className="text-lg">{spell?.icon || '—'}</div>
                            <div className="text-[8px] text-white/40 truncate">{spell?.name || 'Empty'}</div>
                          </button>
                        );
                      })}
                    </div>
                    {equipMode !== null && (
                      <div className="mt-2 text-[10px] text-yellow-400 text-center animate-pulse">
                        Click a spell below to equip to {['X', 'Y', 'B', 'A'][equipMode]}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar">
                  {filteredItems.map((item, itemIdx) => {
                      const canAfford = money >= item.price;
                      const hasSlot = slotsRemaining === null || slotsRemaining > 0 || item.id === 'upgrade_town';
                      const isSpell = item.category === 'SPELL';
                      const ownsSpell = isSpell && ownedSpells.includes(item.id);
                      const disabled = isSpell ? (!ownsSpell && !canAfford) : (!canAfford || !hasSlot);
                      const isSelected = hasController && idx === selectedPlayer && itemIdx === selectedItem;

                      const handleClick = () => {
                        if (isSpell) {
                          if (ownsSpell && equipMode !== null && onEquipSpell) {
                            onEquipSpell(idx, item.id, equipMode);
                            setEquipMode(null);
                          } else if (!ownsSpell && canAfford) {
                            onBuy(idx, item.id, item.price);
                          }
                        } else {
                          onBuy(idx, item.id, item.price);
                        }
                      };

                      return (
                        <button
                          key={item.id}
                          disabled={disabled && !ownsSpell}
                          onClick={handleClick}
                          className={`w-full group flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left ${
                            isSelected ? 'bg-yellow-500/20 border-yellow-500' :
                            ownsSpell ? 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20' :
                            !disabled ? 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-yellow-500/30' : 'bg-black/40 border-white/5 opacity-40'
                          }`}
                        >
                          <div className="w-10 h-10 bg-black/40 rounded-lg flex items-center justify-center text-xl border border-white/5 flex-shrink-0">
                            {item.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-white text-sm font-orbitron tracking-tight truncate">{item.name}</div>
                            <div className="text-[9px] text-white/40 uppercase font-bold truncate">{item.description}</div>
                            {isSpell && item.spellData && (
                              <div className="text-[8px] text-cyan-400/60 mt-0.5">
                                {item.spellData.manaCost > 0 && `${item.spellData.manaCost} MP`}
                                {item.spellData.damage > 0 && ` • ${item.spellData.damage} DMG`}
                              </div>
                            )}
                          </div>
                          <div className={`font-orbitron font-bold text-sm flex-shrink-0 ${
                            ownsSpell ? 'text-green-400' : canAfford ? 'text-yellow-400' : 'text-gray-600'
                          }`}>
                            {ownsSpell ? '✓' : item.price}
                          </div>
                        </button>
                      );
                  })}
                </div>
              </div>
            );
        })}
      </div>

      {hasController && (
        <div className="mt-3 flex justify-center gap-6 text-xs text-white/40">
          <span>Ⓐ {buyLabel}</span>
          <span>Ⓑ Back</span>
          <span>ⓁⒷ/ⓇⒷ Tabs</span>
          <span>◀▶ Player</span>
          <span>▲▼ Items</span>
        </div>
      )}
    </div>
  );
};
