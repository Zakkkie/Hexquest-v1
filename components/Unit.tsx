
import React, { useRef, useEffect } from 'react';
import { Group, Circle, Ring } from 'react-konva';
import Konva from 'konva';
import { HEX_SIZE } from '../constants';
import { EntityType } from '../types';

interface UnitProps {
  q: number;
  r: number;
  type: EntityType;
}

const Unit: React.FC<UnitProps> = ({ q, r, type }) => {
  const groupRef = useRef<Konva.Group>(null);
  
  // Calculate target pixel coordinates
  const targetX = HEX_SIZE * (3/2 * q);
  const targetY = HEX_SIZE * Math.sqrt(3) * (r + q / 2);

  // Initial position setup (on first render)
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.position({ x: targetX, y: targetY });
    }
  }, []); // Run once to set initial pos

  // Smooth tweening when coords change
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.to({
        x: targetX,
        y: targetY,
        duration: 0.3, // 300ms smooth transition
        easing: Konva.Easings.EaseInOut,
      });
    }
  }, [targetX, targetY]);

  const isPlayer = type === EntityType.PLAYER;
  const color = isPlayer ? '#3b82f6' : '#ef4444';

  return (
    <Group ref={groupRef} listening={false}>
      {/* Glow */}
      <Circle
        radius={15}
        fill={color}
        opacity={0.3}
        shadowColor={color}
        shadowBlur={10}
      />
      {/* Core */}
      <Circle
        radius={8}
        fill={color}
        stroke="white"
        strokeWidth={2}
      />
      {/* Decorative Ring */}
      <Ring
        innerRadius={10}
        outerRadius={12}
        stroke={color}
        strokeWidth={1}
        opacity={0.6}
        scaleX={1}
        scaleY={0.8}
      />
    </Group>
  );
};

export default Unit;
