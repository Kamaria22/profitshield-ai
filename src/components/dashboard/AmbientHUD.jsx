/**
 * AMBIENT INTELLIGENCE HUD
 * Real-time status: sync · AI health · risk · profit momentum
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Zap, Shield, TrendingUp, Wifi, WifiOff } from 'lucide-react';

export default function AmbientHUD({ metrics, tenant }) {
  const [online, setOnline] = useState(navigator.onLine);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setPulse(p => !p), 2000);
    return () => clearInterval(interval);
  }, []);

  const riskLevel = metrics?.highRiskOrders > 5 ? 'high' : metrics?.highRiskOrders > 0 ? 'medium' : 'low';
  const margin = metrics?.avgMargin || 0;
  const profitMomentum = margin > 20 ? 'positive' : margin > 5 ? 'neutral' : 'negative';

  const riskColors = { high: 'text-red-400', medium: 'text-amber-400', low: 'text-emerald-400' };
  const momentumColors = { positive: 'text-emerald-400', neutral: 'text-slate-400', negative: 'text-red-400' };

  return (
    <div className="hidden lg:flex items-center gap-4 px-4 py-2 rounded-full bg-slate-900/80 border border-white/10 backdrop-blur-md text-xs">
      {/* Sync / Online */}
      <div className="flex items-center gap-1.5">
        {online
          ? <motion.div animate={{ scale: pulse ? 1.3 : 1 }} transition={{ duration: 0.3 }}>
              <Wifi className="w-3 h-3 text-emerald-400" />
            </motion.div>
          : <WifiOff className="w-3 h-3 text-red-400" />
        }
        <span className={online ? 'text-emerald-400' : 'text-red-400'}>{online ? 'Live' : 'Offline'}</span>
      </div>

      <div className="w-px h-3 bg-white/10" />

      {/* AI Health */}
      <div className="flex items-center gap-1.5">
        <Activity className="w-3 h-3 text-violet-400" />
        <span className="text-violet-400">AI Online</span>
      </div>

      <div className="w-px h-3 bg-white/10" />

      {/* Risk Level */}
      <div className="flex items-center gap-1.5">
        <Shield className={`w-3 h-3 ${riskColors[riskLevel]}`} />
        <span className={riskColors[riskLevel]}>Risk: {riskLevel}</span>
      </div>

      <div className="w-px h-3 bg-white/10" />

      {/* Profit Momentum */}
      <div className="flex items-center gap-1.5">
        <TrendingUp className={`w-3 h-3 ${momentumColors[profitMomentum]}`} />
        <span className={momentumColors[profitMomentum]}>
          {margin > 0 ? `${margin.toFixed(1)}% margin` : 'No data'}
        </span>
      </div>
    </div>
  );
}