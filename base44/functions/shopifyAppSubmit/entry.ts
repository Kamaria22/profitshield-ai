/**
 * Automated Shopify Partner API submission helper.
 * Reads secrets + builds the submission payload and sends it to
 * the Shopify Partner Dashboard GraphQL API.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const PARTNER_API_URL = 'https://partners.shopify.com/api/2024-04/graphql.json';

const APP_LISTING_PAYLOAD = {
  name: 'ProfitShield AI',
  tagline: 'Fraud Protection & Profit AI',
  description: `ProfitShield AI is the most advanced fraud protection and profit intelligence platform for Shopify merchants.

PROTECT YOUR PROFIT
• Real-time AI fraud detection on every order
• Neural risk scoring across 50+ behavioral signals
• Automatic high-risk order flagging and holds
• Chargeback prediction and prevention

UNDERSTAND YOUR BUSINESS
• Live P&L analytics with margin breakdown
• Profit leak detection and forensics
• AI-generated insights and recommendations

ENTERPRISE GRADE
• Role-based access control
• Full audit trail and compliance logs
• GDPR and CCPA compliant
• Bank-level encryption (AES-256)`,
  supportUrl: 'https://profitshield.base44.app/?page=HelpCenter',
  privacyPolicyUrl: 'https://profitshield.base44.app/?page=PrivacyPolicy',
  termsUrl: 'https://profitshield.base44.app/?page=TermsOfService',
  webhooks: [
    { topic: 'CUSTOMERS_REDACT', endpoint: `${Deno.env.get('APP_URL') || 'https://profitshield.base44.app'}/api/gdprCustomerRedact` },
    { topic: 'SHOP_REDACT', endpoint: `${Deno.env.get('APP_URL') || 'https://profitshield.base44.app'}/api/gdprShopRedact` },
    { topic: 'CUSTOMERS_DATA_REQUEST', endpoint: `${Deno.env.get('APP_URL') || 'https://profitshield.base44.app'}/api/gdprCustomerDataRequest` },
  ]
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { action } = await req.json().catch(() => ({}));
    const apiKey = Deno.env.get('SHOPIFY_API_KEY');
    const apiSecret = Deno.env.get('SHOPIFY_API_SECRET');
    const partnerToken = Deno.env.get('SHOPIFY_PARTNER_TOKEN');
    const organizationId = Deno.env.get('SHOPIFY_PARTNER_ORG_ID');

    // Return current submission info / readiness check
    if (action === 'check') {
      return Response.json({
        ok: true,
        hasApiKey: !!apiKey,
        hasApiSecret: !!apiSecret,
        hasPartnerToken: !!partnerToken,
        hasOrgId: !!organizationId,
        payload: APP_LISTING_PAYLOAD,
        appUrl: Deno.env.get('APP_URL') || null,
      });
    }

    // Submit listing via Shopify Partner API
    if (action === 'submit') {
      if (!partnerToken || !organizationId) {
        return Response.json({
          ok: false,
          error: 'Missing SHOPIFY_PARTNER_TOKEN or SHOPIFY_PARTNER_ORG_ID secrets. Please set them in Base44 dashboard.',
          missingSecrets: [
            ...(!partnerToken ? ['SHOPIFY_PARTNER_TOKEN'] : []),
            ...(!organizationId ? ['SHOPIFY_PARTNER_ORG_ID'] : []),
          ]
        });
      }

      // Call Shopify Partners GraphQL API to update app listing
      const mutation = `
        mutation appListingUpdate($apiKey: String!, $input: AppListingInput!) {
          appListingUpdate(apiKey: $apiKey, input: $input) {
            userErrors { field message }
            appListing {
              id
              title
              status
            }
          }
        }
      `;

      const variables = {
        apiKey: apiKey,
        input: {
          title: APP_LISTING_PAYLOAD.name,
          tagline: APP_LISTING_PAYLOAD.tagline,
          description: APP_LISTING_PAYLOAD.description,
          supportUrl: APP_LISTING_PAYLOAD.supportUrl,
          privacyPolicyUrl: APP_LISTING_PAYLOAD.privacyPolicyUrl,
          termsConditionsUrl: APP_LISTING_PAYLOAD.termsUrl,
        }
      };

      const res = await fetch(`${PARTNER_API_URL.replace('PARTNER_ORG', organizationId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': partnerToken,
        },
        body: JSON.stringify({ query: mutation, variables })
      });

      const data = await res.json();

      if (data.errors?.length) {
        return Response.json({ ok: false, errors: data.errors });
      }

      const result = data?.data?.appListingUpdate;
      if (result?.userErrors?.length) {
        return Response.json({ ok: false, userErrors: result.userErrors });
      }

      // Log the submission
      await base44.asServiceRole.entities.AuditLog.create({
        tenant_id: 'system',
        action: 'app_store_listing_submitted',
        entity_type: 'AppListing',
        performed_by: user.email,
        description: 'Automated Shopify App Store listing submission',
        severity: 'medium',
        category: 'config',
        metadata: { listing: result?.appListing }
      });

      return Response.json({ ok: true, listing: result?.appListing, message: 'Listing updated successfully!' });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});