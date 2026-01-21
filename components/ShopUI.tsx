
import React, { useState, useEffect, useCallback } from 'react';
import { PlayerStats, TownState, ShopItem } from '../types';
import { SHOP_ITEMS, MAX_SLOTS, TOWN_DIALOGUES, SPELL_DATA, STAT_POINT_VALUES } from '../constants';
import { InputManager } from '../engine/InputManager';

// Shopkeeper portraits - replace with FLUX 4B generated images
const SHOPKEEPER_PORTRAITS: Record<number, string> = {
  1: '/assets/shopkeeper/merchant_basic.png',
  2: '/assets/shopkeeper/merchant_prosperous.png',
  3: '/assets/shopkeeper/merchant_wealthy.png',
  4: '/assets/shopkeeper/merchant_legendary.png',
};

// Item category art backgrounds
const CATEGORY_ART: Record<string, string> = {
  WEAPON: '/assets/shop/weapons_banner.png',
  ARMOR: '/assets/shop/armor_banner.png',
  MAGIC: '/assets/shop/magic_banner.png',
  SPELL: '/assets/shop/spells_banner.png',
  UTILITY: '/assets/shop/utility_banner.png',
};

interface ShopUIProps {
  players: PlayerStats[];
  money: number;
  town: TownState;
  onBuy: (playerIdx: number, itemId: string, price: number) => void;
  onEquipSpell?: (playerIdx: number, spellId: string, slotIdx: number) => void;
  onAllocateStat?: (playerIdx: number, stat: 'hp' | 'damage' | 'magic' | 'speed') => void;
  onExit: () => void;
  inputManager?: InputManager;
}

