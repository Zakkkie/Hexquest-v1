
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, Entity, Hex, EntityType, Coordinates } from './types';
import { 
  INITIAL_COINS, INITIAL_MOVES, EXCHANGE_RATE_COINS_PER_MOVE, 
  UPGRADE_LOCK_QUEUE_SIZE, SECONDS_PER_LEVEL_UNIT, BOT_ACTION_INTERVAL_MS
} from './constants';
import { 
  getHexKey, getNeighbors, calculateReward, calculateBotMove, 
  getSecondsToGrow, checkGrowthCondition 
} from './services/hexUtils';
import Hexagon from './components/Hexagon';
import { AlertCircle, Layers, Pause, Play, Trophy, Coins, Footprints, Medal, RefreshCcw, Zap } from 'lucide-react';

const createInitialHex = (q: number, r: number, startLevel = 0): Hex => ({
  id: getHexKey(q, r),
  q, r,
  currentLevel: 0,
  maxLevel: startLevel,
  progress: 0,
  revealed: true
});

const App: React.FC = () => {
  const [state, setState] = useState<GameState>(() => {
    const startHex = createInitialHex(0, 0, 0); 
    const grid: Record<string, Hex> = { [getHexKey(0,0)]: startHex };
    
    getNeighbors(0, 0).forEach(n => {
        grid[getHexKey(n.q, n.r)] = createInitialHex(n.q, n.r, 0);
    });

    return {
      grid,
      currentTurn: 0,
      gameStatus: 'PLAYING',
      messageLog: ['Operational. Capture L1 sectors to fill the Upgrade Cycle (3/3).'],
      player: {
        id: 'player-1',
        type: EntityType.PLAYER,
        q: 0, r: 0,
        playerLevel: 0,
        coins: 0, 
        moves: INITIAL_MOVES,
        totalCoinsEarned: 0,
        recentUpgrades: [] 
      },
      bot: {
        id: 'bot-1',
        type: EntityType.BOT,
        q: 1, r: -1, 
        playerLevel: 0,
        coins: 0, 
        moves: INITIAL_MOVES, 
        totalCoinsEarned: 0,
        recentUpgrades: []
      },
      lastBotActionTime: Date.now(),
      isPlayerGrowing: false,
      isBotGrowing: false
    };
  });

  const [viewBox, setViewBox] = useState({ x: -250, y: -250, w: 500, h: 500 });

  const revealArea = useCallback((grid: Record<string, Hex>, q: number, r: number): Record<string, Hex> => {
    const newGrid = { ...grid };
    const targets = [{ q, r }, ...getNeighbors(q, r)];
    targets.forEach(t => {
      const key = getHexKey(t.q, t.r);
      if (!newGrid[key]) newGrid[key] = createInitialHex(t.q, t.r, 0);
    });
    return newGrid;
  }, []);

  const processGrowthStep = (grid: Record<string, Hex>, entity: Entity, hex: Hex): { grid: Record<string, Hex>, entity: Entity, logs: string[] } => {
    const logs = [];
    let newGrid = { ...grid };
    let updatedEntity = { ...entity };
    
    // Ensure numeric types
    const currentLevel = Number(hex.currentLevel);
    const maxLevel = Number(hex.maxLevel);
    const targetLevel = currentLevel + 1;
    
    // Create new hex object to avoid mutation issues
    const newHex = { ...hex, currentLevel: targetLevel, progress: 0 };

    const rewards = calculateReward(targetLevel);
    let finalCoins = rewards.coins;

    // --- LOGIC FOR LEVEL UP ---
    if (targetLevel > maxLevel) {
      // Record Break Case
      
      if (targetLevel === 1) {
        // L1 Capture: Grant point, capped at 3. Does NOT consume points.
        if (updatedEntity.recentUpgrades.length < UPGRADE_LOCK_QUEUE_SIZE) {
          updatedEntity.recentUpgrades = [...updatedEntity.recentUpgrades, hex.id];
          logs.push(`Sector Synchronized. Cycle: ${updatedEntity.recentUpgrades.length}/3`);
        } else {
          logs.push(`L1 Active. Cycle already at 3/3.`);
        }
      } else {
        // L2+ Record Break: REQUIRED 3/3 cycle points. Consumes ALL points.
        // NOTE: The check is done in 'checkGrowthCondition', so we assume it's valid here.
        updatedEntity.recentUpgrades = [];
        logs.push(`RECORD BREAK! Cycle consumed. Status: 0/3`);
        finalCoins *= 2; 
      }

      // Explicitly update maxLevel on the new hex
      newHex.maxLevel = targetLevel;
      updatedEntity.playerLevel = Math.max(Number(updatedEntity.playerLevel), targetLevel);
      logs.push(`L${targetLevel} Sector Established. +${finalCoins}©.`);
    } else {
      // Restoration Case (No cycle points needed or used)
      logs.push(`L${targetLevel} Restoration complete. +${finalCoins}©.`);
    }

    updatedEntity.coins += finalCoins;
    updatedEntity.totalCoinsEarned += finalCoins;
    updatedEntity.moves += 1;
    
    // Commit to grid
    newGrid[hex.id] = newHex;
    
    return { grid: newGrid, entity: updatedEntity, logs };
  };

  useEffect(() => {
    if (state.gameStatus !== 'PLAYING') return;
    const interval = setInterval(() => {
      setState(prev => {
        let newGrid = { ...prev.grid };
        let newPlayer = { ...prev.player };
        let newBot = { ...prev.bot };
        let logs = [...prev.messageLog];
        let isPlayerGrowing = prev.isPlayerGrowing;
        let isBotGrowing = prev.isBotGrowing;
        let lastBotActionTime = prev.lastBotActionTime;

        if (isPlayerGrowing) {
          const hexKey = getHexKey(newPlayer.q, newPlayer.r);
          const hex = newGrid[hexKey];
          // Re-verify condition just before execution to be safe
          if (hex && checkGrowthCondition(hex, newPlayer).canGrow) {
            const needed = getSecondsToGrow(hex.currentLevel + 1);
            if (hex.progress + 1 >= needed) {
              const res = processGrowthStep(newGrid, newPlayer, hex);
              newGrid = res.grid; 
              newPlayer = res.entity; 
              logs = [...res.logs, ...logs]; 
              isPlayerGrowing = false;
            } else {
              newGrid[hexKey] = { ...hex, progress: hex.progress + 1 };
            }
          } else {
            isPlayerGrowing = false;
          }
        }

        const now = Date.now();
        if (isBotGrowing) {
          const bKey = getHexKey(newBot.q, newBot.r);
          const bHex = newGrid[bKey];
          if (bHex && checkGrowthCondition(bHex, newBot).canGrow) {
            const needed = getSecondsToGrow(bHex.currentLevel + 1);
            if (bHex.progress + 1 >= needed) {
              const res = processGrowthStep(newGrid, newBot, bHex);
              newGrid = res.grid; newBot = res.entity; logs = [...res.logs, ...logs]; isBotGrowing = false;
              lastBotActionTime = now;
            } else {
              newGrid[bKey] = { ...bHex, progress: bHex.progress + 1 };
            }
          } else {
            isBotGrowing = false;
            lastBotActionTime = now;
          }
        } else if (now - lastBotActionTime > BOT_ACTION_INTERVAL_MS) {
          const bKey = getHexKey(newBot.q, newBot.r);
          const bHex = newGrid[bKey];
          const canGrowHere = bHex && checkGrowthCondition(bHex, newBot).canGrow;

          if (canGrowHere) {
            isBotGrowing = true;
          } else if (newBot.moves > 0) {
            const target = calculateBotMove(newBot, newGrid, { q: newPlayer.q, r: newPlayer.r });
            if (target) {
              if (bHex) newGrid[bKey] = { ...bHex, currentLevel: 0, progress: 0 };
              newBot.q = target.q; newBot.r = target.r; newBot.moves -= 1;
              newGrid = revealArea(newGrid, target.q, target.r);
            }
            lastBotActionTime = now;
          } else if (newBot.coins >= EXCHANGE_RATE_COINS_PER_MOVE) {
            newBot.coins -= EXCHANGE_RATE_COINS_PER_MOVE; newBot.moves += 1;
            lastBotActionTime = now;
          }
        }

        return { ...prev, grid: newGrid, player: newPlayer, bot: newBot, messageLog: logs.slice(0, 50), 
                 isPlayerGrowing, isBotGrowing, lastBotActionTime };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state.gameStatus]);

  const handleMove = (tq: number, tr: number) => {
    if (state.player.moves <= 0 || (tq === state.bot.q && tr === state.bot.r)) return;
    setState(prev => {
      let newGrid = { ...prev.grid };
      const oldKey = getHexKey(prev.player.q, prev.player.r);
      if (newGrid[oldKey]) newGrid[oldKey] = { ...newGrid[oldKey], currentLevel: 0, progress: 0 };
      const newPlayer = { ...prev.player, q: tq, r: tr, moves: prev.player.moves - 1 };
      return { ...prev, grid: revealArea(newGrid, tq, tr), player: newPlayer, isPlayerGrowing: false };
    });
  };

  const currentHexKey = getHexKey(state.player.q, state.player.r);
  const currentHex = state.grid[currentHexKey];
  const growthCondition = currentHex ? checkGrowthCondition(currentHex, state.player) : { canGrow: false, reason: '' };
  const cycleCount = Math.min(state.player.recentUpgrades.length, UPGRADE_LOCK_QUEUE_SIZE);

  useEffect(() => {
    const px = 35 * 1.5 * state.player.q;
    const py = 35 * Math.sqrt(3) * (state.player.r + state.player.q/2);
    setViewBox({ x: px - 400, y: py - 300, w: 800, h: 600 });
  }, [state.player.q, state.player.r]);

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      
      {/* Top HUD */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-6 px-10 py-3 bg-slate-900/90 backdrop-blur-3xl rounded-full border border-slate-800 shadow-2xl items-center">
        <div className="flex items-center gap-3">
          <Medal className="w-6 h-6 text-blue-500" />
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-slate-600 uppercase leading-none tracking-widest">Global Rank</span>
            <span className="text-2xl font-black text-white leading-none">{state.player.playerLevel}</span>
          </div>
        </div>
        <div className="w-px h-10 bg-slate-800 mx-1"></div>
        <div className="flex items-center gap-3">
          <Coins className="w-6 h-6 text-amber-500" />
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-slate-600 uppercase leading-none tracking-widest">Credits</span>
            <span className="text-2xl font-black text-white leading-none">{state.player.coins}</span>
          </div>
        </div>
        <div className="w-px h-10 bg-slate-800 mx-1"></div>
        <div className="flex items-center gap-3">
          <Footprints className="w-6 h-6 text-emerald-500" />
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-slate-600 uppercase leading-none tracking-widest">Moves</span>
            <span className="text-2xl font-black text-white leading-none">{state.player.moves}</span>
          </div>
        </div>
      </div>

      {/* Compact Floating HUD */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 w-48">
        {currentHex && !growthCondition.canGrow && !state.isPlayerGrowing && (
          <div className="flex gap-2 p-2 bg-red-950/90 backdrop-blur-2xl rounded-xl border border-red-500/50 shadow-lg animate-pulse">
            <AlertCircle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />
            <span className="text-[8px] text-red-100 uppercase font-black leading-tight tracking-tight">{growthCondition.reason}</span>
          </div>
        )}

        <div className="bg-slate-900/90 backdrop-blur-3xl p-3 rounded-3xl border border-slate-800 shadow-[0_15px_45px_rgba(0,0,0,0.7)] w-full flex flex-col gap-2">
          <button 
            onClick={() => setState(s => ({...s, isPlayerGrowing: !s.isPlayerGrowing}))}
            disabled={!growthCondition.canGrow && !state.isPlayerGrowing}
            className={`w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all active:scale-95 border-b-4
              ${state.isPlayerGrowing 
                ? 'bg-red-600 hover:bg-red-500 border-red-900 text-white' 
                : 'bg-amber-500 hover:bg-amber-400 disabled:opacity-5 border-amber-800 text-slate-950'}`}
          >
            {state.isPlayerGrowing ? <Pause className="w-4 h-4 fill-current"/> : <Play className="w-4 h-4 fill-current"/>}
            {state.isPlayerGrowing ? 'STOP' : 'GROWTH'}
          </button>

          <button 
            disabled={state.player.coins < EXCHANGE_RATE_COINS_PER_MOVE}
            onClick={() => setState(s => ({...s, player: {...s.player, coins: s.player.coins-EXCHANGE_RATE_COINS_PER_MOVE, moves: s.player.moves+1}}))}
            className="w-full py-2 bg-slate-800/80 hover:bg-slate-700/80 rounded-lg text-[8px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 border border-slate-700 disabled:opacity-20 transition-all active:translate-y-1"
          >
            <Zap className="w-3 h-3 text-amber-500 fill-amber-500/20"/> MOVE (2©)
          </button>
        </div>
      </div>

      {/* Left Sidebar */}
      <div className="w-80 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col shadow-2xl z-10">
        <div className="p-8 border-b border-slate-800 bg-black/40 text-center">
          <h1 className="text-4xl font-black text-amber-500 uppercase italic tracking-tighter drop-shadow-[0_0_15px_rgba(245,158,11,0.4)]">HexQuest</h1>
          <p className="text-[10px] text-slate-500 font-mono tracking-[0.3em] uppercase mt-2 opacity-50">Operational Hub</p>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto flex-1 no-scrollbar pt-4">
          <div className="bg-black/40 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
             <div className="bg-slate-800/40 p-4 flex items-center gap-3 border-b border-slate-800">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Standing</span>
             </div>
             <div className="divide-y divide-slate-800/40">
                {[state.player, state.bot].sort((a, b) => (b.totalCoinsEarned || 0) - (a.totalCoinsEarned || 0)).map((e) => (
                   <div key={e.id} className="p-5 flex justify-between items-center hover:bg-white/5 transition-colors">
                      <div className="flex flex-col">
                         <span className={`text-[11px] font-black tracking-tight ${e.type === EntityType.PLAYER ? 'text-blue-400' : 'text-red-400'}`}>
                            {e.type === EntityType.PLAYER ? 'CMD_PILOT' : 'SENTINEL_AI'}
                         </span>
                         <span className="text-[9px] text-slate-600 font-mono mt-0.5">NET: {e.totalCoinsEarned}©</span>
                      </div>
                      <div className="text-right">
                         <div className="text-xs font-mono text-amber-500">{e.coins}©</div>
                         <div className="text-[10px] text-slate-500 uppercase font-black">L{e.playerLevel}</div>
                      </div>
                   </div>
                ))}
             </div>
          </div>

          {currentHex && (
            <div className="bg-slate-800/20 p-5 rounded-3xl border border-slate-800 space-y-5">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-500" /> Active Sector
                </span>
                <span className="text-[12px] text-amber-500 font-black tracking-tighter">
                  L{currentHex.currentLevel} / {currentHex.maxLevel}
                </span>
              </div>
              
              <div className="bg-black/40 p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                  <span className="flex items-center gap-2"><RefreshCcw className="w-3 h-3 text-amber-500" /> Upgrade Cycle</span>
                  <span className={cycleCount >= 3 ? 'text-emerald-400 font-black' : 'text-amber-500'}>
                    {cycleCount} / 3
                  </span>
                </div>
                <div className="flex gap-2 h-2">
                  {[1,2,3].map(i => (
                    <div key={i} className={`flex-1 rounded-full transition-all duration-700 shadow-sm ${i <= cycleCount ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.6)]' : 'bg-slate-900'}`} />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] text-slate-600 uppercase font-black tracking-wider">
                  <span>Growth Progress</span>
                  <span className="font-mono text-slate-400">{currentHex.progress}s / {getSecondsToGrow(currentHex.currentLevel+1)}s</span>
                </div>
                <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                   <div className="h-full bg-gradient-to-r from-emerald-600 to-teal-400 transition-all duration-1000 ease-linear shadow-[0_0_15px_rgba(16,185,129,0.4)]" 
                        style={{ width: `${(currentHex.progress / (getSecondsToGrow(currentHex.currentLevel+1) || 1)) * 100}%` }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="h-56 bg-black/80 p-6 overflow-y-auto font-mono text-[10px] text-slate-500 border-t border-slate-800/60">
          <div className="flex items-center gap-2 mb-4 text-slate-700 font-black uppercase tracking-[0.2em] border-b border-slate-800/40 pb-2">Diagnostic Telemetry</div>
          {state.messageLog.map((m, i) => <div key={i} className="border-l-2 border-slate-800 pl-4 py-1.5 mb-3 hover:text-slate-300 transition-colors leading-relaxed">{m}</div>)}
        </div>
      </div>

      <div className="flex-1 bg-slate-950 relative">
        <svg viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`} className="w-full h-full">
          {(Object.values(state.grid) as Hex[]).map(hex => (
            <Hexagon 
              key={hex.id} hex={hex} 
              entities={[
                ...(state.player.q === hex.q && state.player.r === hex.r ? [state.player] : []),
                ...(state.bot.q === hex.q && state.bot.r === hex.r ? [state.bot] : [])
              ]}
              isPlayerNeighbor={getNeighbors(state.player.q, state.player.r).some(n => n.q === hex.q && n.r === hex.r)}
              onClick={() => handleMove(hex.q, hex.r)}
            />
          ))}
        </svg>
      </div>
    </div>
  );
};

export default App;
