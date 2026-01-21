
import React, { useState, useEffect, useMemo } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { MainMenu } from './components/MainMenu';
import { UpgradeScreen } from './components/UpgradeScreen';
import { ShopUI } from './components/ShopUI';
import { GameEngine } from './engine/GameEngine';
import { InputManager } from './engine/InputManager';
import { audioManager } from './engine/AudioManager';
import { GameState } from './types';

const App: React.FC = () => {
  const input = useMemo(() => new InputManager(), []);
  const engine = useMemo(() => new GameEngine(input), [input]);
  
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [drawState, setDrawState] = useState(engine.getDrawState());

  useEffect(() => {
    const interval = setInterval(() => {
      const state = engine.getDrawState();
      setDrawState(state);
      setGameState(engine.state);

      // Handle music based on game state
      const hasBoss = state.enemies.some(e => e.type === 'BOSS_DRAKE');
      const bossCount = state.enemies.filter(e => e.type === 'BOSS_DRAKE').length;

      if (engine.state === GameState.MENU) {
        audioManager.play('menu');
        audioManager.clearEffects();
      } else if (engine.state === GameState.SHOP) {
        audioManager.play('town');
        audioManager.clearEffects();
      } else if (engine.state === GameState.PLAYING) {
        audioManager.play('battle');
        // Blend boss music based on boss presence and health
        if (hasBoss) {
          const bossIntensity = Math.min(1, bossCount * 0.5 + 0.5);
          audioManager.blendBossMusic(bossIntensity);
          audioManager.applyDangerEffect(bossIntensity * 0.3);
        } else {
          audioManager.blendBossMusic(0);
          audioManager.clearEffects();
        }
      } else if (engine.state === GameState.GAME_OVER) {
        audioManager.play('menu');
        audioManager.clearEffects();
      }
    }, 16);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (gameState === GameState.SHOP) {
          engine.exitShop();
        } else if (gameState === GameState.PLAYING) {
          engine.pause();
        } else if (gameState === GameState.PAUSED) {
          engine.resume();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [engine, gameState]);

  const handleStart = (playerCount: number) => {
    engine.start(playerCount);
    setGameState(GameState.PLAYING);
  };

  const handleRestart = () => {
    engine.reset();
    setGameState(GameState.MENU);
  };

  const handleUpgrade = (id: string) => {
    engine.applyUpgrade(id);
  };

  const handleBuy = (pIdx: number, itemId: string, price: number) => {
    engine.buyItem(pIdx, itemId, price);
  };

  const handleExitShop = () => {
    engine.exitShop();
  };

  const handleEquipSpell = (pIdx: number, spellId: string, slotIdx: number) => {
    engine.equipSpell(pIdx, spellId, slotIdx);
  };

  const handleAllocateStat = (pIdx: number, stat: 'hp' | 'damage' | 'magic' | 'speed') => {
    engine.allocateStat(pIdx, stat);
  };

  const handleResume = () => {
    engine.resume();
  };

  const handleQuitToMenu = () => {
    engine.reset();
    setGameState(GameState.MENU);
  };

  return (
    <div className="relative w-screen h-screen bg-[#050505] overflow-hidden font-rajdhani text-white">
      <div className="w-full h-full">
        <div className="relative w-full h-full">
          
          {gameState === GameState.MENU && <MainMenu onStart={handleStart} />}
          
          {gameState === GameState.UPGRADE && (
            <UpgradeScreen onSelect={handleUpgrade} />
          )}

          {gameState === GameState.SHOP && (
            <ShopUI
                players={drawState.players}
                money={drawState.money}
                town={drawState.town}
                onBuy={handleBuy}
                onEquipSpell={handleEquipSpell}
                onAllocateStat={handleAllocateStat}
                onExit={handleExitShop}
            />
          )}

          <div className="relative w-full h-full flex items-center justify-center">
            <GameCanvas engine={engine} />
            {gameState !== GameState.MENU && (
              <HUD 
                players={drawState.players} 
                score={drawState.score} 
                money={drawState.money}
                town={drawState.town}
                traders={drawState.traders}
                playerPositions={drawState.playerPositions}
                onRestart={handleRestart}
              />
            )}
          </div>

          {gameState === GameState.PAUSED && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md">
              <div className="text-center p-12 bg-black/80 border border-white/20 rounded-3xl shadow-[0_0_50px_rgba(255,255,255,0.1)] max-w-md w-full">
                <h2 className="text-5xl font-orbitron font-bold text-white mb-2">PAUSED</h2>
                <p className="text-white/40 mb-10 tracking-[0.3em] uppercase text-sm">Press ESC to resume</p>
                <div className="space-y-4">
                  <button
                    onClick={handleResume}
                    className="px-10 py-4 bg-white/10 border border-white/20 text-white rounded-full font-bold uppercase tracking-widest hover:bg-white/20 transition-colors w-full"
                  >
                    Resume
                  </button>
                  <button
                    onClick={handleQuitToMenu}
                    className="px-10 py-4 bg-red-900/50 border border-red-500/30 text-red-400 rounded-full font-bold uppercase tracking-widest hover:bg-red-900/70 transition-colors w-full"
                  >
                    Quit to Menu
                  </button>
                </div>
              </div>
            </div>
          )}

          {gameState === GameState.GAME_OVER && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-red-950/40 backdrop-blur-md">
              <div className="text-center p-12 bg-black border border-red-500 rounded-3xl shadow-[0_0_50px_rgba(239,68,68,0.2)] max-w-lg w-full">
                <h2 className="text-6xl font-orbitron font-bold text-red-500 mb-2 text-center">HERO FALLEN</h2>
                <p className="text-gray-400 mb-8 tracking-[0.2em] uppercase font-light text-center">The Ancient Citadel is Lost</p>
                <div className="text-4xl font-bold mb-10 text-white font-orbitron text-center">SCORE: {drawState.score.toLocaleString()}</div>
                <button
                  onClick={handleRestart}
                  className="px-10 py-4 bg-red-600 text-white rounded-full font-bold uppercase tracking-widest hover:bg-red-500 transition-colors shadow-xl w-full"
                >
                  Recall Souls
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="fixed inset-0 pointer-events-none opacity-20 z-[-1] overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600 rounded-full blur-[150px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-600 rounded-full blur-[150px]" />
      </div>
    </div>
  );
};

export default App;
