
import { create } from 'zustand';
import { GameState, Entity, Hex, EntityType } from './types';
import { 
  INITIAL_MOVES, UPGRADE_LOCK_QUEUE_SIZE, EXCHANGE_RATE_COINS_PER_MOVE, 
  BOT_ACTION_INTERVAL_MS, SECONDS_PER_LEVEL_UNIT 
} from './constants';
import { 
  getHexKey, getNeighbors, checkGrowthCondition, getSecondsToGrow, 
  calculateReward, calculateBotMove 
} from './services/hexUtils';

interface GameActions {
  togglePlayerGrowth: () => void;
  rechargeMove: () => void;
  movePlayer: (q: number, r: number) => void;
  tick: () => void;
  showToast: (message: string, type: 'error' | 'success' | 'info') => void;
  hideToast: () => void;
}

type GameStore = GameState & GameActions;

const createInitialHex = (q: number, r: number, startLevel = 0): Hex => ({
  id: getHexKey(q, r),
  q, r,
  currentLevel: 0,
  maxLevel: startLevel,
  progress: 0,
  revealed: true
});

export const useGameStore = create<GameStore>((set, get) => {
  // Initial Setup
  const startHex = createInitialHex(0, 0, 0);
  const initialGrid: Record<string, Hex> = { [getHexKey(0,0)]: startHex };
  getNeighbors(0, 0).forEach(n => {
    initialGrid[getHexKey(n.q, n.r)] = createInitialHex(n.q, n.r, 0);
  });

  return {
    grid: initialGrid,
    currentTurn: 0,
    gameStatus: 'PLAYING',
    messageLog: ['Operational. Capture L1 sectors to fill Upgrade Cycle (3/3).'],
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
    isBotGrowing: false,
    toast: null,

    showToast: (message, type) => set({ toast: { message, type, timestamp: Date.now() } }),
    hideToast: () => set({ toast: null }),

    togglePlayerGrowth: () => set(state => {
      // If turning ON, check condition first
      if (!state.isPlayerGrowing) {
        const hex = state.grid[getHexKey(state.player.q, state.player.r)];
        if (hex) {
          const condition = checkGrowthCondition(hex, state.player);
          if (!condition.canGrow) {
             return { 
               toast: { 
                 message: condition.reason || "Growth Denied", 
                 type: 'error', 
                 timestamp: Date.now() 
               } 
             };
          }
        }
      }
      return { isPlayerGrowing: !state.isPlayerGrowing };
    }),

    rechargeMove: () => set(state => {
      if (state.player.coins < EXCHANGE_RATE_COINS_PER_MOVE) return state;
      return {
        player: {
          ...state.player,
          coins: state.player.coins - EXCHANGE_RATE_COINS_PER_MOVE,
          moves: state.player.moves + 1
        }
      };
    }),

    movePlayer: (tq, tr) => set(state => {
      if (state.player.moves <= 0 || (tq === state.bot.q && tr === state.bot.r)) return state;
      
      const newGrid = { ...state.grid };
      const oldKey = getHexKey(state.player.q, state.player.r);
      
      // Reset current level progress on exit
      if (newGrid[oldKey]) {
        newGrid[oldKey] = { ...newGrid[oldKey], currentLevel: 0, progress: 0 };
      }

      // Reveal area
      const neighbors = getNeighbors(tq, tr);
      [...neighbors, { q: tq, r: tr }].forEach(n => {
        const key = getHexKey(n.q, n.r);
        if (!newGrid[key]) newGrid[key] = createInitialHex(n.q, n.r, 0);
      });

      return {
        grid: newGrid,
        player: { ...state.player, q: tq, r: tr, moves: state.player.moves - 1 },
        isPlayerGrowing: false
      };
    }),

    tick: () => set(state => {
      if (state.gameStatus !== 'PLAYING') return state;

      const now = Date.now();
      let newGrid = { ...state.grid };
      let newPlayer = { ...state.player };
      let newBot = { ...state.bot };
      let logs = [...state.messageLog];
      let isPlayerGrowing = state.isPlayerGrowing;
      let isBotGrowing = state.isBotGrowing;
      let lastBotActionTime = state.lastBotActionTime;

      // --- Growth Processing Helper ---
      const processGrowth = (entity: Entity, isGrowing: boolean): { entity: Entity, isGrowing: boolean, logs: string[] } => {
        if (!isGrowing) return { entity, isGrowing: false, logs: [] };
        
        const key = getHexKey(entity.q, entity.r);
        const hex = newGrid[key];
        
        if (!hex || !checkGrowthCondition(hex, entity).canGrow) {
           // Silent stop if invalid during tick
           return { entity, isGrowing: false, logs: [] };
        }

        const targetLevel = Number(hex.currentLevel) + 1;
        const needed = getSecondsToGrow(targetLevel);
        const currentLogs: string[] = [];
        let updatedEntity = { ...entity };

        if (hex.progress + 1 >= needed) {
           // Level Up!
           const rewards = calculateReward(targetLevel);
           let finalCoins = rewards.coins;
           const newHex = { ...hex, currentLevel: targetLevel, progress: 0 };
           
           if (targetLevel > hex.maxLevel) {
              // Record Break
              if (targetLevel === 1) {
                if (updatedEntity.recentUpgrades.length < UPGRADE_LOCK_QUEUE_SIZE) {
                  updatedEntity.recentUpgrades = [...updatedEntity.recentUpgrades, hex.id];
                  currentLogs.push(`Sector L1 Acquired. Cycle: ${updatedEntity.recentUpgrades.length}/3`);
                }
              } else {
                // L2+ requires full cycle, consumes it
                updatedEntity.recentUpgrades = [];
                // Bonus is Level Squared
                finalCoins = targetLevel * targetLevel;
                currentLogs.push(`RECORD BREAK L${targetLevel}! +${finalCoins}© Cycle Consumed.`);
              }
              newHex.maxLevel = targetLevel;
              updatedEntity.playerLevel = Math.max(updatedEntity.playerLevel, targetLevel);
           } else {
             currentLogs.push(`L${targetLevel} Restored. +${finalCoins}©`);
           }

           updatedEntity.coins += finalCoins;
           updatedEntity.totalCoinsEarned += finalCoins;
           updatedEntity.moves += 1;
           newGrid[key] = newHex;

           // Continue growing if we haven't reached the max cap yet
           const reachedCap = targetLevel >= newHex.maxLevel;
           
           return { entity: updatedEntity, isGrowing: !reachedCap, logs: currentLogs };
        } else {
           // IMMUTABLE UPDATE CRITICAL FOR PERFORMANCE:
           // Only this specific hex key changes reference. Others remain same.
           newGrid[key] = { ...hex, progress: hex.progress + 1 };
           return { entity, isGrowing: true, logs: [] };
        }
      };

      // Process Player
      const pRes = processGrowth(newPlayer, isPlayerGrowing);
      newPlayer = pRes.entity;
      isPlayerGrowing = pRes.isGrowing;
      logs = [...pRes.logs, ...logs];

      // Process Bot
      const bRes = processGrowth(newBot, isBotGrowing);
      newBot = bRes.entity;
      isBotGrowing = bRes.isGrowing;
      logs = [...bRes.logs, ...logs];

      // Bot AI
      if (!isBotGrowing && now - lastBotActionTime > BOT_ACTION_INTERVAL_MS) {
        const bKey = getHexKey(newBot.q, newBot.r);
        const bHex = newGrid[bKey];
        
        // Try to grow if possible
        if (bHex && checkGrowthCondition(bHex, newBot).canGrow) {
           isBotGrowing = true;
           lastBotActionTime = now;
        } else if (newBot.moves > 0) {
           // Move
           const target = calculateBotMove(newBot, newGrid, { q: newPlayer.q, r: newPlayer.r });
           if (target) {
              if (bHex) newGrid[bKey] = { ...bHex, currentLevel: 0, progress: 0 };
              
              newBot.q = target.q; 
              newBot.r = target.r; 
              newBot.moves -= 1;

              // Reveal bot area
              const neighbors = getNeighbors(target.q, target.r);
              [...neighbors, target].forEach(n => {
                const k = getHexKey(n.q, n.r);
                if (!newGrid[k]) newGrid[k] = createInitialHex(n.q, n.r, 0);
              });
           }
           lastBotActionTime = now;
        } else if (newBot.coins >= EXCHANGE_RATE_COINS_PER_MOVE) {
           // Recharge
           newBot.coins -= EXCHANGE_RATE_COINS_PER_MOVE;
           newBot.moves += 1;
           lastBotActionTime = now;
        }
      }

      return {
        grid: newGrid,
        player: newPlayer,
        bot: newBot,
        messageLog: logs.slice(0, 50),
        isPlayerGrowing,
        isBotGrowing,
        lastBotActionTime
      };
    })
  };
});
