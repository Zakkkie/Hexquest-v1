
import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import Konva from 'konva';
import { useGameStore } from '../store';
import { getHexKey, getNeighbors, checkGrowthCondition, getSecondsToGrow, hexToPixel } from '../services/hexUtils';
import Hexagon from './Hexagon'; 
import Unit from './Unit';
import { 
  AlertCircle, Layers, Pause, Play, Trophy, Coins, Footprints, Medal, RefreshCcw, Zap, AlertTriangle, Menu, CheckCircle, XCircle, LogOut,
  User, Shield, Ghost, Bot
} from 'lucide-react';
import { UPGRADE_LOCK_QUEUE_SIZE, EXCHANGE_RATE_COINS_PER_MOVE, HEX_SIZE } from '../constants';
import { Hex } from '../types';
import GameAdvisor from './GameAdvisor';

const VIEWPORT_PADDING = 150; 
const ANIMATION_STEP_MS = 250; // Speed of movement

// Icon helper
const getAvatarIcon = (iconId: string) => {
  switch (iconId) {
    case 'zap': return Zap;
    case 'shield': return Shield;
    case 'ghost': return Ghost;
    default: return User;
  }
};

const GameView: React.FC = () => {
  // Window size state
  const [dimensions, setDimensions] = useState({ 
    width: window.innerWidth, 
    height: window.innerHeight 
  });

  // Viewport State (Camera)
  const [viewState, setViewState] = useState({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    scale: 1
  });

  // Local state for exit confirmation
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);

  // Select state slices
  const { 
    grid, player, bot, user,
    messageLog, isPlayerGrowing, toast, pendingConfirmation,
    movePlayer, togglePlayerGrowth, rechargeMove, hideToast,
    abandonSession, processMovementStep, confirmPendingAction, cancelPendingAction
  } = useGameStore();

  // --- MOVEMENT ANIMATION LOOP ---
  useEffect(() => {
    let interval: number;
    if (player.movementQueue.length > 0) {
      interval = window.setInterval(() => {
        processMovementStep();
      }, ANIMATION_STEP_MS);
    }
    return () => clearInterval(interval);
  }, [player.movementQueue.length, processMovementStep]);

  // Toast Auto-Hide
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => hideToast(), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast, hideToast]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Derived UI State
  const currentHex = grid[getHexKey(player.q, player.r)];
  const growthCondition = currentHex 
    ? checkGrowthCondition(currentHex, player) 
    : { canGrow: false, reason: '' };
  
  const cycleCount = Math.min(player.recentUpgrades.length, UPGRADE_LOCK_QUEUE_SIZE);
  const isMoving = player.movementQueue.length > 0;

  // Zoom Logic
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;

    const scaleBy = 1.1;
    const oldScale = viewState.scale;
    const pointer = stage.getPointerPosition();

    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - viewState.x) / oldScale,
      y: (pointer.y - viewState.y) / oldScale,
    };

    let newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    newScale = Math.max(0.2, Math.min(newScale, 3));

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    setViewState({
      x: newPos.x,
      y: newPos.y,
      scale: newScale
    });
  }, [viewState]);

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    setViewState(prev => ({
      ...prev,
      x: e.target.x(),
      y: e.target.y()
    }));
  };

  const playerNeighbors = useMemo(() => {
    return getNeighbors(player.q, player.r);
  }, [player.q, player.r]);

  const playerNeighborKeys = useMemo(() => {
    return new Set(playerNeighbors.map(n => getHexKey(n.q, n.r)));
  }, [playerNeighbors]);

  const visibleHexIds = useMemo(() => {
    const visibleIds: string[] = [];
    const allHexes = Object.values(grid) as Hex[];
    
    const minX = -viewState.x / viewState.scale - VIEWPORT_PADDING / viewState.scale;
    const minY = -viewState.y / viewState.scale - VIEWPORT_PADDING / viewState.scale;
    const maxX = (dimensions.width - viewState.x) / viewState.scale + VIEWPORT_PADDING / viewState.scale;
    const maxY = (dimensions.height - viewState.y) / viewState.scale + VIEWPORT_PADDING / viewState.scale;

    for (const hex of allHexes) {
      const px = HEX_SIZE * (3/2 * hex.q);
      const py = HEX_SIZE * Math.sqrt(3) * (hex.r + hex.q / 2);

      if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
        visibleIds.push(hex.id);
      }
    }
    return visibleIds;
  }, [grid, viewState, dimensions]);

  const connectorLines = useMemo(() => {
    // If moving, don't show connector lines, it looks messy
    if (isMoving) return null;

    const start = hexToPixel(player.q, player.r);
    return playerNeighbors.map(neighbor => {
       const key = getHexKey(neighbor.q, neighbor.r);
       const hex = grid[key];
       const isBot = neighbor.q === bot.q && neighbor.r === bot.r;
       const isLocked = hex && hex.maxLevel > player.playerLevel;
       
       if (isBot) return null; 
       
       const end = hexToPixel(neighbor.q, neighbor.r);
       
       const canAfford = player.moves >= 1 || player.coins >= EXCHANGE_RATE_COINS_PER_MOVE;
       const color = canAfford ? '#3b82f6' : '#ef4444'; 
       const dash = [5, 5];

       return (
         <Line
           key={`conn-${key}`}
           points={[start.x, start.y, end.x, end.y]}
           stroke={color}
           strokeWidth={2}
           dash={dash}
           opacity={isLocked ? 0.2 : 0.6} 
           listening={false}
         />
       );
    });
  }, [player.q, player.r, player.moves, player.coins, player.playerLevel, playerNeighbors, grid, bot.q, bot.r, isMoving]);


  return (
    <div className="relative h-full w-full">
      {/* CANVAS LAYER (Z-INDEX 0) */}
      <div className="absolute inset-0 z-0 bg-[#020617]">
        <Stage 
          width={dimensions.width} 
          height={dimensions.height} 
          draggable
          onWheel={handleWheel}
          onDragEnd={handleDragEnd}
          x={viewState.x}
          y={viewState.y}
          scaleX={viewState.scale}
          scaleY={viewState.scale}
        >
          <Layer>
            {visibleHexIds.map((id) => (
              <Hexagon 
                key={id} 
                id={id} 
                isPlayerNeighbor={playerNeighborKeys.has(id)}
                playerRank={player.playerLevel} 
                onHexClick={movePlayer} 
              />
            ))}
            
            {connectorLines}

            <Unit q={player.q} r={player.r} type={player.type} />
            <Unit q={bot.q} r={bot.r} type={bot.type} />
          </Layer>
        </Stage>
      </div>

      {/* --- UI OVERLAYS (Z-INDEX > 0) --- */}

      {/* Game Advisor Chat */}
      <GameAdvisor />

      {/* MOVE COST CONFIRMATION MODAL */}
      {pendingConfirmation && (
        <div className="absolute inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center pointer-events-auto">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl shadow-2xl max-w-sm w-full text-center">
             <div className="mx-auto w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center mb-4">
               <Coins className="w-6 h-6 text-amber-500" />
             </div>
             <h3 className="text-xl font-bold text-white mb-2">Insufficient Moves</h3>
             <p className="text-slate-400 text-sm mb-6">
               This trajectory requires converting credits to fuel.
             </p>
             
             <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mb-6 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500 uppercase">Cost</span>
                <div className="text-amber-500 font-mono font-bold flex items-center gap-2">
                   -{pendingConfirmation.data.costCoins} <Coins className="w-4 h-4" />
                </div>
             </div>

             <div className="flex gap-3">
               <button 
                 onClick={cancelPendingAction}
                 className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 font-bold text-xs uppercase tracking-wider"
               >
                 Cancel
               </button>
               <button 
                 onClick={confirmPendingAction}
                 className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 rounded-xl text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20"
               >
                 Authorize
               </button>
             </div>
          </div>
        </div>
      )}

      {/* EXIT SESSION CONFIRMATION MODAL */}
      {showExitConfirmation && (
        <div className="absolute inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center pointer-events-auto">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl shadow-2xl max-w-sm w-full text-center relative overflow-hidden">
             {/* Background effect */}
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50"></div>
             
             <div className="mx-auto w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20">
               <LogOut className="w-6 h-6 text-red-500" />
             </div>
             <h3 className="text-xl font-bold text-white mb-2">Abort Mission?</h3>
             <p className="text-slate-400 text-xs mb-6 leading-relaxed">
               Terminating the session will disconnect from the current sector. <br/>
               <span className="text-red-400 font-bold">All unsaved tactical data will be lost.</span>
             </p>
             
             <div className="flex gap-3">
               <button 
                 onClick={() => setShowExitConfirmation(false)}
                 className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 font-bold text-xs uppercase tracking-wider transition-colors"
               >
                 Cancel
               </button>
               <button 
                 onClick={() => {
                   abandonSession();
                   setShowExitConfirmation(false);
                 }}
                 className="flex-1 py-3 bg-red-900/50 hover:bg-red-800/50 border border-red-800/50 rounded-xl text-red-200 hover:text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-900/20 transition-all"
               >
                 Confirm Exit
               </button>
             </div>
          </div>
        </div>
      )}

      {/* EXIT BUTTON (Triggers Modal) */}
      <div className="absolute top-4 left-4 z-50 pointer-events-auto">
        <button 
            onClick={() => setShowExitConfirmation(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 hover:bg-slate-800 backdrop-blur-md rounded-xl border border-slate-700 text-slate-300 hover:text-white transition-colors text-xs font-bold uppercase tracking-wider"
        >
            <Menu className="w-4 h-4" /> Menu
        </button>
      </div>

      {/* POPUP TOAST MESSAGE */}
      {toast && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-red-950/90 border border-red-500 text-red-100 px-6 py-3 rounded-2xl shadow-[0_0_30px_rgba(239,68,68,0.6)] backdrop-blur-md flex items-center gap-3">
             <AlertTriangle className="w-6 h-6 text-red-500" />
             <span className="text-sm font-black uppercase tracking-wider">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Top HUD */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-6 px-10 py-3 bg-slate-900/90 backdrop-blur-3xl rounded-full border border-slate-800 shadow-2xl items-center pointer-events-auto">
        <div className="flex items-center gap-3">
          <Medal className="w-6 h-6 text-blue-500" />
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-slate-600 uppercase leading-none tracking-widest">Global Rank</span>
            <span className="text-2xl font-black text-white leading-none">{player.playerLevel}</span>
          </div>
        </div>
        <div className="w-px h-10 bg-slate-800 mx-1"></div>
        <div className="flex items-center gap-3">
          <Coins className="w-6 h-6 text-amber-500" />
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-slate-600 uppercase leading-none tracking-widest">Credits</span>
            <span className="text-2xl font-black text-white leading-none">{player.coins}</span>
          </div>
        </div>
        <div className="w-px h-10 bg-slate-800 mx-1"></div>
        <div className="flex items-center gap-3">
          <Footprints className={`w-6 h-6 ${isMoving ? 'text-slate-500 animate-pulse' : 'text-emerald-500'}`} />
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-slate-600 uppercase leading-none tracking-widest">Moves</span>
            <span className="text-2xl font-black text-white leading-none">{player.moves}</span>
          </div>
        </div>
      </div>

      {/* Floating Control HUD */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 w-48 pointer-events-auto">
        {currentHex && !growthCondition.canGrow && !isPlayerGrowing && !isMoving && (
          <div className="flex gap-2 p-2 bg-red-950/90 backdrop-blur-2xl rounded-xl border border-red-500/50 shadow-lg animate-pulse">
            <AlertCircle className="w-3 h-3 text-red-500 flex-shrink-0 mt-0.5" />
            <span className="text-[8px] text-red-100 uppercase font-black leading-tight tracking-tight">{growthCondition.reason}</span>
          </div>
        )}

        <div className="bg-slate-900/90 backdrop-blur-3xl p-3 rounded-3xl border border-slate-800 shadow-[0_15px_45px_rgba(0,0,0,0.7)] w-full flex flex-col gap-2">
          <button 
            onClick={togglePlayerGrowth}
            disabled={isMoving}
            className={`w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all active:scale-95 border-b-4
              ${isPlayerGrowing 
                ? 'bg-red-600 hover:bg-red-500 border-red-900 text-white' 
                : (!growthCondition.canGrow || isMoving ? 'bg-slate-700 text-slate-500 border-slate-900 cursor-not-allowed' : 'bg-amber-500 hover:bg-amber-400 border-amber-800 text-slate-950')}`}
          >
            {isPlayerGrowing ? <Pause className="w-4 h-4 fill-current"/> : <Play className="w-4 h-4 fill-current"/>}
            {isMoving ? 'MOVING...' : (isPlayerGrowing ? 'STOP' : 'GROWTH')}
          </button>

          <button 
            disabled={player.coins < EXCHANGE_RATE_COINS_PER_MOVE || isMoving}
            onClick={rechargeMove}
            className="w-full py-2 bg-slate-800/80 hover:bg-slate-700/80 rounded-lg text-[8px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 border border-slate-700 disabled:opacity-20 transition-all active:translate-y-1"
          >
            <Zap className="w-3 h-3 text-amber-500 fill-amber-500/20"/> MOVE (2©)
          </button>
        </div>
      </div>

      {/* Sidebar HUD */}
      <div className="absolute top-0 left-0 bottom-0 w-80 bg-slate-900/95 backdrop-blur-xl border-r border-slate-800 flex flex-col shadow-2xl z-10 pointer-events-auto">
        <div className="p-8 border-b border-slate-800 bg-black/40 text-center">
          <h1 className="text-4xl font-black text-amber-500 uppercase italic tracking-tighter drop-shadow-[0_0_15px_rgba(245,158,11,0.4)]">HexQuest</h1>
          <p className="text-[10px] text-slate-500 font-mono tracking-[0.3em] uppercase mt-2 opacity-50">Operational Hub</p>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto flex-1 no-scrollbar pt-4">
          {/* Rankings */}
          <div className="bg-black/40 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl">
             <div className="bg-slate-800/40 p-4 flex items-center gap-3 border-b border-slate-800">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Standing</span>
             </div>
             <div className="divide-y divide-slate-800/40">
                {[player, bot].sort((a, b) => (b.totalCoinsEarned || 0) - (a.totalCoinsEarned || 0)).map((e) => {
                   const isPlayer = e.type === 'PLAYER';
                   const Icon = isPlayer ? getAvatarIcon(user?.avatarIcon || 'user') : Bot;
                   const color = isPlayer ? (user?.avatarColor || '#3b82f6') : '#ef4444';
                   
                   return (
                   <div key={e.id} className="p-5 flex justify-between items-center hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3">
                         {/* Avatar */}
                         <div className="w-8 h-8 rounded-full flex items-center justify-center border border-white/10 shadow-lg" style={{ backgroundColor: color }}>
                             <Icon className="w-4 h-4 text-white" />
                         </div>
                         <div className="flex flex-col">
                            <span className={`text-[10px] font-black tracking-tight ${isPlayer ? 'text-indigo-400' : 'text-red-400'}`}>
                              {isPlayer ? (user?.nickname || 'CMD_PILOT') : 'SENTINEL_AI'}
                            </span>
                            <span className="text-[9px] text-slate-600 font-mono mt-0.5">NET: {e.totalCoinsEarned}©</span>
                         </div>
                      </div>
                      <div className="text-right">
                         <div className="text-xs font-mono text-amber-500">{e.coins}©</div>
                         <div className="text-[10px] text-slate-500 uppercase font-black">L{e.playerLevel}</div>
                      </div>
                   </div>
                   );
                })}
             </div>
          </div>

          {/* Active Sector Info */}
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

        {/* Telemetry Log */}
        <div className="h-56 bg-black/80 p-6 overflow-y-auto font-mono text-[10px] text-slate-500 border-t border-slate-800/60">
          <div className="flex items-center gap-2 mb-4 text-slate-700 font-black uppercase tracking-[0.2em] border-b border-slate-800/40 pb-2">Diagnostic Telemetry</div>
          {messageLog.map((m, i) => <div key={i} className="border-l-2 border-slate-800 pl-4 py-1.5 mb-3 hover:text-slate-300 transition-colors leading-relaxed">{m}</div>)}
        </div>
      </div>
    </div>
  );
};

export default GameView;
