import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Keep build logs actionable while suppressing known stale-data advisories.
const originalWarn = console.warn.bind(console);
console.warn = (...args) => {
  const msg = String(args?.[0] || '');
  if (
    msg.includes('[baseline-browser-mapping] The data in this module is over two months old') ||
    msg.includes('Browserslist: browsers data (caniuse-lite) is')
  ) {
    return;
  }
  originalWarn(...args);
};

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  const isDev = command === 'serve';
  if (!process.env.VITE_BASE44_APP_BASE_URL) {
    process.env.VITE_BASE44_APP_BASE_URL =
      process.env.SHOPIFY_APP_URL || process.env.APP_URL || 'https://profit-shield-ai.base44.app';
  }
  if (!process.env.BROWSERSLIST_IGNORE_OLD_DATA) {
    process.env.BROWSERSLIST_IGNORE_OLD_DATA = '1';
  }
  return {
    logLevel: 'error', // Suppress warnings, only show errors
    plugins: [
      base44({
        // Support for legacy code that imports the base44 SDK with @/integrations, @/entities, etc.
        // can be removed if the code has been updated to use the new SDK imports from @base44/sdk
        legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
        // Dev-only injectors are disabled in build mode to keep production compile deterministic.
        hmrNotifier: isDev,
        navigationNotifier: isDev,
        visualEditAgent: isDev
      }),
      react(),
    ]
  };
});
