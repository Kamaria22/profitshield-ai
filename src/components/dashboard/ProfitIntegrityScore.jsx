import React from 'react';
import { motion } from 'framer-motion';
import { Shield, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function ProfitIntegrityScore({ score, previousScore, size = 'large' }) {
  const getScoreColor = (s) => {
    if (s >= 80) return { ring: 'text-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' };
    if (s >= 60) return { ring: 'text-yellow-500', bg: 'bg-yellow-50', text: 'text-yellow-700' };
    if (s >= 40) return { ring: 'text-orange-500', bg: 'bg-orange-50', text: 'text-orange-700' };
    return { ring: 'text-red-500', bg: 'bg-red-50', text: 'text-red-700' };
  };

  const getLabel = (s) => {
    if (s >= 80) return 'Excellent';
    if (s >= 60) return 'Good';
    if (s >= 40) return 'Needs Attention';
    return 'Critical';
  };

  const colors = getScoreColor(score);
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const trend = previousScore ? score - previousScore : 0;

  const dimensions = size === 'large' 
    ? { width: 200, height: 200, fontSize: 'text-5xl', labelSize: 'text-sm' }
    : { width: 120, height: 120, fontSize: 'text-2xl', labelSize: 'text-xs' };

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: dimensions.width, height: dimensions.height }}>
        {/* Background circle */}
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="50%"
            cy="50%"
            r="45%"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-slate-100"
          />
          {/* Progress circle */}
          <motion.circle
            cx="50%"
            cy="50%"
            r="45%"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            className={colors.ring}
            style={{
              strokeDasharray: circumference,
            }}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />
        </svg>
        
        {/* Score display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Shield className={`w-6 h-6 ${colors.text} mb-1`} />
          <motion.span 
            className={`${dimensions.fontSize} font-bold ${colors.text}`}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            {score}
          </motion.span>
          <span className={`${dimensions.labelSize} text-slate-500 font-medium`}>
            {getLabel(score)}
          </span>
        </div>
      </div>

      {/* Trend indicator */}
      {previousScore !== undefined && (
        <div className={`flex items-center gap-1 mt-3 px-3 py-1 rounded-full ${colors.bg}`}>
          {trend > 0 ? (
            <>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">+{trend} from last week</span>
            </>
          ) : trend < 0 ? (
            <>
              <TrendingDown className="w-4 h-4 text-red-600" />
              <span className="text-sm font-medium text-red-700">{trend} from last week</span>
            </>
          ) : (
            <>
              <Minus className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-600">No change from last week</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}