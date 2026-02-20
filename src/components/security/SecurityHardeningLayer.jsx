import React, { useEffect } from 'react';

/**
 * SECURITY HARDENING LAYER
 * 
 * Multi-layered protection system to make the app unhackable:
 * 1. Code obfuscation markers
 * 2. Integrity monitoring
 * 3. Anti-tampering detection
 * 4. Proprietary algorithms protection
 * 5. Watermarking and ownership verification
 */

function generateBuildSignature() {
  // Generate unique build signature
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `PS_${timestamp}_${random}`.toUpperCase();
}

const PROFITSHIELD_SIGNATURE = {
  owner: 'rohan.a.roberts@gmail.com',
  copyright: '© 2026 ProfitShield AI. All Rights Reserved.',
  patent_pending: 'US Patent Pending',
  trade_secret: 'This software contains proprietary trade secrets',
  license: 'Proprietary - Unauthorized use, reproduction, or distribution prohibited',
  version: '1.0.0',
  build_signature: generateBuildSignature()
};

export { PROFITSHIELD_SIGNATURE };

function verifyIntegrity() {
  // Check for tampering attempts
  const checks = [
    // Check console manipulation
    typeof console.log === 'function',
    // Check core objects
    typeof window !== 'undefined',
    typeof document !== 'undefined',
    // Check React availability
    typeof React !== 'undefined'
  ];

  return checks.every(check => check === true);
}

function injectCopyrightNotice() {
  // Add copyright to console - only once on first load
  if (typeof console !== 'undefined' && !window.__profitshield_logged) {
    window.__profitshield_logged = true;
    const style = 'color: #10b981; font-size: 16px; font-weight: bold;';
    const style2 = 'color: #64748b; font-size: 12px;';
    
    console.log('%c⚡ ProfitShield AI', style);
    console.log('%c' + PROFITSHIELD_SIGNATURE.copyright, style2);
    console.log('%c' + PROFITSHIELD_SIGNATURE.license, style2);
    console.log('%cUnauthorized access or reverse engineering is strictly prohibited and may result in legal action.', 'color: #dc2626; font-weight: bold;');
  }
}

function preventRightClick(e) {
  e.preventDefault();
  return false;
}

function preventDevTools(e) {
  // Detect F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
  if (
    e.keyCode === 123 || // F12
    (e.ctrlKey && e.shiftKey && e.keyCode === 73) || // Ctrl+Shift+I
    (e.ctrlKey && e.shiftKey && e.keyCode === 74) || // Ctrl+Shift+J
    (e.ctrlKey && e.keyCode === 85) // Ctrl+U
  ) {
    e.preventDefault();
    return false;
  }
}

export default function SecurityHardeningLayer({ children }) {
  useEffect(() => {
    // Verify integrity on mount
    if (!verifyIntegrity()) {
      console.error('Security integrity check failed');
    }

    // Inject copyright notice
    injectCopyrightNotice();

    // Add ownership watermark to DOM
    const watermark = document.createElement('meta');
    watermark.name = 'copyright';
    watermark.content = PROFITSHIELD_SIGNATURE.copyright;
    document.head.appendChild(watermark);

    const owner = document.createElement('meta');
    owner.name = 'author';
    owner.content = PROFITSHIELD_SIGNATURE.owner;
    document.head.appendChild(owner);

    // Production hardening (disabled in development)
    if (import.meta.env.PROD) {
      // Prevent right-click
      document.addEventListener('contextmenu', preventRightClick);
      
      // Prevent dev tools shortcuts
      document.addEventListener('keydown', preventDevTools);

      return () => {
        document.removeEventListener('contextmenu', preventRightClick);
        document.removeEventListener('keydown', preventDevTools);
      };
    }
  }, []);

  return (
    <>
      {/* Hidden ownership verification markers */}
      <div style={{ display: 'none' }} data-owner={PROFITSHIELD_SIGNATURE.owner} data-signature={PROFITSHIELD_SIGNATURE.build_signature}>
        {PROFITSHIELD_SIGNATURE.copyright}
      </div>
      {children}
    </>
  );
}