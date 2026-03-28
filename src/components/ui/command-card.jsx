import * as React from 'react';
import { cn } from '@/lib/utils';

const baseClass =
  'rounded-[12px] border border-white/10 bg-white/[0.04] text-slate-100 shadow-none transition-colors duration-150';

export function CommandCard({ className, ...props }) {
  return <div className={cn(baseClass, className)} {...props} />;
}

export function CommandCardHeader({ className, ...props }) {
  return <div className={cn('px-4 pt-4 pb-3', className)} {...props} />;
}

export function CommandCardTitle({ className, ...props }) {
  return <h3 className={cn('text-[15px] font-semibold text-white', className)} {...props} />;
}

export function CommandCardDescription({ className, ...props }) {
  return <p className={cn('mt-1 text-sm text-slate-400', className)} {...props} />;
}

export function CommandCardContent({ className, ...props }) {
  return <div className={cn('px-4 pb-4', className)} {...props} />;
}
