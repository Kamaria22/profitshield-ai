import React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

/**
 * QUANTUM BUTTON
 * Futuristic button with holographic effects
 */
export default function QuantumButton({ 
  children, 
  onClick,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  className = "",
  ...props 
}) {
  const getVariantClasses = () => {
    if (variant === 'primary') {
      return 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white border-cyan-400/50';
    }
    if (variant === 'danger') {
      return 'bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-400 hover:to-pink-400 text-white border-red-400/50';
    }
    if (variant === 'success') {
      return 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white border-emerald-400/50';
    }
    return 'backdrop-blur-xl bg-slate-800/40 hover:bg-slate-700/40 text-cyan-400 border-cyan-500/30 hover:border-cyan-400/50';
  };

  const getSizeClasses = () => {
    if (size === 'sm') return 'px-4 py-2 text-sm';
    if (size === 'lg') return 'px-8 py-4 text-lg';
    return 'px-6 py-3 text-base';
  };

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled || loading}
      whileHover={{ scale: 1.05, boxShadow: '0 0 30px rgba(0, 255, 255, 0.3)' }}
      whileTap={{ scale: 0.95 }}
      className={`
        relative overflow-hidden
        ${getVariantClasses()}
        ${getSizeClasses()}
        border rounded-xl
        font-semibold
        transition-all duration-300
        disabled:opacity-50 disabled:cursor-not-allowed
        shadow-lg
        ${className}
      `}
      {...props}
    >
      {/* Holographic shimmer */}
      <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-300">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent shimmer" />
      </div>
      
      {/* Content */}
      <span className="relative z-10 flex items-center justify-center gap-2">
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : Icon ? (
          <Icon className="w-5 h-5" />
        ) : null}
        {children}
      </span>
      
      {/* Glow effect */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 blur-xl bg-cyan-400/20 transition-opacity duration-300 -z-10" />
      
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        
        .shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </motion.button>
  );
}