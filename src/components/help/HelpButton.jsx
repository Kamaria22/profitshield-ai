import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';

export default function HelpButton() {
  const location = useLocation();
  const isOnHelp = location.pathname.includes('HelpCenter');

  if (isOnHelp) return null;

  return (
    <Link to={createPageUrl('HelpCenter', location.search)}>
      <button
        className="fixed bottom-6 right-6 z-40 w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110 focus:outline-none"
        style={{
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          boxShadow: '0 0 20px rgba(99,102,241,0.45), 0 4px 16px rgba(0,0,0,0.4)',
        }}
        aria-label="Open Help Center"
        title="Help Center"
      >
        <HelpCircle className="w-5 h-5 text-white" />
      </button>
    </Link>
  );
}