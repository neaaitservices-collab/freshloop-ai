'use client';

import React from 'react';
import { DepartmentType } from '@/lib/types';
import { Apple, Milk, Cake, Package, UtensilsCrossed, ShoppingBasket } from 'lucide-react';

interface DepartmentBadgeProps {
  department: DepartmentType;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const DepartmentBadge: React.FC<DepartmentBadgeProps> = ({
  department,
  showIcon = true,
  size = 'md'
}) => {
  const configs: Record<DepartmentType, { label: string; bg: string; text: string; border: string; icon: React.ComponentType<{ className?: string }> }> = {
    PRODUCE: {
      label: 'Produce',
      bg: 'bg-emerald-950/70',
      text: 'text-emerald-300',
      border: 'border-emerald-500/30',
      icon: Apple
    },
    DAIRY: {
      label: 'Dairy',
      bg: 'bg-cyan-950/70',
      text: 'text-cyan-300',
      border: 'border-cyan-500/30',
      icon: Milk
    },
    BAKERY: {
      label: 'Bakery',
      bg: 'bg-amber-950/70',
      text: 'text-amber-300',
      border: 'border-amber-500/30',
      icon: Cake
    },
    PANTRY: {
      label: 'Pantry',
      bg: 'bg-purple-950/70',
      text: 'text-purple-300',
      border: 'border-purple-500/30',
      icon: Package
    },
    DELI_KITCHEN: {
      label: 'Deli / Production',
      bg: 'bg-orange-950/70',
      text: 'text-orange-300',
      border: 'border-orange-500/30',
      icon: UtensilsCrossed
    },
    GROCERY: {
      label: 'Grocery',
      bg: 'bg-sky-950/70',
      text: 'text-sky-300',
      border: 'border-sky-500/30',
      icon: ShoppingBasket
    }
  };

  const config = configs[department] || configs.PRODUCE;
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3 py-1.5 gap-2'
  };

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full border shadow-sm ${config.bg} ${config.text} ${config.border} ${sizeClasses[size]}`}
    >
      {showIcon && <Icon className="w-3.5 h-3.5 stroke-[2.2]" />}
      <span>{config.label}</span>
    </span>
  );
};
