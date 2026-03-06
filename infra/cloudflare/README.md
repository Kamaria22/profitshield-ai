# Shopify Embedded Single-Origin Entry

Use this Worker as the Shopify App URL origin so App Bridge runs on one visible origin.

## Why

`Shopify Admin -> Worker -> redirect -> Base44` breaks App Bridge (`APP::ERROR::INVALID_ORIGIN`).

The Worker in this folder proxies requests to Base44 **without redirecting**, and sets embedded CSP headers on HTML responses.

## Deploy

1. `cd infra/cloudflare`
2. `wrangler deploy -c wrangler.shopify-embedded.toml`

## Shopify App URL

Set Shopify `application_url` to the Worker origin, for example:

`https://profitshield-entry.rohan-a-roberts.workers.dev/`

Do not point Shopify directly to Base44 for embedded entry.

## Frontend env guard

Set:

`VITE_SHOPIFY_APP_URL_ORIGIN=https://profitshield-entry.rohan-a-roberts.workers.dev`

This prevents App Bridge initialization when the app is accidentally rendered on a different origin.

