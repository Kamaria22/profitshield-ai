import React from 'react';

/**
 * MobileDeepWrapper
 * Enforces mobile-safe layout constraints to prevent horizontal drift
 * while preserving vertical scroll.
 */
export default function MobileDeepWrapper({ children, className = '' }) {
  return (
    <div className={`w-full max-w-full overflow-x-hidden ${className}`}>
      {children}
    </div>
  );
}
