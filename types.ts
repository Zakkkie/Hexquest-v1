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
}

export interface GameState {
  grid: Record<string, Hex>; // Key format: "q,r"
  player: Entity;
  bot: Entity;
  currentTurn: number;
  gameStatus: 'PLAYING' | 'GAME_OVER';
  messageLog: string[];
  lastBotActionTime: number;
  isPlayerGrowing: boolean;
  isBotGrowing: boolean;
}