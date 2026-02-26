import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';

/**
 * QUANTUM METRIC DISPLAY
 * Futuristic metric card with animated value changes
 */
export default function QuantumMetric({ 
  title, 
  value, 
  change, 
  trend = 'neutral',
  icon: Icon = Activity,
  unit = "",
  precision = 0,
  glitch = false
}) {
  const getTrendColor = () => {
    if (trend === 'up') return 'text-emerald-400';
    if (trend === 'down') return 'text-red-400';
    return 'text-cyan-400';
  };

  const getTrendBg = () => {
    if (trend === 'up') return 'bg-emerald-500/10';
    if (trend === 'down') return 'bg-red-500/10';
    return 'bg-cyan-500/10';
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative group"
    >
      <div className={`
        backdrop-blur-xl bg-gradient-to-br from-slate-900/60 via-slate-800/40 to-slate-900/60
        border border-cyan-500/20 rounded-xl p-6
        hover:border-cyan-400/40 hover:shadow-lg hover:shadow-cyan-400/20
        transition-all duration-300
      `}>
        {/* Glow effect */}
        <div className={`absolute inset-0 ${getTrendBg()} opacity-0 group-hover:opacity-20 rounded-xl transition-opacity duration-300`} />
        
        {/* Icon */}
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-lg ${getTrendBg()} border border-cyan-500/20`}>
            <Icon className={`w-6 h-6 ${getTrendColor()}`} />
          </div>
          
          {change !== undefined && (
            <div className="flex items-center gap-1 text-sm">
              {trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-400" />}
              {trend === 'down' && <TrendingDown className="w-4 h-4 text-red-400" />}
              <span className={getTrendColor()}>
                {change > 0 ? '+' : ''}{change}%
              </span>
            </div>
          )}
        </div>
        
        {/* Title */}
        <p className="text-sm text-slate-400 mb-2 uppercase tracking-wider">{title}</p>
        
        {/* Value */}
        <motion.div
          key={value}
          initial={{ scale: 1.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="relative"
        >
          <p className={`
            text-3xl font-bold ${getTrendColor()}
            ${glitch ? 'glitch-text' : ''}
          `}>
            {typeof value === 'number' ? value.toFixed(precision) : value}
            {unit && <span className="text-xl ml-1">{unit}</span>}
          </p>
        </motion.div>
        
        {/* Scan line effect */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>
      
      {glitch && (
        <style jsx>{`
          @keyframes glitch {
            0%, 100% { transform: translate(0); }
            20% { transform: translate(-2px, 2px); }
            40% { transform: translate(-2px, -2px); }
            60% { transform: translate(2px, 2px); }
            80% { transform: translate(2px, -2px); }
          }
          
          .glitch-text:hover {
            animation: glitch 0.3s infinite;
          }
        `}</style>
      )}
    </motion.div>
  );
}