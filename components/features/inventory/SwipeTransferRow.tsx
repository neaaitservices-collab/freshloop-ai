'use client';

import React, { useRef, useState } from 'react';
import { ChefHat, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const SWIPE_THRESHOLD_PX = 72;
const MAX_DRAG_PX = 110;

export interface SwipeTransferRowProps {
  enabled: boolean;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * Touch-only swipe hints: right → rescue (production), left → waste.
 */
export function SwipeTransferRow({
  enabled,
  onSwipeRight,
  onSwipeLeft,
  children,
  className,
}: SwipeTransferRowProps) {
  const startX = useRef(0);
  const dragging = useRef(false);
  const [offsetX, setOffsetX] = useState(0);
  const [animating, setAnimating] = useState(false);

  if (!enabled) {
    return <div className={className}>{children}</div>;
  }

  const finish = (dx: number) => {
    dragging.current = false;
    if (dx >= SWIPE_THRESHOLD_PX) {
      setAnimating(true);
      setOffsetX(MAX_DRAG_PX);
      window.setTimeout(() => {
        onSwipeRight();
        setOffsetX(0);
        setAnimating(false);
      }, 180);
      return;
    }
    if (dx <= -SWIPE_THRESHOLD_PX) {
      setAnimating(true);
      setOffsetX(-MAX_DRAG_PX);
      window.setTimeout(() => {
        onSwipeLeft();
        setOffsetX(0);
        setAnimating(false);
      }, 180);
      return;
    }
    setOffsetX(0);
  };

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <div
        className="pointer-events-none absolute inset-0 flex items-stretch justify-between text-[10px] font-black uppercase tracking-wide"
        aria-hidden
      >
        <div
          className={cn(
            'flex min-w-[40%] items-center justify-start bg-rose-950/90 pl-3 text-rose-200 transition-opacity',
            offsetX < -20 ? 'opacity-100' : 'opacity-40'
          )}
        >
          <Trash2 className="mr-1.5 h-4 w-4" />
          Waste
        </div>
        <div
          className={cn(
            'flex min-w-[40%] items-center justify-end bg-emerald-950/90 pr-3 text-emerald-200 transition-opacity',
            offsetX > 20 ? 'opacity-100' : 'opacity-40'
          )}
        >
          Production
          <ChefHat className="ml-1.5 h-4 w-4" />
        </div>
      </div>

      <div
        className={cn(
          'relative touch-pan-y bg-slate-900/95',
          animating && 'transition-transform duration-200 ease-out'
        )}
        style={{ transform: `translateX(${offsetX}px)` }}
        onTouchStart={(e) => {
          if (animating) return;
          dragging.current = true;
          startX.current = e.touches[0]?.clientX ?? 0;
        }}
        onTouchMove={(e) => {
          if (!dragging.current || animating) return;
          const x = e.touches[0]?.clientX ?? 0;
          const dx = x - startX.current;
          setOffsetX(Math.max(-MAX_DRAG_PX, Math.min(MAX_DRAG_PX, dx)));
        }}
        onTouchEnd={(e) => {
          if (!dragging.current) return;
          const x = e.changedTouches[0]?.clientX ?? startX.current;
          finish(x - startX.current);
        }}
        onTouchCancel={() => {
          dragging.current = false;
          setOffsetX(0);
        }}
      >
        {children}
      </div>
    </div>
  );
}
