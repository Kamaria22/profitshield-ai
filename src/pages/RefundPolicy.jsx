import React from 'react';
import LegalPageLayout from '@/components/legal/LegalPageLayout';

export default function RefundPolicy() {
  return (
    <LegalPageLayout title="Return & Refund Policy" lastUpdated="March 12, 2026">
      <p>
        This policy applies to paid subscriptions and app-billing charges for ProfitShield AI.
        Because ProfitShield is a digital SaaS product, physical returns do not apply.
      </p>

      <h2>1. Free Trial</h2>
      <p>
        Eligible plans may include a trial period. You may cancel at any time before trial conversion to avoid charges.
      </p>

      <h2>2. Subscription Charges</h2>
      <ul>
        <li>Subscriptions are billed in advance per billing cycle</li>
        <li>Unless required by law, fees are non-refundable once charged</li>
        <li>Cancellation stops future renewals; current cycle access continues through paid term end</li>
      </ul>

      <h2>3. Duplicate or Erroneous Charges</h2>
      <p>
        If you believe you were charged in error (for example, duplicate charges), contact us at
        <a href="mailto:billing@profitshield.ai"> billing@profitshield.ai</a>. Verified billing errors are refunded.
      </p>

      <h2>4. App Store / Platform Billing</h2>
      <p>
        If billing is processed through a platform (such as Shopify app billing), billing workflows and certain dispute/refund
        outcomes may also be subject to that platform's policies and controls.
      </p>

      <h2>5. Refund Request Window</h2>
      <p>
        For charge-error review, submit refund requests within 30 days of the billing event whenever possible.
      </p>

      <h2>6. How to Request Review</h2>
      <p>
        Email <a href="mailto:billing@profitshield.ai">billing@profitshield.ai</a> with:
      </p>
      <ul>
        <li>Account/store identifier</li>
        <li>Invoice or billing reference</li>
        <li>Reason for refund request</li>
      </ul>

      <h2>7. Contact</h2>
      <p>
        Billing: <a href="mailto:billing@profitshield.ai">billing@profitshield.ai</a><br />
        Legal: <a href="mailto:legal@profitshield.ai">legal@profitshield.ai</a>
      </p>
    </LegalPageLayout>
  );
}

