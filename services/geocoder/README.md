# Sam Travels Geoapify reverse-geocoding proxy

This Cloudflare Worker is the only component allowed to hold the Geoapify API key. The PWA and Android app call this proxy; they must never call Geoapify directly.

## One-time setup

1. Create a Geoapify project and a key with the **Geocoding API** enabled. Restrict the key to the Geocoding API in the Geoapify dashboard where supported.
2. Sign in to Cloudflare with Wrangler: `npx wrangler@4 login`.
3. Edit `wrangler.toml`:
   - Keep `https://localhost` for the Capacitor Android WebView origin.
   - Keep `http://localhost:5173` for local Vite development.
   - Add the exact production PWA origin(s) to `ALLOWED_ORIGINS`, comma-separated.
   - Give `RATE_LIMITER` a unique positive numeric `namespace_id` within the Cloudflare account.
4. Add the provider key as a Worker secret (never as a `vars` value):
   ```sh
   npx wrangler@4 secret put GEOAPIFY_API_KEY --config services/geocoder/wrangler.toml
   ```
5. Deploy:
   ```sh
   npx wrangler@4 deploy --config services/geocoder/wrangler.toml
   ```
6. Copy the deployed Worker URL, normally `https://sam-travels-geocoder.<account-subdomain>.workers.dev`.
7. Set `VITE_GEOAPIFY_PROXY_URL` to that URL in the PWA and Android build environment, then rebuild the PWA and APK. This URL is not a secret. The API key is never supplied to the build.

## Endpoint contract

- `POST /reverse-geocode`
- JSON body: `{"latitude":19.076,"longitude":72.8777}`
- Success: `{"label":"Andheri, Mumbai, Maharashtra, India"}` or `{"label":null}`
- Requests require an allowlisted browser origin and Cloudflare client IP header.
- Limit: 30 requests per IP per 60 seconds, enforced by the Cloudflare rate-limit binding.
- The Worker returns no raw Geoapify payload, provider key or upstream error body.

## Local verification

Run the normal repository tests; `services/geocoder/index.test.ts` covers coordinate validation, origin rejection, rate limiting, successful locality normalization and credential/error non-disclosure.

The app intentionally shows its normal location fallback until both the Worker is deployed and `VITE_GEOAPIFY_PROXY_URL` is configured. It must not bypass the proxy if configuration is missing.
