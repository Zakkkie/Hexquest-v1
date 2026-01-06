
import { Coordinates, Hex, Entity, EntityType } from '../types';
import { SECONDS_PER_LEVEL_UNIT, UPGRADE_LOCK_QUEUE_SIZE } from '../constants';

// --- Coordinate Math ---

export const getHexKey = (q: number, r: number): string => `${q},${r}`;

export const getCoordinatesFromKey = (key: string): Coordinates => {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
};

export const cubeDistance = (a: Coordinates, b: Coordinates): number => {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
};

export const getDistanceToCenter = (q: number, r: number): number => {
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
};

export const getNeighbors = (q: number, r: number): Coordinates[] => {
  const directions = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
  ];
  return directions.map(d => ({ q: q + d.q, r: r + d.r }));
};

// --- Game Rule Calculations ---

export const calculateReward = (newHexLevel: number): { coins: number, moves: number } => {
  return {
    coins: newHexLevel,
    moves: 1
  };
};

export const getSecondsToGrow = (targetLevel: number): number => {
  // Scale: 10s, 20s, 30s, 40s...
  return targetLevel * SECONDS_PER_LEVEL_UNIT;
};

/**
 * STRICT RULE: To increase MAX LEVEL (Record), you must have a full Upgrade Cycle (3 points).
 * EXCEPTION: Level 0 -> Level 1 (First acquisition) is FREE of cycle requirement.
 * RULE: Standard level restoration (currentLevel <= maxLevel) is always allowed.
 */
export const checkGrowthCondition = (
  hex: Hex, 
  entity: Entity
): { canGrow: boolean; reason?: string } => {
  const targetLevel = Number(hex.currentLevel) + 1;

  // Record breaking condition (trying to exceed the highest level this hex ever had)
  if (targetLevel > hex.maxLevel) {
    // 1. Initial expansion (L0 to L1) is always allowed
    if (targetLevel === 1) return { canGrow: true };

    // 2. Cycle Check: Must have 3 points earned from previous maxLevel increases
    // We check if it is LESS than size. If it is 3, 3 < 3 is false, so it is valid.
    if (entity.recentUpgrades.length < UPGRADE_LOCK_QUEUE_SIZE) {
      return { 
        canGrow: false, 
        reason: `CYCLE INCOMPLETE (${entity.recentUpgrades.length}/${UPGRADE_LOCK_QUEUE_SIZE}) - CAPTURE 3 SECTORS FIRST` 
      };
    }

    // 3. Rank Check: Entity level must be at least targetLevel - 1
    // E.g. To get L5 (Target), I need L4 (Global). 
    // If I am L4. 4 < 4 is false. Valid.
    // If I am L3. 3 < 4 is true. Invalid.
    if (entity.playerLevel < targetLevel - 1) {
      return { 
        canGrow: false, 
        reason: `COMMANDER RANK TOO LOW (NEED L${targetLevel - 1} GLOBALLY)` 
      };
    }
  }

  return { canGrow: true };
};

// --- Bot Logic ---

export const calculateBotMove = (
  bot: Entity, 
  grid: Record<string, Hex>,
  opponent: Coordinates
): Coordinates | null => {
  const neighbors = getNeighbors(bot.q, bot.r);
  const validNeighbors = neighbors.filter(n => !(n.q === opponent.q && n.r === opponent.r));
  
  const scoredMoves = validNeighbors.map(coord => {
    const key = getHexKey(coord.q, coord.r);
    const hex = grid[key];
    const dist = getDistanceToCenter(coord.q, coord.r);
    
    const isNew = !hex || hex.maxLevel === 0;
    let score = 0;
    if (isNew) score += 100;
    score -= dist * 2; 

    return { coord, score };
  });

  scoredMoves.sort((a, b) => b.score - a.score);
  return scoredMoves.length > 0 ? scoredMoves[0].coord : null;
};
