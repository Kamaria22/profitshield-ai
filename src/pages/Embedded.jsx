/**
 * /embedded — Shopify App Embedded Entry Point
 *
 * Configure your Shopify app URL to point here:
 *   https://yourapp.com/embedded?shop=SHOP&host=HOST&embedded=1
 *
 * This page renders nothing itself — it just renders the Home page.
 * The ShopifyEmbeddedAuthGate in Layout handles all authentication.
 * This route exists as a clean, dedicated entry so Shopify always lands
 * on a page that never has Base44 login in the critical path.
 */

import React from 'react';
import Home from './Home';

export default function Embedded() {
  return <Home />;
}