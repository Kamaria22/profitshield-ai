import React from 'react';
import LegalPageLayout from '@/components/legal/LegalPageLayout';

export default function EndUserLicenseAgreement() {
  return (
    <LegalPageLayout title="End-User License Agreement (EULA)" lastUpdated="March 12, 2026">
      <p>
        This End-User License Agreement ("EULA") is a legal agreement between you and ProfitShield AI, Inc.
        for use of the ProfitShield software application, including embedded Shopify app functionality,
        web dashboards, and related components (the "App").
      </p>

      <h2>1. License Grant</h2>
      <p>
        Subject to this EULA, we grant you a limited, non-exclusive, non-transferable, revocable license to
        install, access, and use the App solely for your internal business operations.
      </p>

      <h2>2. Ownership</h2>
      <p>
        The App is licensed, not sold. ProfitShield AI, Inc. retains all right, title, and interest in the App,
        including all intellectual property rights.
      </p>

      <h2>3. Restrictions</h2>
      <p>You may not:</p>
      <ul>
        <li>Reverse engineer, decompile, disassemble, or attempt to derive source code</li>
        <li>Modify, adapt, translate, or create derivative works of the App</li>
        <li>Bypass security controls, usage limits, or access restrictions</li>
        <li>Use the App for unlawful, fraudulent, or abusive activity</li>
        <li>Resell, sublicense, lease, or commercially redistribute the App</li>
      </ul>

      <h2>4. Updates and Changes</h2>
      <p>
        We may release updates, patches, and feature changes. Some updates may be required for continued use,
        security, or compatibility with Shopify and related integrations.
      </p>

      <h2>5. Third-Party Platforms</h2>
      <p>
        The App integrates with third-party services (including Shopify and Stripe). Your use of those services
        is governed by their own terms and policies.
      </p>

      <h2>6. Data and Privacy</h2>
      <p>
        Data handling is governed by our Privacy Policy, Terms of Service, and Data Processing Agreement (where applicable).
      </p>

      <h2>7. Warranty Disclaimer</h2>
      <p>
        THE APP IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
      </p>

      <h2>8. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, PROFITSHIELD AI, INC. SHALL NOT BE LIABLE FOR INDIRECT, INCIDENTAL,
        SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM OR RELATED TO USE OF THE APP.
      </p>

      <h2>9. Termination</h2>
      <p>
        This EULA is effective until terminated. We may suspend or terminate your license for breach of this EULA.
        Upon termination, you must cease use of the App.
      </p>

      <h2>10. Governing Law</h2>
      <p>
        This EULA is governed by the laws of the State of Delaware, USA, without regard to conflict of law principles.
      </p>

      <h2>11. Contact</h2>
      <p>
        Email: <a href="mailto:legal@profitshield.ai">legal@profitshield.ai</a>
      </p>
    </LegalPageLayout>
  );
}

