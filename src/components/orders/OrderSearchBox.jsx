import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

/**
 * Search box with autocomplete suggestions and a "Find" button.
 * Suggestions are derived from the orders list (order number, customer name, email).
 * @param {string} value - Current search term (controlled)
 * @param {(val: string) => void} onChange - Called when user commits a search
 * @param {Array} orders - Full unfiltered orders list for building suggestions
 */
export default function OrderSearchBox({ value, onChange, orders = [] }) {
  const [draft, setDraft] = useState(value || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Sync controlled value back into draft when parent clears it
  useEffect(() => {
    if (value === '') setDraft('');
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Build suggestions from orders
  const suggestions = React.useMemo(() => {
    if (!draft || draft.length < 1) return [];
    const term = draft.toLowerCase();
    const seen = new Set();
    const results = [];

    for (const o of orders) {
      if (results.length >= 8) break;

      const candidates = [
        o.order_number ? { label: `#${o.order_number}`, value: o.order_number, type: 'Order' } : null,
        o.customer_name ? { label: o.customer_name, value: o.customer_name, type: 'Customer' } : null,
        o.customer_email ? { label: o.customer_email, value: o.customer_email, type: 'Email' } : null,
      ].filter(Boolean);

      for (const c of candidates) {
        const key = `${c.type}:${c.value}`;
        if (!seen.has(key) && c.value?.toLowerCase().includes(term)) {
          seen.add(key);
          results.push(c);
        }
      }
    }

    return results;
  }, [draft, orders]);

  const commitSearch = useCallback((term) => {
    const val = (term ?? draft).trim();
    setDraft(val);
    setShowSuggestions(false);
    onChange(val);
    inputRef.current?.blur();
  }, [draft, onChange]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitSearch();
    if (e.key === 'Escape') {
      setShowSuggestions(false);
      inputRef.current?.blur();
    }
  };

  const handleClear = () => {
    setDraft('');
    onChange('');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative flex-1 flex gap-2">
      {/* Input wrapper */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <Input
          ref={inputRef}
          placeholder="Search by order #, customer name, or email..."
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => { setFocused(true); setShowSuggestions(draft.length > 0); }}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          className="pl-9 pr-8 bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-500"
        />
        {draft && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
            tabIndex={-1}
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Autocomplete dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-slate-900 border border-white/10 rounded-lg shadow-xl overflow-hidden">
            {suggestions.map((s, i) => (
              <button
                key={i}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
                onMouseDown={(e) => { e.preventDefault(); commitSearch(s.value); }}
              >
                <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                  style={{
                    background: s.type === 'Order' ? 'rgba(99,102,241,0.2)' : s.type === 'Email' ? 'rgba(16,185,129,0.2)' : 'rgba(251,191,36,0.2)',
                    color: s.type === 'Order' ? '#a5b4fc' : s.type === 'Email' ? '#6ee7b7' : '#fcd34d',
                  }}>
                  {s.type}
                </span>
                <span className="text-sm text-slate-200 truncate">{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Find button */}
      <Button
        onClick={() => commitSearch()}
        className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 shrink-0"
      >
        <Search className="w-4 h-4 mr-2" />
        Find
      </Button>
    </div>
  );
}