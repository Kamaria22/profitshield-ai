import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/components/platformContext';
import { useDeviceProfile } from '@/components/mobile/DeviceDetector';

export default function HelpButton() {
  const location = useLocation();
  const device = useDeviceProfile();
  const isOnHelp = location.pathname.includes('HelpCenter');

  if (isOnHelp) return null;

  const isPhoneLike = device?.isMobile && !device?.isTablet;
  const buttonClass = isPhoneLike
    ? 'fixed right-3 z-30 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 focus:outline-none'
    : 'fixed bottom-6 right-6 z-40 w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110 focus:outline-none';
  const buttonStyle = {
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    boxShadow: '0 0 20px rgba(99,102,241,0.45), 0 4px 16px rgba(0,0,0,0.4)',
    bottom: isPhoneLike ? 'calc(env(safe-area-inset-bottom, 0px) + 5.25rem)' : undefined,
    right: isPhoneLike ? 'calc(env(safe-area-inset-right, 0px) + 4.5rem)' : undefined,
  };

  return (
    <Link to={createPageUrl('HelpCenter', location.search)}>
      <button
        className={buttonClass}
        style={buttonStyle}
        aria-label="Open Help Center"
        title="Help Center"
      >
        <HelpCircle className={`${isPhoneLike ? 'w-4 h-4' : 'w-5 h-5'} text-white`} />
      </button>
    </Link>
  );
}
