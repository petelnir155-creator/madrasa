'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

const COLORS = ['#f5c542', '#34d399', '#60a5fa', '#f472b6', '#fb923c', '#a78bfa'];

/** Falling confetti. Renders nothing for users who prefer reduced motion. */
export function Confetti({ count = 90 }: { count?: number }) {
  const reduce = useReducedMotion();
  const [alive, setAlive] = useState(true);
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const round = Math.random() > 0.6;
        const size = 6 + Math.random() * 8;
        return {
          id: i,
          left: Math.random() * 100,
          delay: Math.random() * 0.6,
          duration: 2.4 + Math.random() * 1.8,
          width: size,
          height: round ? size : size * 0.45,
          rotate: Math.random() * 720 - 360,
          drift: Math.random() * 180 - 90,
          color: COLORS[i % COLORS.length],
          round,
        };
      }),
    [count],
  );

  useEffect(() => {
    const t = setTimeout(() => setAlive(false), 5200);
    return () => clearTimeout(t);
  }, []);

  if (reduce || !alive) return null;
  return (
    <div className="confetti" aria-hidden="true" data-testid="confetti">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="confetti-piece"
          style={{ left: `${p.left}%`, width: p.width, height: p.height, background: p.color, borderRadius: p.round ? '50%' : 2 }}
          initial={{ y: -24, x: 0, opacity: 1, rotate: 0 }}
          animate={{ y: '105vh', x: p.drift, opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}
