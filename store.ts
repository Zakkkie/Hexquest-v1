
import { create } from 'zustand';
import { GameState, Entity, Hex, EntityType, UserProfile, UIState } from './types';
import { 
  INITIAL_MOVES, UPGRADE_LOCK_QUEUE_SIZE, EXCHANGE_RATE_COINS_PER_MOVE, 
  BOT_ACTION_INTERVAL_MS, SECONDS_PER_LEVEL_UNIT 
} from './constants';
import { 
  getHexKey, getNeighbors, checkGrowthCondition, getSecondsToGrow, 
  calculateReward, calculateBotMove, findPath 
} from './services/hexUtils';

// --- MOCK DATABASE (In-Memory) ---
const MOCK_USER_DB: Record<string, { password: string; avatarColor: string; avatarIcon: string }> = {};

interface AuthResponse {
  success: boolean;
  message?: string;
}

interface GameActions {
  // UI & Auth
  setUIState: (state: UIState) => void;
  
  // Auth Actions
  loginAsGuest: (nickname: string, avatarColor: string, avatarIcon: string) => void;
  registerUser: (nickname: string, password: string, avatarColor: string, avatarIcon: string) => AuthResponse;
  loginUser: (nickname: string, password: string) => AuthResponse;
  logout: () => void;
  
  // Session Management
  startNewGame: () => void;
  abandonSession: () => void;
  
