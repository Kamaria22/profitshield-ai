import React from 'react';
import LegalPageLayout from '@/components/legal/LegalPageLayout';

export default function CookiePolicy() {
  return (
    <LegalPageLayout title="Cookie Policy" lastUpdated="February 27, 2026">
      <p>
        This Cookie Policy explains how ProfitShield AI, Inc. uses cookies and similar technologies
        when you use our Service. By using our Service, you consent to our use of cookies as described.
      </p>

      <h2>1. What Are Cookies</h2>
      <p>
        Cookies are small text files stored on your device. We also use similar technologies such as
        localStorage, sessionStorage, and IndexedDB for app functionality.
      </p>

      <h2>2. Cookies We Use</h2>

      <h3>2.1 Strictly Necessary</h3>
      <p>Required for the Service to function. Cannot be disabled.</p>
      <ul>
        <li><strong>auth_session</strong> — Authentication session token (expires when browser closes)</li>
        <li><strong>csrf_token</strong> — Cross-site request forgery protection</li>
        <li><strong>ps_resolver_context</strong> — Stores your selected store context (7 days)</li>
      </ul>

      <h3>2.2 Functional</h3>
      <p>Enable enhanced functionality and personalization.</p>
      <ul>
        <li><strong>ps_language</strong> — Your language preference</li>
        <li><strong>ps_biometric_enabled</strong> — Whether biometric auth is enabled</li>
        <li><strong>ps_debug_closed</strong> — Debug panel state (24 hours)</li>
        <li><strong>mobile_banner_dismissed</strong> — Whether you dismissed the install banner</li>
      </ul>

      <h3>2.3 Analytics</h3>
      <p>Help us understand how the Service is used (may be disabled).</p>
      <ul>
        <li><strong>ps_analytics</strong> — Anonymous usage analytics to improve the product</li>
      </ul>

      <h2>3. Third-Party Cookies</h2>
      <ul>
        <li><strong>Stripe</strong> — Payment processing may set cookies on checkout flows</li>
        <li><strong>Google Firebase</strong> — Push notification registration tokens</li>
      </ul>

      <h2>4. Managing Cookies</h2>
      <p>
        You can control cookies through your browser settings. Most browsers allow you to refuse,
        delete, or be notified about cookies. Note that disabling necessary cookies may affect Service functionality.
      </p>

      <h2>5. Do Not Track</h2>
      <p>
        We respect Do Not Track browser signals. When DNT is enabled, we disable non-essential analytics.
      </p>

      <h2>6. Changes</h2>
      <p>We may update this policy periodically. Check back for the latest version.</p>

      <h2>7. Contact</h2>
      <p>
        Email: <a href="mailto:privacy@profitshield.ai">privacy@profitshield.ai</a>
      </p>
    </LegalPageLayout>
  );
}