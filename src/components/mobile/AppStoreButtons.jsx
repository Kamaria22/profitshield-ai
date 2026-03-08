import React from 'react';
import { Apple, Play } from 'lucide-react';

/**
 * APP STORE BUTTONS
 * Beautiful app store download buttons with hover effects
 */
export default function AppStoreButtons({ variant = 'default' }) {
  const handleAppStore = () => {
    window.open('https://apps.apple.com/app/profitshield-ai/id6741820887', '_blank', 'noopener,noreferrer');
  };

  const handlePlayStore = () => {
    window.open('https://play.google.com/store/apps/details?id=ai.profitshield.app', '_blank', 'noopener,noreferrer');
  };

  if (variant === 'compact') {
    return (
      <div className="flex gap-3">
        <button
          onClick={handleAppStore}
          className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-all hover:scale-105"
        >
          <Apple className="w-5 h-5" />
          <span className="text-sm font-medium">App Store</span>
        </button>
        <button
          onClick={handlePlayStore}
          className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-all hover:scale-105"
        >
          <Play className="w-5 h-5" />
          <span className="text-sm font-medium">Play Store</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      {/* Apple App Store */}
      <button
        onClick={handleAppStore}
        className="group relative overflow-hidden bg-black text-white rounded-2xl px-6 py-3 hover:bg-gray-900 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-cyan-500/20"
      >
        <div className="flex items-center gap-3">
          <Apple className="w-8 h-8" />
          <div className="text-left">
            <p className="text-xs opacity-80">Download on the</p>
            <p className="text-lg font-bold">App Store</p>
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>

      {/* Google Play Store */}
      <button
        onClick={handlePlayStore}
        className="group relative overflow-hidden bg-black text-white rounded-2xl px-6 py-3 hover:bg-gray-900 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/20"
      >
        <div className="flex items-center gap-3">
          <Play className="w-8 h-8" />
          <div className="text-left">
            <p className="text-xs opacity-80">GET IT ON</p>
            <p className="text-lg font-bold">Google Play</p>
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    </div>
  );
}