  // Game Actions
  togglePlayerGrowth: () => void;
  rechargeMove: () => void;
  movePlayer: (q: number, r: number) => void;
  confirmPendingAction: () => void;
  cancelPendingAction: () => void;
  processMovementStep: () => void;
  
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

// Helper to generate a fresh game state EXCLUDING hasActiveSession to avoid overwriting issues
const generateInitialGameData = () => {
  const startHex = createInitialHex(0, 0, 0);
  const initialGrid: Record<string, Hex> = { [getHexKey(0,0)]: startHex };
  getNeighbors(0, 0).forEach(n => {
    initialGrid[getHexKey(n.q, n.r)] = createInitialHex(n.q, n.r, 0);
  });
  
  return {
    // Generate a new random session ID to force UI components to reset (e.g. camera position)
    sessionId: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
    grid: initialGrid,
    player: {
      id: 'player-1',
      type: EntityType.PLAYER,
      q: 0, r: 0,
      playerLevel: 0,
      coins: 0,
      moves: INITIAL_MOVES,
      totalCoinsEarned: 0,
      recentUpgrades: [],
      movementQueue: []
    } as Entity,
    bot: {
      id: 'bot-1',
      type: EntityType.BOT,
      q: 1, r: -1,
      playerLevel: 0,
      coins: 0,
      moves: INITIAL_MOVES,
      totalCoinsEarned: 0,
      recentUpgrades: [],
      movementQueue: []
    } as Entity,
    currentTurn: 0,
    messageLog: ['Operational. Capture L1 sectors to fill Upgrade Cycle (3/3).'],
    gameStatus: 'PLAYING' as const,
    pendingConfirmation: null,
    
    isPlayerGrowing: false,
    isBotGrowing: false,
    lastBotActionTime: Date.now(),
    toast: null
  };
};

export const useGameStore = create<GameStore>((set, get) => {
  // Initial Store Setup
  const initialGameData = generateInitialGameData();

  return {
    uiState: 'MENU',
    user: null, 
    hasActiveSession: false,
    ...initialGameData,
    
    // --- Actions ---

    setUIState: (uiState) => set({ uiState }),

    loginAsGuest: (nickname, avatarColor, avatarIcon) => set({
      user: {
        isAuthenticated: true,
        isGuest: true,
        nickname,
        avatarColor,
        avatarIcon
      }
    }),

    registerUser: (nickname, password, avatarColor, avatarIcon) => {
      if (MOCK_USER_DB[nickname]) {
        return { success: false, message: "Nickname already registered." };
      }
      MOCK_USER_DB[nickname] = { password, avatarColor, avatarIcon };
      
      set({
        user: {
          isAuthenticated: true,
          isGuest: false,
          nickname,
          avatarColor,
          avatarIcon
        }
      });
      return { success: true };
    },

    loginUser: (nickname, password) => {
      const record = MOCK_USER_DB[nickname];
      if (!record) {
        return { success: false, message: "User not found." };
      }
      if (record.password !== password) {
        return { success: false, message: "Invalid password." };
      }
      
      set({
        user: {
          isAuthenticated: true,
          isGuest: false,
          nickname,
          avatarColor: record.avatarColor,
          avatarIcon: record.avatarIcon
        }
      });
      return { success: true };
    },

    logout: () => {
      const freshState = generateInitialGameData();
      set({
        ...freshState,
        user: null,
        uiState: 'MENU',
        hasActiveSession: false,
        gameStatus: 'GAME_OVER' 
      });
    },

    startNewGame: () => set((state) => {
      const freshState = generateInitialGameData();
      return {
        ...freshState,
        user: state.user, // Explicitly preserve user
        hasActiveSession: true,
        uiState: 'GAME'
      };
    }),

    abandonSession: () => set((state) => {
      const freshState = generateInitialGameData();
      return {
        ...freshState,
        user: state.user, // Explicitly preserve user
        uiState: 'MENU',
        hasActiveSession: false, 
        gameStatus: 'GAME_OVER'
      };
    }),

    showToast: (message, type) => set({ toast: { message, type, timestamp: Date.now() } }),
    hideToast: () => set({ toast: null }),

    togglePlayerGrowth: () => set(state => {
      if (state.uiState !== 'GAME') return state;
      if (state.player.movementQueue.length > 0) return state;

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
      if (state.uiState !== 'GAME') return state;
      if (state.player.coins < EXCHANGE_RATE_COINS_PER_MOVE) return state;
      return {
        player: {
          ...state.player,
          coins: state.player.coins - EXCHANGE_RATE_COINS_PER_MOVE,
          moves: state.player.moves + 1
        }
      };
    }),

    cancelPendingAction: () => set({ pendingConfirmation: null }),

    confirmPendingAction: () => set(state => {
      if (!state.pendingConfirmation) return state;
      
      const { path, costMoves, costCoins } = state.pendingConfirmation.data;
      
      if (state.player.moves < costMoves || state.player.coins < costCoins) {
        return {
          pendingConfirmation: null,
          toast: { message: "Action Cancelled: Resources changed.", type: 'error', timestamp: Date.now() }
        };
      }

      const newPlayer = { ...state.player };
      newPlayer.moves -= costMoves;
      newPlayer.coins -= costCoins;
      newPlayer.movementQueue = path; 

      return {
        player: newPlayer,
        pendingConfirmation: null,
        isPlayerGrowing: false 
      };
    }),

    movePlayer: (tq, tr) => set(state => {
      if (state.uiState !== 'GAME') return state;
      if (state.player.movementQueue.length > 0) return state;
      
      const { player, bot, grid } = state;

      if (tq === player.q && tr === player.r) return state; 
      
      const targetKey = getHexKey(tq, tr);
      const targetHex = grid[targetKey];

      if (targetHex && targetHex.maxLevel > player.playerLevel) {
        return {
          toast: {
            message: `ACCESS DENIED: SECTOR L${targetHex.maxLevel} REQUIRES RANK L${targetHex.maxLevel}`,
            type: 'error',
            timestamp: Date.now()
          }
        };
      }

      const path = findPath(
        { q: player.q, r: player.r },
        { q: tq, r: tr },
        grid,
        player.playerLevel,
        [{ q: bot.q, r: bot.r }]
      );

      if (!path) {
         return {
           toast: { message: "NO VALID PATH (BLOCKED OR UNREACHABLE)", type: 'error', timestamp: Date.now() }
         };
      }

      const totalCost = path.length;
      let costMoves = 0;
      let costCoins = 0;

      if (player.moves >= totalCost) {
        costMoves = totalCost;
      } else {
        costMoves = player.moves;
        const deficit = totalCost - player.moves;
        costCoins = deficit * EXCHANGE_RATE_COINS_PER_MOVE;
      }

      if (player.coins < costCoins) {
         return {
            toast: { message: `INSUFFICIENT RESOURCES. NEED ${totalCost} MOVES (OR ${costCoins} COINS)`, type: 'error', timestamp: Date.now() }
         };
      }

      if (costCoins > 0) {
        return {
          pendingConfirmation: {
            type: 'MOVE_WITH_COINS',
            data: { path, costMoves, costCoins }
          }
        };
      }

      return {
        player: { 
          ...player, 
          moves: player.moves - costMoves,
          coins: player.coins - costCoins,
          movementQueue: path 
        },
        isPlayerGrowing: false
      };
    }),

    processMovementStep: () => set(state => {
      if (state.player.movementQueue.length === 0) return state;

      const newQueue = [...state.player.movementQueue];
      const nextStep = newQueue.shift(); 
      
      if (!nextStep) return state;

      const newGrid = { ...state.grid };
      
      const oldKey = getHexKey(state.player.q, state.player.r);
      if (newGrid[oldKey]) {
        newGrid[oldKey] = { ...newGrid[oldKey], currentLevel: 0, progress: 0 };
      }

      const neighbors = getNeighbors(nextStep.q, nextStep.r);
      [...neighbors, nextStep].forEach(n => {
        const key = getHexKey(n.q, n.r);
        if (!newGrid[key]) newGrid[key] = createInitialHex(n.q, n.r, 0);
      });

      return {
        grid: newGrid,
        player: {
          ...state.player,
          q: nextStep.q,
          r: nextStep.r,
          movementQueue: newQueue
        }
      };
    }),

    tick: () => set(state => {
      // Early return if not in game mode
      if (state.uiState !== 'GAME' || state.gameStatus !== 'PLAYING') return state;

      const now = Date.now();
      let newGrid = { ...state.grid };
      let newPlayer = { ...state.player };
      let newBot = { ...state.bot };
      let logs = [...state.messageLog];
      let isPlayerGrowing = state.isPlayerGrowing;
      let isBotGrowing = state.isBotGrowing;
      let lastBotActionTime = state.lastBotActionTime;
      const currentTurn = (state.currentTurn || 0) + 1; // Safely handle optional undefined

      const processGrowth = (entity: Entity, isGrowing: boolean): { entity: Entity, isGrowing: boolean, logs: string[] } => {
        if (!isGrowing) return { entity, isGrowing: false, logs: [] };
        if (entity.movementQueue.length > 0) return { entity, isGrowing: false, logs: [] }; 
        
        const key = getHexKey(entity.q, entity.r);
        const hex = newGrid[key];
        
        if (!hex || !checkGrowthCondition(hex, entity).canGrow) {
           return { entity, isGrowing: false, logs: [] };
        }

        const targetLevel = Number(hex.currentLevel) + 1;
        const needed = getSecondsToGrow(targetLevel);
        const currentLogs: string[] = [];
        let updatedEntity = { ...entity };

        if (hex.progress + 1 >= needed) {
           const rewards = calculateReward(targetLevel);
           let finalCoins = rewards.coins;
           const newHex = { ...hex, currentLevel: targetLevel, progress: 0 };
           
           if (targetLevel > hex.maxLevel) {
              if (targetLevel === 1) {
                if (updatedEntity.recentUpgrades.length < UPGRADE_LOCK_QUEUE_SIZE) {
                  updatedEntity.recentUpgrades = [...updatedEntity.recentUpgrades, hex.id];
                  currentLogs.push(`Sector L1 Acquired. Cycle: ${updatedEntity.recentUpgrades.length}/3`);
                }
              } else {
                updatedEntity.recentUpgrades = [];
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

           const reachedCap = targetLevel >= newHex.maxLevel;
           return { entity: updatedEntity, isGrowing: !reachedCap, logs: currentLogs };
        } else {
           newGrid[key] = { ...hex, progress: hex.progress + 1 };
           return { entity, isGrowing: true, logs: [] };
        }
      };

      const pRes = processGrowth(newPlayer, isPlayerGrowing);
      newPlayer = pRes.entity;
      isPlayerGrowing = pRes.isGrowing;
      logs = [...pRes.logs, ...logs];

      const bRes = processGrowth(newBot, isBotGrowing);
      newBot = bRes.entity;
      isBotGrowing = bRes.isGrowing;
      logs = [...bRes.logs, ...logs];

      if (!isBotGrowing && now - lastBotActionTime > BOT_ACTION_INTERVAL_MS) {
        const bKey = getHexKey(newBot.q, newBot.r);
        const bHex = newGrid[bKey];
        
        if (bHex && checkGrowthCondition(bHex, newBot).canGrow) {
           isBotGrowing = true;
           lastBotActionTime = now;
        } else if (newBot.moves > 0) {
           const target = calculateBotMove(newBot, newGrid, { q: newPlayer.q, r: newPlayer.r });
           if (target) {
              if (bHex) newGrid[bKey] = { ...bHex, currentLevel: 0, progress: 0 };
              newBot.q = target.q; 
              newBot.r = target.r; 
              newBot.moves -= 1;
              const neighbors = getNeighbors(target.q, target.r);
              [...neighbors, target].forEach(n => {
                const k = getHexKey(n.q, n.r);
                if (!newGrid[k]) newGrid[k] = createInitialHex(n.q, n.r, 0);
              });
           }
           lastBotActionTime = now;
        } else if (newBot.coins >= EXCHANGE_RATE_COINS_PER_MOVE) {
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
        lastBotActionTime,
        currentTurn
      };
    })
  };
});
