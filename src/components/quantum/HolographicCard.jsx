import React from 'react';
import { motion } from 'framer-motion';

/**
 * HOLOGRAPHIC GLASS CARD
 * Futuristic glassmorphism with holographic shimmer effects
 */
export default function HolographicCard({ 
  children, 
  className = "", 
  glow = false,
  scanline = false,
  ...props 
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      className={`
        relative overflow-hidden
        backdrop-blur-xl bg-gradient-to-br from-slate-900/40 via-slate-800/30 to-slate-900/40
        border border-cyan-500/20
        rounded-2xl
        shadow-2xl shadow-cyan-500/10
        ${glow ? 'hover:shadow-cyan-400/30 hover:border-cyan-400/40' : ''}
        transition-all duration-500
        ${className}
      `}
      whileHover={{ scale: 1.02, y: -4 }}
      {...props}
    >
      {/* Holographic shimmer overlay */}
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent shimmer" />
      </div>
      
      {/* Scanline effect */}
      {scanline && (
        <div className="absolute inset-0 opacity-5 pointer-events-none scanlines" />
      )}
      
      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-20 h-20 border-t-2 border-l-2 border-cyan-400/40 rounded-tl-2xl" />
      <div className="absolute bottom-0 right-0 w-20 h-20 border-b-2 border-r-2 border-cyan-400/40 rounded-br-2xl" />
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
      
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        
        .shimmer {
          animation: shimmer 3s infinite;
        }
        
        .scanlines {
          background: repeating-linear-gradient(
            0deg,
            rgba(0, 255, 255, 0.03),
            rgba(0, 255, 255, 0.03) 1px,
            transparent 1px,
            transparent 2px
          );
        }
      `}</style>
    </motion.div>
  );
}