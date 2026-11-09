# Dropbox backup setup and acceptance

## One-time developer setup

Sam Travels uses Dropbox OAuth 2.0 Authorization Code with PKCE. The mobile app and PWA are public clients: **do not create, store, or ship a Dropbox app secret**. The Dropbox app key is a public client identifier, not a password.

1. In the Dropbox App Console, use the **Sam Travels** app (not the legacy KFE Backup app).
2. Keep **Scoped access** and **App folder** access. Enable only:
   - `files.metadata.read`
   - `files.content.read`
   - `files.content.write`
3. Enable offline/refresh-token access.
4. Register the exact redirect URIs:
   - Android: `samtravels://oauth` (the Android manifest callback).
   - PWA: the deployed HTTPS origin and pathname for the Sam Travels web app. For example, `https://your-domain.example/`. This must match the deployed app origin exactly.
   - Local development: register the local Vite origin/path only when testing locally.
5. Configure the public app key as `VITE_DROPBOX_CLIENT_ID` in the build/deployment environment. The app has the current Sam Travels client ID as a development fallback. Do not put a Dropbox app secret, access token, or refresh token in build variables, source control, or the client bundle.
6. Build and deploy the PWA/APK after configuring the app key and redirect registration.

No Dropbox password is entered into Sam Travels. Dropbox owns the sign-in and consent screens.

## Normal user experience

1. Open **Settings → Backup**.
2. Tap **Connect Dropbox**.
3. Sam Travels opens Dropbox's own authorization page. Sign in to Dropbox if asked, then approve the requested App Folder permissions.
4. Dropbox returns to Sam Travels and the app completes the callback automatically.
5. Tap **Back up now** for an immediate encrypted backup. Android also schedules best-effort daily background backup after the first successful backup. The PWA can back up while open; it cannot promise a daily job while the browser is closed.
6. Backup history lists uploaded snapshots. Restore requires selecting a snapshot and confirming replacement; the app creates a local recovery checkpoint before changing the workspace.

## Encryption and recovery

- Backup payloads are encrypted locally with AES-256-GCM before upload. New snapshots use the recovery-key-only envelope (format v2); older passphrase-and-recovery-key snapshots remain readable.
- Android stores the recovery key encrypted with an Android Keystore key. The browser stores it in the encrypted credential vault using a non-extractable WebCrypto key in IndexedDB. Browser storage is tied to that browser profile; same-origin script executing in an unlocked session can still request decryption, so keep the browser and device protected.
- **Show recovery key for another device** displays the portable key for export. Store it in a safe place separate from Dropbox. Anyone who obtains it can decrypt the backup; losing it means the encrypted snapshots cannot be recovered.
- On the original device, restore can use the locally saved recovery key. On a new device, enter the exported recovery key.
- Restore decrypts and validates the package before creating a recovery checkpoint and replacing current data. Keep the checkpoint until the restored workspace has been inspected and verified.
- Dropbox access is limited to the app's dedicated App Folder. Disconnect removes local OAuth credentials and attempts remote token revocation.

## Scheduling and network behavior

- Android uses unique periodic WorkManager work with a connected-network constraint and bounded retries. Android may defer execution due to Doze, battery restrictions, or device policy.
- Android background backup requires Dropbox authorization and a locally protected recovery key established by the first successful backup.
- The PWA performs backups while open. Browser background scheduling is not reliable when the app is closed.
- The app-level **Internet Access** policy must be enabled. Disabling it defers Dropbox requests without deleting local records, backup history, or credentials.
- The repository CI uses mocked Dropbox endpoints. A green CI run does not prove the Dropbox app's real OAuth redirect, account permissions, or real upload/download/revocation.

## Geocoder / Cloudflare Worker

The Geoapify reverse-geocoding proxy is a separate Cloudflare Worker concern; it does not participate in Dropbox OAuth. Keep `GEOAPIFY_API_KEY` as a Cloudflare Worker secret, not a client build variable. The deployed Worker URL is `https://sam-travels.amtalwalkar.workers.dev`. Configure `VITE_GEOAPIFY_PROXY_URL` to this URL in PWA and Android build environments.

Verify production with an allowlisted app origin and a real coordinate request to `POST /reverse-geocode`. Confirm a normalized `label` response, CORS behavior, and rate limiting. Never expose the Geoapify key or raw upstream response.

## Acceptance still requiring a real device/account

- Complete Dropbox authorization, upload, history listing, download, and restore with the real Sam Travels Dropbox app.
- Verify Android Keystore persistence, process interruption, offline deferral, reboot/Doze behavior, and recovery on a physical Android device.
- Verify PWA OAuth redirect and encrypted credential persistence on the deployed HTTPS origin.
- Verify the production Cloudflare Worker is deployed with its secret, rate-limit binding, and actual production PWA origin allowlisted.
