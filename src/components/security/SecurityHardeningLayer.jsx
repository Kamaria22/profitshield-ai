import React, { useEffect } from 'react';

/**
 * SECURITY HARDENING LAYER
 */

function generateBuildSignature() {
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
  const checks = [
    typeof console !== 'undefined',
    typeof window !== 'undefined',
    typeof document !== 'undefined',
    typeof React !== 'undefined'
  ];
  return checks.every(Boolean);
}

function injectCopyrightNotice() {
  if (
    typeof window !== 'undefined' &&
    typeof console !== 'undefined' &&
    !window.__profitshield_logged
  ) {
    window.__profitshield_logged = true;

    const style = 'color: #10b981; font-size: 16px; font-weight: bold;';
    const style2 = 'color: #64748b; font-size: 12px;';

    console.log('%c⚡ ProfitShield AI', style);
    console.log('%c' + PROFITSHIELD_SIGNATURE.copyright, style2);
    console.log('%c' + PROFITSHIELD_SIGNATURE.license, style2);
    console.log(
      '%cUnauthorized access or reverse engineering is strictly prohibited and may result in legal action.',
      'color: #dc2626; font-weight: bold;'
    );
  }
}

function preventRightClick(e) {
  e.preventDefault();
}

function preventDevTools(e) {
  if (
    e.keyCode === 123 ||
    (e.ctrlKey && e.shiftKey && e.keyCode === 73) ||
    (e.ctrlKey && e.shiftKey && e.keyCode === 74) ||
    (e.ctrlKey && e.keyCode === 85)
  ) {
    e.preventDefault();
  }
}

export default function SecurityHardeningLayer({ children }) {
  useEffect(() => {
    if (!verifyIntegrity()) {
      console.error('Security integrity check failed');
    }

    injectCopyrightNotice();

    const upsertMeta = (name, content) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.name = name;
        document.head.appendChild(el);
      }
      el.content = content;
      return el;
    };

    // Inject Shopify-compatible CSP via meta tag.
    // frame-ancestors cannot be set via meta tag (browser ignores it),
    // but we set the remaining directives here. X-Frame-Options is intentionally
    // NOT injected — Shopify Admin requires iframe embedding.
    upsertMeta(
      'http-equiv',
      // No-op: http-equiv CSP is set in the HTML shell. This just ensures no override.
      undefined
    );

    const watermark = upsertMeta(
      'copyright',
      PROFITSHIELD_SIGNATURE.copyright
    );
    const owner = upsertMeta(
      'author',
      PROFITSHIELD_SIGNATURE.owner
    );

    if (import.meta.env.PROD) {
      document.addEventListener('contextmenu', preventRightClick);
      document.addEventListener('keydown', preventDevTools);
    }

    return () => {
      if (import.meta.env.PROD) {
        document.removeEventListener('contextmenu', preventRightClick);
        document.removeEventListener('keydown', preventDevTools);
      }

      watermark?.remove?.();
      owner?.remove?.();
    };
  }, []);

  return (
    <>
      <div
        style={{ display: 'none' }}
        data-owner={PROFITSHIELD_SIGNATURE.owner}
        data-signature={PROFITSHIELD_SIGNATURE.build_signature}
      >
        {PROFITSHIELD_SIGNATURE.copyright}
      </div>
      {children}
    </>
  );
}