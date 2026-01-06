import React from 'react';
import { Hex, Entity, EntityType } from '../types';
import { HEX_SIZE } from '../constants';
import { getSecondsToGrow, checkGrowthCondition } from '../services/hexUtils';

interface HexagonProps {
  hex: Hex;
  entities: Entity[];
  isPlayerNeighbor: boolean;
  onClick: () => void;
}

// Visual Color Table for Max Levels (as requested)
const LEVEL_COLORS: Record<number, { fill: string; stroke: string }> = {
  0: { fill: '#1e293b', stroke: '#334155' }, // Empty
  1: { fill: '#1e3a8a', stroke: '#3b82f6' }, // Deep Blue
  2: { fill: '#065f46', stroke: '#10b981' }, // Emerald
  3: { fill: '#155e75', stroke: '#06b6d4' }, // Cyan
  4: { fill: '#3f6212', stroke: '#84cc16' }, // Lime
  5: { fill: '#92400e', stroke: '#f59e0b' }, // Amber
  6: { fill: '#9a3412', stroke: '#ea580c' }, // Orange
  7: { fill: '#991b1b', stroke: '#dc2626' }, // Crimson
  8: { fill: '#831843', stroke: '#db2777' }, // Magenta
  9: { fill: '#581c87', stroke: '#9333ea' }, // Violet
  10: { fill: '#4c1d95', stroke: '#a855f7' }, // Galaxy (L10+)
};

const Hexagon: React.FC<HexagonProps> = ({ hex, entities, isPlayerNeighbor, onClick }) => {
  const x = HEX_SIZE * (3/2 * hex.q);
  const y = HEX_SIZE * Math.sqrt(3) * (hex.r + hex.q / 2);

  const points = [];
  const innerPoints = [];
  for (let i = 0; i < 6; i++) {
    const angle_deg = 60 * i;
    const angle_rad = Math.PI / 180 * angle_deg;
    points.push(`${HEX_SIZE * Math.cos(angle_rad)},${HEX_SIZE * Math.sin(angle_rad)}`);
    innerPoints.push(`${(HEX_SIZE * 0.9) * Math.cos(angle_rad)},${(HEX_SIZE * 0.9) * Math.sin(angle_rad)}`);
  }

  const player = entities.find(e => e.type === EntityType.PLAYER);
  const bot = entities.find(e => e.type === EntityType.BOT);

  const isGrowing = hex.progress > 0;

  // --- Dynamic Color from Table ---
  const levelIndex = Math.min(hex.maxLevel, 10);
  const colorSet = LEVEL_COLORS[levelIndex] || LEVEL_COLORS[10];

  let fillColor = colorSet.fill;
  let strokeColor = colorSet.stroke;
  let strokeWidth = 1.2 + (hex.maxLevel * 0.25);

  // Dim fill if currently at Level 0 but discovered
  if (hex.currentLevel === 0 && hex.maxLevel > 0) {
    fillColor = `rgba(${parseInt(fillColor.slice(1,3), 16)}, ${parseInt(fillColor.slice(3,5), 16)}, ${parseInt(fillColor.slice(5,7), 16)}, 0.3)`;
  }

  if (isPlayerNeighbor) {
    strokeColor = '#3b82f6';
    strokeWidth = Math.max(strokeWidth, 3);
  }

  const targetLevel = hex.currentLevel + 1;
  const neededSeconds = getSecondsToGrow(targetLevel);
  const progressPercent = Math.min(1, hex.progress / (neededSeconds || 1));
  
  return (
    <g transform={`translate(${x}, ${y})`} 
       onClick={isPlayerNeighbor ? onClick : undefined}
       style={{ cursor: isPlayerNeighbor ? 'pointer' : 'default' }}
       className="transition-all duration-300"
    >
      {/* Decorative Blur for High Tier Hexes */}
      {hex.maxLevel >= 5 && (
        <polygon 
          points={points.join(' ')} 
          fill="none" 
          stroke={strokeColor} 
          strokeWidth={strokeWidth + 5} 
          opacity="0.15" 
          className="pointer-events-none"
          style={{ filter: 'blur(8px)' }}
        />
      )}

      {/* Main Hex Polygon */}
      <polygon 
        points={points.join(' ')} 
        fill={fillColor} 
        stroke={strokeColor} 
        strokeWidth={strokeWidth} 
        className="transition-colors duration-700"
      />

      {/* Inner Growth Animation (Flashes inside edges) */}
      {isGrowing && (
        <polygon 
          points={innerPoints.join(' ')} 
          fill="none" 
          stroke="#10b981" 
          strokeWidth="3.5" 
          className="animate-inner-flash"
          strokeDasharray="10 5"
        />
      )}
      
      {/* Visual Level Labels */}
      <g className="select-none pointer-events-none">
        <text y="-8" textAnchor="middle" fontSize="12" className="font-black drop-shadow-[0_2px_4px_rgba(0,0,0,1)]">
          <tspan fill="#ffffff">{hex.currentLevel}</tspan> 
          <tspan fill="#475569" fontSize="8" dx="1.5">/</tspan> 
          <tspan fill={strokeColor} dx="1.5">{hex.maxLevel}</tspan>
        </text>
        <text y="16" textAnchor="middle" fontSize="5" fill="#ffffff" className="font-mono opacity-20 uppercase tracking-tighter">
          T_{neededSeconds}s
        </text>
      </g>

      {/* Mini Progress Overlay */}
      {isGrowing && (
        <g transform="translate(-15, 5)">
            <rect width="30" height="2" rx="1" fill="rgba(0,0,0,0.8)" />
            <rect width={30 * progressPercent} height="2" rx="1" fill="#10b981" className="transition-all duration-1000 ease-linear shadow-sm" />
        </g>
      )}

      {/* Entity Tokens */}
      {player && (
        <circle 
          r={HEX_SIZE / 2.5} 
          fill="#3b82f6" 
          stroke="white" 
          strokeWidth="2" 
          opacity="0.7" 
          className="pointer-events-none transition-opacity duration-300 drop-shadow-xl"
        />
      )}
      {bot && (
        <circle 
          r={HEX_SIZE / 2.8} 
          fill="#ef4444" 
          stroke="white" 
          strokeWidth="2" 
          opacity="0.7" 
          className="pointer-events-none transition-opacity duration-300 shadow-2xl"
        />
      )}
    </g>
  );
};

export default Hexagon;
