import React from 'react';
import LegalPageLayout from '@/components/legal/LegalPageLayout';

export default function ComplianceNotice() {
  return (
    <LegalPageLayout title="GDPR & CCPA Compliance Notice" lastUpdated="March 12, 2026">
      <p>
        This notice summarizes rights and controls for users and customers under major privacy regulations,
        including GDPR (EU/UK) and CCPA/CPRA (California).
      </p>

      <h2>1. Scope</h2>
      <p>
        This notice applies to personal data processed through the ProfitShield app, including merchant account data,
        connected-commerce integration data, and support communications.
      </p>

      <h2>2. GDPR Rights</h2>
      <ul>
        <li>Right of access</li>
        <li>Right to rectification</li>
        <li>Right to erasure</li>
        <li>Right to restriction of processing</li>
        <li>Right to data portability</li>
        <li>Right to object to processing</li>
        <li>Right to withdraw consent where consent is the lawful basis</li>
      </ul>

      <h2>3. CCPA/CPRA Rights</h2>
      <ul>
        <li>Right to know categories and specific pieces of personal information collected</li>
        <li>Right to delete personal information (subject to legal exceptions)</li>
        <li>Right to correct inaccurate personal information</li>
        <li>Right to limit use of sensitive personal information where applicable</li>
        <li>Right to non-discrimination for exercising privacy rights</li>
      </ul>

      <h2>4. How to Submit Requests</h2>
      <p>
        You can submit privacy requests by emailing <a href="mailto:privacy@profitshield.ai">privacy@profitshield.ai</a>.
        For merchant data managed within the app, use in-product controls where available (export/delete workflows).
      </p>

      <h2>5. Verification and Response Time</h2>
      <p>
        We verify requestor identity before fulfilling requests. We respond within applicable legal deadlines,
        including 30 days for many GDPR requests and 45 days for many CCPA requests (with extensions where permitted).
      </p>

      <h2>6. Data Processor / Controller Roles</h2>
      <p>
        For merchant operational data, merchants are typically controllers and ProfitShield acts as processor.
        Details are set out in the Data Processing Agreement.
      </p>

      <h2>7. Contact</h2>
      <p>
        Privacy Team: <a href="mailto:privacy@profitshield.ai">privacy@profitshield.ai</a><br />
        Legal Team: <a href="mailto:legal@profitshield.ai">legal@profitshield.ai</a>
      </p>
    </LegalPageLayout>
  );
}

