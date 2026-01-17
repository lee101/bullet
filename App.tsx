
import React, { useState, useEffect, useMemo } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { MainMenu } from './components/MainMenu';
import { UpgradeScreen } from './components/UpgradeScreen';
import { ShopUI } from './components/ShopUI';
import { GameEngine } from './engine/GameEngine';
import { InputManager } from './engine/InputManager';
import { GameState } from './types';

const App: React.FC = () => {
  const input = useMemo(() => new InputManager(), []);
  const engine = useMemo(() => new GameEngine(input), [input]);
  
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [drawState, setDrawState] = useState(engine.getDrawState());

  useEffect(() => {
    const interval = setInterval(() => {
      setDrawState(engine.getDrawState());
      setGameState(engine.state);
    }, 16); 

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (gameState === GameState.SHOP) engine.exitShop();
        else {
          engine.reset();
          setGameState(GameState.MENU);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [engine, gameState]);

  const handleStart = (multiplayer: boolean) => {
    engine.start(multiplayer);
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

  return (
    <div className="relative w-screen h-screen bg-[#050505] flex items-center justify-center overflow-hidden font-rajdhani text-white">
      <div className="w-full h-full max-w-[1920px] max-h-[1080px] flex items-center justify-center p-4">
        <div className="relative w-full aspect-video flex items-center justify-center">
          
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
