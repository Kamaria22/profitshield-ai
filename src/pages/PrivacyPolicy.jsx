import React from 'react';
import LegalPageLayout from '@/components/legal/LegalPageLayout';

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="February 27, 2026">
      <p>
        ProfitShield AI, Inc. ("ProfitShield," "we," "us," or "our") operates the ProfitShield platform
        (the "Service"). This Privacy Policy explains how we collect, use, disclose, and protect your
        information when you use our Service.
      </p>

      <h2>1. Information We Collect</h2>
      <h3>1.1 Information You Provide</h3>
      <ul>
        <li>Account registration information (name, email address, company name)</li>
        <li>Billing and payment information (processed by Stripe — we do not store card numbers)</li>
        <li>Store credentials and API tokens for connected platforms (Shopify, WooCommerce, etc.)</li>
        <li>Support communications and feedback</li>
      </ul>

      <h3>1.2 Information Collected Automatically</h3>
      <ul>
        <li>Log data (IP address, browser type, pages visited, timestamps)</li>
        <li>Device information (device type, operating system, unique device identifiers)</li>
        <li>Usage data (features used, click patterns, session duration)</li>
        <li>Performance data (error reports, crash logs)</li>
        <li>Cookies and similar tracking technologies (see our Cookie Policy)</li>
      </ul>

      <h3>1.3 Information from Third Parties</h3>
      <ul>
        <li>E-commerce platform data (orders, customers, products) via integrations you authorize</li>
        <li>Payment processor events from Stripe</li>
        <li>Authentication data from your identity provider</li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <ul>
        <li>Provide, operate, and improve the Service</li>
        <li>Detect and prevent fraud and security threats</li>
        <li>Process payments and manage subscriptions</li>
        <li>Send transactional and product-related communications</li>
        <li>Analyze usage to improve features and performance</li>
        <li>Comply with legal obligations</li>
        <li>Respond to support requests</li>
      </ul>

      <h2>3. Third-Party Processors</h2>
      <p>We share information with the following categories of third-party service providers:</p>
      <ul>
        <li><strong>Stripe Inc.</strong> — Payment processing and billing. Subject to Stripe's Privacy Policy.</li>
        <li><strong>Shopify Inc.</strong> — E-commerce platform integration. Subject to Shopify's Privacy Policy.</li>
        <li><strong>Google LLC (Firebase/FCM)</strong> — Push notifications and analytics.</li>
        <li><strong>Amazon Web Services</strong> — Cloud infrastructure and data storage.</li>
        <li><strong>Sentry</strong> — Error monitoring and crash reporting.</li>
        <li><strong>Shotstack</strong> — Video rendering for demo features.</li>
      </ul>
      <p>
        A full list of sub-processors is available in our{' '}
        <a href="/dpa">Data Processing Agreement</a>.
      </p>

      <h2>4. Data Retention</h2>
      <p>
        We retain your personal data for as long as your account is active or as needed to provide services.
        If you cancel your account, we will delete or anonymize your data within 90 days, except where
        retention is required by law (e.g., financial records retained for 7 years).
      </p>

      <h2>5. Your Rights</h2>
      <h3>GDPR (EEA/UK Users)</h3>
      <ul>
        <li>Right to access your personal data</li>
        <li>Right to rectification of inaccurate data</li>
        <li>Right to erasure ("right to be forgotten")</li>
        <li>Right to restriction of processing</li>
        <li>Right to data portability</li>
        <li>Right to object to processing</li>
        <li>Right to withdraw consent</li>
      </ul>
      <h3>CCPA (California Users)</h3>
      <ul>
        <li>Right to know what personal information is collected and how it is used</li>
        <li>Right to delete personal information</li>
        <li>Right to opt out of sale of personal information (we do not sell your data)</li>
        <li>Right to non-discrimination for exercising your rights</li>
      </ul>
      <p>
        To exercise any of these rights, contact us at{' '}
        <a href="mailto:privacy@profitshield.ai">privacy@profitshield.ai</a>.
      </p>

      <h2>6. Data Security</h2>
      <p>
        We implement industry-standard security measures including AES-256 encryption at rest,
        TLS 1.3 in transit, access controls, and regular security audits. However, no method of
        transmission over the Internet is 100% secure.
      </p>

      <h2>7. Cookies</h2>
      <p>We use cookies and similar technologies. See our full <a href="/cookies">Cookie Policy</a>.</p>

      <h2>8. Children's Privacy</h2>
      <p>
        Our Service is not directed to children under 13. We do not knowingly collect personal
        information from children under 13.
      </p>

      <h2>9. International Data Transfers</h2>
      <p>
        We are headquartered in the United States. If you are accessing our Service from outside the US,
        your data may be transferred to and processed in the US. For EEA/UK users, we rely on Standard
        Contractual Clauses approved by the European Commission.
      </p>

      <h2>10. User Deletion</h2>
      <p>
        You may request deletion of your account and all associated data at any time from Settings → 
        Account → Delete Account, or by emailing{' '}
        <a href="mailto:privacy@profitshield.ai">privacy@profitshield.ai</a>.
        Deletion is processed within 30 days.
      </p>

      <h2>11. Changes to This Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We will notify you of material changes via
        email or a prominent notice in the app. Continued use after changes constitutes acceptance.
      </p>

      <h2>12. Contact Us</h2>
      <p>
        ProfitShield AI, Inc.<br />
        Legal Department<br />
        Email: <a href="mailto:legal@profitshield.ai">legal@profitshield.ai</a><br />
        Privacy: <a href="mailto:privacy@profitshield.ai">privacy@profitshield.ai</a>
      </p>
    </LegalPageLayout>
  );
}