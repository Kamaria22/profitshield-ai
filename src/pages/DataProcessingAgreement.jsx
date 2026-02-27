import React from 'react';
import LegalPageLayout from '@/components/legal/LegalPageLayout';

export default function DataProcessingAgreement() {
  return (
    <LegalPageLayout title="Data Processing Agreement" lastUpdated="February 27, 2026">
      <p>
        This Data Processing Agreement ("DPA") is entered into between ProfitShield AI, Inc. ("Processor")
        and the customer ("Controller") as part of the Terms of Service. This DPA applies where ProfitShield
        processes personal data on behalf of the Controller, particularly where GDPR, UK GDPR, or CCPA applies.
      </p>

      <h2>1. Definitions</h2>
      <ul>
        <li><strong>Personal Data</strong> — Any information relating to an identified or identifiable natural person</li>
        <li><strong>Processing</strong> — Any operation performed on personal data</li>
        <li><strong>Controller</strong> — The entity that determines the purposes and means of processing</li>
        <li><strong>Processor</strong> — ProfitShield AI, Inc., which processes data on behalf of the Controller</li>
        <li><strong>Sub-processor</strong> — A third party engaged by ProfitShield to assist in processing</li>
      </ul>

      <h2>2. Subject Matter and Duration</h2>
      <p>
        ProfitShield processes personal data for the duration of the Service agreement to provide
        fraud detection, analytics, and business intelligence services as described in the Terms of Service.
      </p>

      <h2>3. Nature and Purpose of Processing</h2>
      <ul>
        <li>Order and transaction data analysis for fraud detection</li>
        <li>Customer behavioral analytics for risk scoring</li>
        <li>Profit and loss computation from e-commerce data</li>
        <li>AI model training on anonymized and aggregated data</li>
        <li>Push notification delivery</li>
        <li>Account management and billing</li>
      </ul>

      <h2>4. Types of Personal Data Processed</h2>
      <ul>
        <li>Customer names, email addresses, phone numbers</li>
        <li>IP addresses and device identifiers</li>
        <li>Order details (amounts, items, shipping addresses)</li>
        <li>Payment metadata (not full card numbers)</li>
        <li>Behavioral data (clickstreams, session data)</li>
      </ul>

      <h2>5. Obligations of the Processor</h2>
      <p>ProfitShield agrees to:</p>
      <ul>
        <li>Process personal data only on documented instructions from the Controller</li>
        <li>Ensure persons authorized to process the data are bound by confidentiality</li>
        <li>Implement appropriate technical and organizational security measures</li>
        <li>Assist the Controller in responding to data subject rights requests</li>
        <li>Delete or return all personal data upon termination</li>
        <li>Provide all information necessary to demonstrate compliance</li>
        <li>Notify the Controller of any personal data breach without undue delay</li>
      </ul>

      <h2>6. Sub-processors</h2>
      <p>ProfitShield uses the following sub-processors:</p>
      <ul>
        <li><strong>Amazon Web Services (AWS)</strong> — Cloud infrastructure, US and EU regions</li>
        <li><strong>Stripe Inc.</strong> — Payment processing, USA</li>
        <li><strong>Google LLC</strong> — Firebase/FCM push notifications, Cloud services</li>
        <li><strong>Sentry</strong> — Error monitoring and logging</li>
        <li><strong>Shotstack Pty Ltd</strong> — Video rendering services, Australia</li>
      </ul>
      <p>
        Controller consents to the use of these sub-processors. ProfitShield will notify the Controller
        of any intended changes at least 30 days in advance.
      </p>

      <h2>7. International Data Transfers</h2>
      <p>
        Where personal data is transferred outside the EEA or UK, such transfers are covered by
        Standard Contractual Clauses (SCCs) approved by the European Commission, or equivalent
        mechanisms under applicable law.
      </p>

      <h2>8. Security Measures</h2>
      <ul>
        <li>AES-256 encryption at rest</li>
        <li>TLS 1.3 encryption in transit</li>
        <li>Role-based access controls</li>
        <li>Regular penetration testing</li>
        <li>SOC 2 Type II controls (in progress)</li>
        <li>Annual security audits</li>
      </ul>

      <h2>9. Data Breach Notification</h2>
      <p>
        In the event of a personal data breach, ProfitShield will notify the Controller without undue
        delay and in any event within 72 hours of becoming aware of the breach, providing all required
        information under GDPR Article 33.
      </p>

      <h2>10. Data Subject Rights</h2>
      <p>
        ProfitShield will assist the Controller in fulfilling data subject rights requests (access,
        rectification, erasure, portability, objection) within 30 days.
      </p>

      <h2>11. Deletion and Return</h2>
      <p>
        Upon termination of the Service, ProfitShield will delete all personal data within 90 days,
        unless retention is required by applicable law. A data export is available for 30 days post-termination.
      </p>

      <h2>12. Governing Law</h2>
      <p>This DPA is governed by the laws of the State of Delaware, USA.</p>

      <h2>13. Contact the Data Protection Officer</h2>
      <p>
        Email: <a href="mailto:privacy@profitshield.ai">privacy@profitshield.ai</a><br />
        ProfitShield AI, Inc., Legal Department
      </p>
    </LegalPageLayout>
  );
}