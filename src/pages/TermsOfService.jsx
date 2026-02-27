import React from 'react';
import LegalPageLayout from '@/components/legal/LegalPageLayout';

export default function TermsOfService() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="February 27, 2026">
      <p>
        These Terms of Service ("Terms") govern your access to and use of ProfitShield AI ("Service"),
        operated by ProfitShield AI, Inc. ("Company"). By accessing or using the Service, you agree
        to be bound by these Terms.
      </p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By creating an account or using the Service, you represent that you are at least 18 years old,
        have the authority to bind any company or organization you represent, and have read and agree
        to these Terms and our Privacy Policy.
      </p>

      <h2>2. Description of Service</h2>
      <p>
        ProfitShield is an AI-powered fraud detection, profit analytics, and business intelligence
        platform designed for e-commerce merchants. The Service includes order risk scoring,
        profit/loss analysis, AI-generated insights, multi-platform integrations, and automated alerts.
      </p>

      <h2>3. Account Registration</h2>
      <ul>
        <li>You must provide accurate, current, and complete information</li>
        <li>You are responsible for maintaining the security of your account credentials</li>
        <li>You must notify us immediately of any unauthorized account access</li>
        <li>One person or entity may not maintain more than one free account</li>
      </ul>

      <h2>4. Subscription and Billing</h2>
      <ul>
        <li>Paid plans are billed in advance on a monthly or annual basis</li>
        <li>All fees are non-refundable except as required by law</li>
        <li>We reserve the right to change pricing with 30 days' notice</li>
        <li>Failure to pay may result in suspension or termination of your account</li>
        <li>Trial periods are subject to conversion to paid plans at trial end</li>
      </ul>
      <p>
        Payments are processed by Stripe Inc. By subscribing, you agree to Stripe's Terms of Service.
      </p>

      <h2>5. Acceptable Use</h2>
      <p>You agree NOT to:</p>
      <ul>
        <li>Use the Service for any unlawful purpose or in violation of any laws</li>
        <li>Attempt to gain unauthorized access to any part of the Service</li>
        <li>Reverse engineer, decompile, or extract our proprietary AI models</li>
        <li>Use the Service to harm, defraud, or deceive others</li>
        <li>Sell, resell, or sublicense the Service without written permission</li>
        <li>Submit false or misleading data that degrades the quality of AI models</li>
        <li>Overload, disrupt, or interfere with the Service infrastructure</li>
      </ul>

      <h2>6. Intellectual Property</h2>
      <p>
        All content, AI models, features, and functionality of the Service are owned by ProfitShield AI, Inc.
        and are protected by copyright, trademark, and other intellectual property laws.
        These Terms do not grant you any right to use our trademarks or branding.
      </p>
      <p>
        You retain ownership of your data. By using the Service, you grant ProfitShield a limited,
        non-exclusive license to process your data solely to provide the Service.
      </p>

      <h2>7. Data and Privacy</h2>
      <p>
        Your use of the Service is also governed by our Privacy Policy and, where applicable,
        our Data Processing Agreement. We implement industry-standard security measures to protect your data.
      </p>

      <h2>8. Third-Party Integrations</h2>
      <p>
        The Service integrates with third-party platforms (Shopify, Stripe, etc.). Your use of those
        platforms is governed by their respective terms of service. We are not responsible for the
        actions or omissions of third-party services.
      </p>

      <h2>9. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
        WE DO NOT WARRANT THAT THE SERVICE WILL BE ERROR-FREE, UNINTERRUPTED, OR THAT AI
        PREDICTIONS WILL BE ACCURATE OR COMPLETE. FRAUD DETECTION SCORES ARE INFORMATIONAL ONLY
        AND DO NOT CONSTITUTE LEGAL ADVICE.
      </p>

      <h2>10. Limitation of Liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, PROFITSHIELD SHALL NOT BE LIABLE FOR ANY INDIRECT,
        INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOST
        PROFITS, DATA LOSS, OR BUSINESS INTERRUPTION, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
        OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT PAID BY YOU IN THE THREE MONTHS PRECEDING THE CLAIM.
      </p>

      <h2>11. Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless ProfitShield AI, Inc., its officers, directors, employees,
        and agents from any claims, liabilities, damages, or expenses arising out of your use of the Service
        or violation of these Terms.
      </p>

      <h2>12. Termination</h2>
      <p>
        Either party may terminate the agreement at any time. We may suspend or terminate your account
        immediately for material breach. Upon termination, your right to use the Service ceases immediately.
        We will provide data export for 30 days post-termination.
      </p>

      <h2>13. Governing Law and Jurisdiction</h2>
      <p>
        These Terms are governed by the laws of the State of Delaware, USA, without regard to its conflict
        of law provisions. Any disputes shall be resolved in the state or federal courts located in
        Wilmington, Delaware.
      </p>

      <h2>14. Changes to Terms</h2>
      <p>
        We reserve the right to modify these Terms at any time. We will provide 30 days' notice for
        material changes. Continued use of the Service after the effective date constitutes acceptance.
      </p>

      <h2>15. Contact</h2>
      <p>
        ProfitShield AI, Inc.<br />
        Email: <a href="mailto:legal@profitshield.ai">legal@profitshield.ai</a>
      </p>
    </LegalPageLayout>
  );
}