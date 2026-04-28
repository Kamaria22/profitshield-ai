// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';

/**
 * DEVICE DETECTOR UTILITY
 * Detects device type, OS, and provides smart download recommendations
 */

export const detectDevice = () => {
  const nav = typeof navigator !== 'undefined' ? navigator : { userAgent: '', vendor: '' };
  const win = typeof window !== 'undefined' ? window : {};
  const ua = nav.userAgent || nav.vendor || win.opera || '';
  const uaData = nav.userAgentData || {};
  const width = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const height = typeof window !== 'undefined' ? window.innerHeight : 900;
  const maxTouchPoints = Number(nav.maxTouchPoints || 0);
  const coarsePointer = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(pointer: coarse)').matches
    : false;
  const hasTouch = maxTouchPoints > 0 || ('ontouchstart' in win);
  const hasCoarseTouch = hasTouch || coarsePointer;
  const isTabletUa = /iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  const isMobileUa = /iPhone|iPod|Android.+Mobile|Windows Phone|webOS|BlackBerry/i.test(ua) || uaData.mobile === true;
  const shortestSide = Math.min(width, height);
  const longestSide = Math.max(width, height);
  const isTabletViewport = shortestSide >= 600 && shortestSide <= 1024 && hasCoarseTouch;
  const isMobileViewport = shortestSide < 600;
  const isTablet = isTabletUa || (!isMobileUa && isTabletViewport);
  const isMobile = isMobileUa || isMobileViewport;
  const isDesktop = !isMobile && !isTablet;
  const isLandscape = width > height;
  const isEmbedded = (() => {
    try {
      const params = new URLSearchParams(window.location.search || '');
      return !!(params.get('shop') && (params.get('host') || params.get('embedded') === '1'));
    } catch {
      return false;
    }
  })();
  
  const formFactor = isMobile ? 'phone' : isTablet ? 'tablet' : 'desktop';
  const input = hasCoarseTouch ? 'touch' : 'pointer';
  const viewportClass = shortestSide < 380 ? 'compact' : shortestSide < 768 ? 'small' : shortestSide < 1200 ? 'medium' : 'large';
  const kind = (() => {
    if (formFactor === 'phone') return 'phone';
    if (formFactor === 'tablet') return 'tablet';
    if (/TV|SmartTV|Tizen|Web0S|HbbTV/i.test(ua) || longestSide >= 1800) return 'tv';
    if (hasCoarseTouch && longestSide <= 1600) return 'touch-laptop';
    if (shortestSide >= 1280) return 'desktop';
    return 'laptop';
  })();

  return {
    isIOS: /iPad|iPhone|iPod/.test(ua) && !win.MSStream,
    isAndroid: /android/i.test(ua),
    isMobile,
    isTablet,
    isDesktop,
    isMacOS: /Macintosh|MacIntel|MacPPC|Mac68K/.test(ua),
    isWindows: /Win32|Win64|Windows|WinCE/.test(ua),
    isLinux: /Linux/.test(ua) && !/Android/.test(ua),
    isPWAInstalled: typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches,
    supportsInstall: typeof window !== 'undefined' && 'onbeforeinstallprompt' in window,
    isTouch: hasTouch,
    hasCoarseTouch,
    isLandscape,
    isEmbedded,
    formFactor,
    kind,
    input,
    viewportClass,
    viewport: {
      width,
      height,
      short: width < 390 || height < 700,
      shortestSide,
      longestSide
    },
    className: formFactor
  };
};

export function useDeviceProfile() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let timer = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setTick((v) => v + 1), 80);
    };
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    const mm = typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)')
      : null;
    if (mm && typeof mm.addEventListener === 'function') {
      mm.addEventListener('change', schedule);
    }
    return () => {
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      if (mm && typeof mm.removeEventListener === 'function') {
        mm.removeEventListener('change', schedule);
      }
      if (timer) clearTimeout(timer);
    };
  }, []);

  return useMemo(() => detectDevice(), [tick]);
}

export const getRecommendedDownload = () => {
  const device = detectDevice();
  
  if (device.isIOS) {
    return {
      type: 'ios',
      label: 'Download from App Store',
      icon: 'apple',
      url: 'https://apps.apple.com/app/profitshield-ai/id6741820887',
      priority: 1
    };
  }
  
  if (device.isAndroid) {
    return {
      type: 'android',
      label: 'Get it on Google Play',
      icon: 'play',
      url: 'https://play.google.com/store/apps/details?id=ai.profitshield.app',
      priority: 1
    };
  }
  
  if (device.isDesktop) {
    return {
      type: 'desktop',
      label: 'Install Desktop App',
      icon: 'download',
      priority: 1
    };
  }
  
  return {
    type: 'pwa',
    label: 'Install Web App',
    icon: 'globe',
    priority: 2
  };
};

export const openDeepLink = (path = '') => {
  const device = detectDevice();
  
  // Try app deep link first
  const deepLink = `profitshield://app${path}`;
  const timeout = setTimeout(() => {
    // Fallback to store if app not installed
    if (device.isIOS) {
      window.location.href = 'https://apps.apple.com/app/profitshield-ai/id6741820887';
    } else if (device.isAndroid) {
      window.location.href = 'https://play.google.com/store/apps/details?id=ai.profitshield.app';
    }
  }, 2000);
  
  window.location.href = deepLink;
  window.addEventListener('blur', () => clearTimeout(timeout));
};
