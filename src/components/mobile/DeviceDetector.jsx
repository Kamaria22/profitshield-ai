/**
 * DEVICE DETECTOR UTILITY
 * Detects device type, OS, and provides smart download recommendations
 */

export const detectDevice = () => {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  
  return {
    isIOS: /iPad|iPhone|iPod/.test(ua) && !window.MSStream,
    isAndroid: /android/i.test(ua),
    isMobile: /iPhone|iPad|iPod|Android/i.test(ua),
    isDesktop: !/iPhone|iPad|iPod|Android/i.test(ua),
    isMacOS: /Macintosh|MacIntel|MacPPC|Mac68K/.test(ua),
    isWindows: /Win32|Win64|Windows|WinCE/.test(ua),
    isLinux: /Linux/.test(ua) && !/Android/.test(ua),
    isPWAInstalled: window.matchMedia('(display-mode: standalone)').matches,
    supportsInstall: 'BeforeInstallPromptEvent' in window
  };
};

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
      window.location.href = 'https://apps.apple.com/app/profitshield';
    } else if (device.isAndroid) {
      window.location.href = 'https://play.google.com/store/apps/details?id=com.profitshield.app';
    }
  }, 2000);
  
  window.location.href = deepLink;
  window.addEventListener('blur', () => clearTimeout(timeout));
};