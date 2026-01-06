
import React from 'react';
import { Group, RegularPolygon, Text, Rect } from 'react-konva';
import { Hex } from '../types';
import { HEX_SIZE } from '../constants';
import { getSecondsToGrow } from '../services/hexUtils';
import { useGameStore } from '../store';

// --- VISUAL COMPONENT (Pure) ---
interface HexagonVisualProps {
  hex: Hex;
  isPlayerNeighbor: boolean;
  onHexClick: (q: number, r: number) => void;
}

// Visual Color Table
const LEVEL_COLORS: Record<number, { fill: string; stroke: string }> = {
  0: { fill: '#1e293b', stroke: '#334155' }, 
  1: { fill: '#1e3a8a', stroke: '#3b82f6' }, 
  2: { fill: '#065f46', stroke: '#10b981' }, 
  3: { fill: '#155e75', stroke: '#06b6d4' }, 
  4: { fill: '#3f6212', stroke: '#84cc16' }, 
  5: { fill: '#92400e', stroke: '#f59e0b' }, 
  6: { fill: '#9a3412', stroke: '#ea580c' }, 
  7: { fill: '#991b1b', stroke: '#dc2626' }, 
  8: { fill: '#831843', stroke: '#db2777' }, 
  9: { fill: '#581c87', stroke: '#9333ea' }, 
  10: { fill: '#4c1d95', stroke: '#a855f7' }, 
};

const HexagonVisual: React.FC<HexagonVisualProps> = React.memo(({ hex, isPlayerNeighbor, onHexClick }) => {
  // Cartesian Coordinates for Pointy Top Hexes
  const x = HEX_SIZE * (3/2 * hex.q);
  const y = HEX_SIZE * Math.sqrt(3) * (hex.r + hex.q / 2);

  const levelIndex = Math.min(hex.maxLevel, 10);
  const colorSet = LEVEL_COLORS[levelIndex] || LEVEL_COLORS[10];

  let fillColor = colorSet.fill;
  let strokeColor = colorSet.stroke;
  let strokeWidth = 1 + (hex.maxLevel * 0.2);

  // Dim if L0 but discovered (fog of war style), slightly brighter base to be visible
  const opacity = (hex.currentLevel === 0 && hex.maxLevel > 0) ? 0.5 : 1;

  if (isPlayerNeighbor) {
    strokeColor = '#3b82f6'; // Bright blue for move targets
    strokeWidth = Math.max(strokeWidth, 2.5);
  }

  const isGrowing = hex.progress > 0;
  const targetLevel = hex.currentLevel + 1;
  const neededSeconds = getSecondsToGrow(targetLevel) || 1;
  const progressPercent = Math.min(1, hex.progress / neededSeconds);

  // Optimize handler to avoid creating function in render
  const handleClick = () => {
    if (isPlayerNeighbor) {
      onHexClick(hex.q, hex.r);
    }
  };

  return (
    <Group 
      x={x} 
      y={y} 
      onClick={handleClick}
      onTap={handleClick}
      listening={isPlayerNeighbor} // Optimization: only interactive hexes listen to events
    >
      {/* 2.5D Depth Layer (Shadow/Side) */}
      <RegularPolygon
        sides={6}
        radius={HEX_SIZE}
        fill="#020617" 
        y={8} 
        opacity={0.6}
        rotation={30}
        listening={false}
        perfectDrawEnabled={false} // Optimization: Disable expensive hit detection pixels
        shadowForStrokeEnabled={false}
      />
      
      {/* Main Tile */}
      <RegularPolygon
        sides={6}
        radius={HEX_SIZE}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        opacity={opacity}
        shadowColor={strokeColor}
        shadowBlur={hex.maxLevel >= 5 ? 15 : 0}
        shadowOpacity={0.6}
        shadowEnabled={hex.maxLevel >= 5} // Optimization: Only render shadow for high levels
        shadowForStrokeEnabled={false}
        rotation={30}
        perfectDrawEnabled={false} // Optimization
      />

      {/* Level Text */}
      <Text
        text={`${hex.currentLevel}/${hex.maxLevel}`}
        fontSize={10}
        fill="#ffffff"
        fontStyle="bold"
        align="center"
        width={HEX_SIZE * 2}
        x={-HEX_SIZE}
        y={-5}
        listening={false}
        shadowColor="black"
        shadowBlur={2}
        perfectDrawEnabled={false}
      />

      {/* Progress Bar (Canvas) */}
      {isGrowing && (
        <Group y={14} listening={false}>
          <Rect
            x={-12}
            width={24}
            height={4}
            fill="rgba(0,0,0,0.6)"
            cornerRadius={2}
            perfectDrawEnabled={false}
          />
          <Rect
            x={-12}
            width={24 * progressPercent}
            height={4}
            fill="#10b981"
            cornerRadius={2}
            perfectDrawEnabled={false}
          />
        </Group>
      )}
    </Group>
  );
});

// --- SMART WRAPPER (Optimization) ---
// This component subscribes to the store for a specific hex. 
// If the global grid updates, but this specific hex data hasn't changed (same reference),
// this component will NOT re-render.
interface SmartHexagonProps {
  id: string;
  isPlayerNeighbor: boolean;
  onHexClick: (q: number, r: number) => void;
}

const SmartHexagon: React.FC<SmartHexagonProps> = React.memo(({ id, isPlayerNeighbor, onHexClick }) => {
  // Select ONLY the hex for this ID.
  // Because 'tick' uses immutable updates, if this specific hex wasn't modified,
  // grid[id] returns the exact same object reference, preventing re-render.
  const hex = useGameStore(state => state.grid[id]);

  if (!hex) return null;

  return (
    <HexagonVisual 
      hex={hex} 
      isPlayerNeighbor={isPlayerNeighbor} 
      onHexClick={onHexClick} 
    />
  );
});

export default SmartHexagon;
