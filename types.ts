
export interface Coordinates {
  q: number;
  r: number;
}

export interface Hex {
  id: string;
  q: number;
  r: number;
  currentLevel: number; // Resets to 0 on exit
  maxLevel: number;     // Permanent peak level
  progress: number;     // Seconds accumulated towards next level
  revealed: boolean;
}

export enum EntityType {
  PLAYER = 'PLAYER',
  BOT = 'BOT'
}

export interface Entity {
  id: string;
  type: EntityType;
  q: number;
  r: number;
  playerLevel: number; // Highest maxLevel achieved by this entity
  coins: number;
  totalCoinsEarned: number;
  moves: number;
  recentUpgrades: string[]; // Queue of Hex IDs where maxLevel was increased
  movementQueue: Coordinates[]; // For animated steps
}

export interface ToastMessage {
  message: string;
  type: 'error' | 'success' | 'info';
  timestamp: number;
}

export type UIState = 'MENU' | 'GAME' | 'LEADERBOARD';

export interface UserProfile {
  isAuthenticated: boolean;
  isGuest: boolean;
  nickname: string;
  avatarColor: string;
  avatarIcon: string;
}

export interface PendingConfirmation {
  type: 'MOVE_WITH_COINS';
  data: {
    path: Coordinates[];
    costMoves: number;
    costCoins: number;
  };
}

export interface GameState {
  // UI State
  uiState: UIState;
  user: UserProfile | null;
  pendingConfirmation: PendingConfirmation | null;
  
  // Game Session Data
  sessionId: string; // Unique ID for the current game session
  grid: Record<string, Hex>; // Key format: "q,r"
  player: Entity;
  bot: Entity;
  currentTurn: number;
  gameStatus: 'PLAYING' | 'GAME_OVER';
  messageLog: string[];
  lastBotActionTime: number;
  isPlayerGrowing: boolean;
  isBotGrowing: boolean;
  toast: ToastMessage | null;
  
  // Session Persistence flag
  hasActiveSession: boolean;
}
