# Dropbox setup and acceptance

Dropbox credentials are configured by the user. The repository intentionally contains no app secret, refresh token, access token, or recovery key.

## Create the Dropbox app

1. Open the Dropbox App Console and create an app with **Scoped access** and the narrowest account scope that supports the app's backup folder.
2. Enable only these OAuth scopes:
   - `files.metadata.read`
   - `files.content.read`
   - `files.content.write`
3. Enable refresh-token/offline access. The app uses OAuth 2.0 Authorization Code with PKCE; a client secret is not required or stored.
4. Copy the app key (client ID).

## Register redirect URIs

Register the exact redirect URI for each runtime:

- Native Android: `samtravels://oauth` (registered in `AndroidManifest.xml`).
- PWA: the exact origin and pathname shown in the Backup panel's **Registered redirect URI** field (for example, `https://your-domain.example/`). The deployed origin must use HTTPS.

The redirect URI must match exactly between Dropbox App Console and the Backup panel. For local development, register the exact local origin/path used by the browser.

## Connect in Sam Travels

1. Open the app's **Protect this workspace** panel.
2. Ensure the app-level **Internet Access** control is enabled and the device is online.
3. Enter the Dropbox app key and registered redirect URI.
4. On PWA, create/unlock the browser credential vault with a strong passphrase. Android stores OAuth tokens in Android Keystore-backed secure storage and does not need a browser-vault passphrase.
5. Select **Connect Dropbox**, approve the requested file scopes, and finish the callback in the app.
6. Create an encrypted backup. Save the displayed recovery key outside the device/app. It cannot be recovered from Dropbox if lost.
7. Verify backup history lists the uploaded `.stbackup` package. Test restore only against data you are prepared to replace; restore requires a separate passphrase/recovery key and explicit confirmation.

## Scheduling and acceptance

- Android's daily Dropbox backup is implemented with unique periodic WorkManager work, a connected-network constraint, bounded retries, and persisted attempt/success status. It is best-effort: Android may defer it because of Doze, battery restrictions, or device policy. The first successful interactive backup must save the recovery key in Android's protected vault before unattended backups can run.
- The PWA does not promise a closed-browser daily job. It performs backup work while open; browser background scheduling is not reliable.
- The app-level Internet Access policy must be enabled. Disabling it prevents Dropbox requests and defers scheduled work without deleting local records, history, or credentials.
- The repository CI uses mocked Dropbox endpoints. A green CI run does not prove the user's Dropbox app registration, OAuth redirect, account permissions, or real upload/download/revocation.
- Physical Android callback, Keystore, process interruption, offline deferral, reboot/Doze behavior, and recovery must be verified on a real device before Phase 6 is accepted.