export const ShopUI: React.FC<ShopUIProps> = ({ players, money, town, onBuy, onEquipSpell, onAllocateStat, onExit, inputManager }) => {
  const [activeTab, setActiveTab] = useState<'STATS' | 'WEAPON' | 'ARMOR' | 'MAGIC' | 'SPELL' | 'UTILITY'>('STATS');
  const [selectedPlayer, setSelectedPlayer] = useState(0);
  const [selectedItem, setSelectedItem] = useState(0);
  const [hasController, setHasController] = useState(false);
  const [equipMode, setEquipMode] = useState<number | null>(null);
  const [hoveredItem, setHoveredItem] = useState<ShopItem | null>(null);
  const [shopkeeperLoaded, setShopkeeperLoaded] = useState(false);

  const tabs: ('STATS' | 'WEAPON' | 'ARMOR' | 'MAGIC' | 'SPELL' | 'UTILITY')[] = ['STATS', 'WEAPON', 'ARMOR', 'MAGIC', 'SPELL', 'UTILITY'];

  const filteredItems = activeTab === 'STATS' ? [] : SHOP_ITEMS.filter(item => {
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

  const currentItem = hoveredItem || filteredItems[selectedItem];
  const shopkeeperLevel = Math.min(town.level, 4);

  return (
    <div className="fixed inset-0 z-[60] bg-[#0a0a0c]/95 backdrop-blur-2xl flex flex-col p-4 font-rajdhani">
      {/* Header with shopkeeper portrait */}
      <div className="flex justify-between items-start mb-4 border-b border-white/5 pb-3">
        <div className="flex items-center gap-4">
          {/* Shopkeeper portrait */}
          <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-yellow-500/30 bg-gradient-to-b from-amber-900/40 to-amber-950/60">
            <img
              src={SHOPKEEPER_PORTRAITS[shopkeeperLevel]}
              alt="Shopkeeper"
              className="w-full h-full object-cover"
              onLoad={() => setShopkeeperLoaded(true)}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            {!shopkeeperLoaded && (
              <div className="absolute inset-0 flex items-center justify-center text-4xl">
                {town.level >= 3 ? '👑' : town.level >= 2 ? '🧙' : '🧔'}
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-center py-0.5">
              <span className="text-[8px] text-yellow-400 font-bold uppercase tracking-wider">Merchant</span>
            </div>
          </div>

          <div>
            <h2 className="text-3xl font-orbitron font-bold text-white tracking-tighter uppercase italic">{town.name}</h2>
            <p className="text-yellow-500 font-bold tracking-[0.3em] text-[10px]">CITADEL LVL {town.level}</p>
            <div className="mt-1 p-2 bg-white/5 border border-white/10 rounded-lg max-w-xs">
              <p className="text-white/60 italic text-[10px] leading-snug">"{dialogue}"</p>
            </div>
          </div>
        </div>

        {/* Item preview panel */}
        {currentItem && (
          <div className="w-64 bg-black/40 border border-white/10 rounded-2xl p-3 mr-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-14 h-14 bg-gradient-to-br from-amber-900/40 to-amber-950/60 rounded-xl flex items-center justify-center text-3xl border border-white/10">
                {currentItem.icon}
              </div>
              <div className="flex-1">
                <div className="font-orbitron font-bold text-white text-sm">{currentItem.name}</div>
                <div className="text-[9px] text-yellow-400/70 uppercase">{currentItem.category} T{currentItem.tier}</div>
              </div>
            </div>
            <p className="text-white/50 text-[10px] mb-2">{currentItem.description}</p>
            {currentItem.mods && Object.keys(currentItem.mods).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {currentItem.mods.dmg && <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[9px] rounded">+{currentItem.mods.dmg} DMG</span>}
                {currentItem.mods.hp && <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-[9px] rounded">+{currentItem.mods.hp} HP</span>}
                {currentItem.mods.spd && <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 text-[9px] rounded">+{currentItem.mods.spd} SPD</span>}
                {currentItem.mods.mag && <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 text-[9px] rounded">+{currentItem.mods.mag} MP</span>}
                {currentItem.mods.proj && <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-[9px] rounded">+{currentItem.mods.proj} PROJ</span>}
              </div>
            )}
            {currentItem.spellData && (
              <div className="flex flex-wrap gap-1 mt-1">
                <span className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 text-[9px] rounded">{currentItem.spellData.manaCost} MP</span>
                {currentItem.spellData.damage > 0 && <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[9px] rounded">{currentItem.spellData.damage} DMG</span>}
                <span className="px-1.5 py-0.5 bg-gray-500/20 text-gray-400 text-[9px] rounded">{(currentItem.spellData.cooldown / 60).toFixed(1)}s CD</span>
              </div>
            )}
          </div>
        )}

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

                {/* Stats allocation for STATS tab */}
                {activeTab === 'STATS' && (
                  <div className="flex-1 p-2">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-white/60 text-xs uppercase">Available Points</span>
                      <span className={`font-orbitron font-bold text-2xl ${p.statPoints > 0 ? 'text-green-400' : 'text-white/30'}`}>
                        {p.statPoints}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {(['hp', 'damage', 'magic', 'speed'] as const).map(stat => {
                        const info = STAT_POINT_VALUES[stat];
                        const canAllocate = p.statPoints >= info.cost;
                        const currentVal = stat === 'hp' ? p.maxHp : stat === 'magic' ? p.maxMagic : p[stat];
                        const icons = { hp: '❤️', damage: '⚔️', magic: '✨', speed: '💨' };
                        const colors = { hp: 'green', damage: 'red', magic: 'purple', speed: 'blue' };
                        return (
                          <button
                            key={stat}
                            disabled={!canAllocate}
                            onClick={() => onAllocateStat?.(idx, stat)}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                              canAllocate ? `bg-${colors[stat]}-500/10 border-${colors[stat]}-500/30 hover:bg-${colors[stat]}-500/20` : 'bg-black/20 border-white/5 opacity-50'
                            }`}
                          >
                            <span className="text-2xl">{icons[stat]}</span>
                            <div className="flex-1 text-left">
                              <div className="font-orbitron font-bold text-white uppercase text-sm">{stat}</div>
                              <div className="text-[10px] text-white/40">
                                Current: {typeof currentVal === 'number' ? currentVal.toFixed(stat === 'speed' ? 2 : 0) : currentVal}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-${colors[stat]}-400 font-bold text-sm`}>+{info.gain}</div>
                              <div className="text-[9px] text-white/40">{info.cost} pt{info.cost > 1 ? 's' : ''}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-4 p-3 bg-white/5 rounded-xl border border-white/10">
                      <div className="text-[10px] text-white/40 uppercase mb-2">Player Stats</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="text-white/60">Level: <span className="text-yellow-400 font-bold">{p.level}</span></div>
                        <div className="text-white/60">XP: <span className="text-cyan-400 font-bold">{p.xp}</span></div>
                        <div className="text-white/60">HP: <span className="text-green-400 font-bold">{p.maxHp}</span></div>
                        <div className="text-white/60">DMG: <span className="text-red-400 font-bold">{p.damage}</span></div>
                        <div className="text-white/60">Magic: <span className="text-purple-400 font-bold">{p.maxMagic}</span></div>
                        <div className="text-white/60">Speed: <span className="text-blue-400 font-bold">{p.speed.toFixed(2)}</span></div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar">
                  {activeTab !== 'STATS' && filteredItems.map((item, itemIdx) => {
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
                          onMouseEnter={() => setHoveredItem(item)}
                          onMouseLeave={() => setHoveredItem(null)}
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
