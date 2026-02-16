/**
 * Design tokens for consistent styling across the app
 * Use these instead of one-off values
 */

export const spacing = {
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '1rem',      // 16px
  lg: '1.5rem',    // 24px
  xl: '2rem',      // 32px
  '2xl': '3rem',   // 48px
};

export const radii = {
  sm: '0.375rem',  // 6px
  md: '0.5rem',    // 8px
  lg: '0.75rem',   // 12px
  xl: '1rem',      // 16px
  '2xl': '1.5rem', // 24px
  full: '9999px',
};

export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  glow: {
    emerald: '0 0 20px rgba(16, 185, 129, 0.3)',
    blue: '0 0 20px rgba(59, 130, 246, 0.3)',
    amber: '0 0 20px rgba(245, 158, 11, 0.3)',
    red: '0 0 20px rgba(239, 68, 68, 0.3)',
  }
};

export const animations = {
  fast: '150ms',
  normal: '200ms',
  slow: '300ms',
  spring: { type: 'spring', stiffness: 300, damping: 20 },
  springBouncy: { type: 'spring', stiffness: 400, damping: 15 },
};

export const gradients = {
  primary: 'linear-gradient(to right, #10B981, #14B8A6)',
  primaryHover: 'linear-gradient(to right, #059669, #0D9488)',
  dark: 'linear-gradient(to bottom right, #1E293B, #0F172A)',
  card: {
    emerald: 'linear-gradient(to bottom right, #ECFDF5, #FFFFFF)',
    blue: 'linear-gradient(to bottom right, #EFF6FF, #FFFFFF)',
    violet: 'linear-gradient(to bottom right, #F5F3FF, #FFFFFF)',
    amber: 'linear-gradient(to bottom right, #FFFBEB, #FFFFFF)',
    red: 'linear-gradient(to bottom right, #FEF2F2, #FFFFFF)',
  }
};

export const colors = {
  // Status colors
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
  
  // Brand
  brand: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
  }
};

// Tailwind class helpers
export const tw = {
  cardHover: 'hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200',
  focusRing: 'focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2',
  glassmorphism: 'bg-white/80 backdrop-blur-sm border border-slate-200/50',
};

export default { spacing, radii, shadows, animations, gradients, colors, tw };