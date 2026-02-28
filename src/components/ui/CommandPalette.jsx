/**
 * 2080 COMMAND PALETTE — ⌘K / Ctrl+K
 * Universal command layer for ProfitShield AI
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';
import {
  Search, LayoutDashboard, ShoppingCart, AlertTriangle, Shield,
  TrendingUp, Users, Package, Settings, CreditCard, Zap,
  Brain, ClipboardList, X, ChevronRight, CornerDownLeft
} from 'lucide-react';

const COMMANDS = [
  { id: 'home', label: 'Dashboard', icon: LayoutDashboard, page: 'Home', category: 'Navigate' },
  { id: 'orders', label: 'Orders', icon: ShoppingCart, page: 'Orders', category: 'Navigate' },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle, page: 'Alerts', category: 'Navigate' },
  { id: 'risk', label: 'Risk Intelligence', icon: Shield, page: 'Intelligence', category: 'Navigate' },
  { id: 'pnl', label: 'P&L Analytics', icon: TrendingUp, page: 'PnLAnalytics', category: 'Navigate' },
  { id: 'customers', label: 'Customers', icon: Users, page: 'Customers', category: 'Navigate' },
  { id: 'products', label: 'Products', icon: Package, page: 'Products', category: 'Navigate' },
  { id: 'insights', label: 'AI Insights', icon: Brain, page: 'AIInsights', category: 'Navigate' },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList, page: 'Tasks', category: 'Navigate' },
  { id: 'billing', label: 'Billing & Plan', icon: CreditCard, page: 'Billing', category: 'Navigate' },
  { id: 'settings', label: 'Settings', icon: Settings, page: 'Settings', category: 'Navigate' },
  { id: 'upgrade', label: 'Upgrade Plan', icon: Zap, page: 'Billing', category: 'Actions', highlight: true },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
        setQuery('');
        setSelected(0);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = query.trim()
    ? COMMANDS.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.category.toLowerCase().includes(query.toLowerCase())
      )
    : COMMANDS;

  const handleSelect = useCallback((cmd) => {
    navigate(createPageUrl(cmd.page));
    setOpen(false);
    setQuery('');
  }, [navigate]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && filtered[selected]) handleSelect(filtered[selected]);
  };

  const grouped = filtered.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {});

  let globalIndex = 0;

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="fixed top-[15%] left-1/2 -translate-x-1/2 z-[101] w-full max-w-xl"
            >
              <div className="bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
                style={{ boxShadow: '0 0 60px rgba(99,102,241,0.15), 0 25px 50px rgba(0,0,0,0.5)' }}>

                {/* Search Input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
                  <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={e => { setQuery(e.target.value); setSelected(0); }}
                    onKeyDown={handleKeyDown}
                    placeholder="Search commands, pages, actions..."
                    className="flex-1 bg-transparent text-white placeholder-slate-500 text-sm outline-none"
                  />
                  <div className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-white/10 text-slate-400 font-mono">ESC</kbd>
                  </div>
                  <button onClick={() => setOpen(false)}>
                    <X className="w-4 h-4 text-slate-500 hover:text-white" />
                  </button>
                </div>

                {/* Results */}
                <div className="max-h-80 overflow-y-auto p-2">
                  {filtered.length === 0 && (
                    <p className="text-center text-slate-500 text-sm py-8">No commands found</p>
                  )}
                  {Object.entries(grouped).map(([category, cmds]) => (
                    <div key={category} className="mb-2">
                      <p className="px-3 py-1 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{category}</p>
                      {cmds.map((cmd) => {
                        const idx = globalIndex++;
                        const isSelected = selected === idx;
                        const Icon = cmd.icon;
                        return (
                          <button
                            key={cmd.id}
                            onMouseEnter={() => setSelected(idx)}
                            onClick={() => handleSelect(cmd)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                              isSelected
                                ? 'bg-indigo-500/20 border border-indigo-500/30'
                                : 'hover:bg-white/5 border border-transparent'
                            } ${cmd.highlight ? 'text-violet-300' : 'text-slate-200'}`}
                          >
                            <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-indigo-500/30' : 'bg-white/5'}`}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-sm font-medium flex-1">{cmd.label}</span>
                            {isSelected && (
                              <div className="flex items-center gap-1 text-slate-500">
                                <CornerDownLeft className="w-3 h-3" />
                              </div>
                            )}
                            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>

                {/* Footer hint */}
                <div className="px-4 py-2 border-t border-white/5 flex items-center gap-3 text-[10px] text-slate-600">
                  <span><kbd className="font-mono">↑↓</kbd> navigate</span>
                  <span><kbd className="font-mono">↵</kbd> select</span>
                  <span><kbd className="font-mono">esc</kbd> close</span>
                  <span className="ml-auto opacity-50">ProfitShield Command Layer</span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// Trigger hint button for header
export function CommandPaletteTrigger() {
  return (
    <button
      onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
      className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs transition-colors border border-slate-200"
    >
      <Search className="w-3.5 h-3.5" />
      <span>Search...</span>
      <kbd className="ml-1 px-1 py-0.5 rounded text-[10px] bg-white border border-slate-200 font-mono">⌘K</kbd>
    </button>
  );
}