
import React, { useEffect } from 'react';
import { useGameStore } from './store';
import GameView from './components/GameView';
import MainMenu from './components/MainMenu';
import Leaderboard from './components/Leaderboard';

const App: React.FC = () => {
  // Use selectors to avoid re-rendering App on every single state change (like tick)
  const uiState = useGameStore(state => state.uiState);
  const sessionId = useGameStore(state => state.sessionId);
  const tick = useGameStore(state => state.tick);

  // Central Game Loop - Only ticks if the store says so (inside tick logic)
  useEffect(() => {
    const interval = setInterval(() => {
        tick();
    }, 1000);
    return () => clearInterval(interval);
  }, [tick]);

  return (
    <div className="relative w-screen h-screen bg-slate-950 overflow-hidden font-sans select-none">
      
      {/* Background Ambience (Visible in Menu/Leaderboard) */}
      {uiState !== 'GAME' && (
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-900 blur-[150px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-900 blur-[150px]" />
          {/* Hex Grid Background Pattern */}
          <div className="absolute inset-0" 
               style={{ 
                 backgroundImage: 'radial-gradient(circle, #334155 1px, transparent 1px)', 
                 backgroundSize: '40px 40px',
                 opacity: 0.2
               }} 
          />
        </div>
      )}

      {/* Main Content Switcher */}
      <div className="relative z-10 w-full h-full">
        {uiState === 'MENU' && <MainMenu />}
        {/* Using sessionId as key forces a complete unmount/remount of GameView when a new game starts, 
            ensuring all local state (camera, animations) is reset. */}
        {uiState === 'GAME' && <GameView key={sessionId} />}
        {uiState === 'LEADERBOARD' && <Leaderboard />}
      </div>

    </div>
  );
};

export default App;
