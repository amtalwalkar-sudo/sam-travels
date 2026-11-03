# Phase 6 — manual setup and acceptance guide

This guide is for the owner of the Sam Travels Dropbox app and the person validating the installed Android app. Do not put Dropbox secrets, OAuth tokens, backup passphrases, or recovery keys in GitHub issues, pull requests, chat, screenshots, or source files.

## Current implementation status

The PR contains the encrypted backup format, consistent browser/Room snapshots, checkpointed restore and rollback, Dropbox OAuth 2.0 Authorization Code + PKCE, token refresh, Android Keystore storage, browser encrypted credential vault, network-policy gateway, upload/download/history, retry/backoff, and retention.

The latest PR CI run on head `0ed52c16e1c0546671847f5ab3b4bc5b71fd3c88` passed both the web and Android jobs, including Android emulator instrumentation. CI uses mocked Dropbox endpoints; it does not validate a real Dropbox app or a physical phone.

**Phase 6 is not yet accepted.** Android WorkManager scheduling and the Keystore-protected recovery-key-only V2 worker are implemented, with a shared native-to-TypeScript interoperability fixture and automated retry/policy tests. These checks establish code-level compatibility and bounded retry behavior only. Real Dropbox and physical-device acceptance below are still outstanding.

## Part A — configure the Dropbox application once

1. On a computer or phone browser, sign in to the Dropbox account that should own Sam Travels backups.
2. Open the [Dropbox App Console](https://www.dropbox.com/developers/apps) and create one app.
3. Choose **Scoped access** and **App folder** access (not full Dropbox access). This limits the app to its own backup folder.
4. Enable only these scopes:
   - `files.metadata.read`
   - `files.content.read`
   - `files.content.write`
5. Use OAuth 2 Authorization Code with PKCE. Enable offline/refresh-token access when the console offers that setting. Do not enable the legacy implicit grant.
6. Copy the **App key**. The app key is an identifier, not the app secret. Sam Travels uses PKCE and must not need the app secret in the client.
7. Do not generate or paste a long-lived access token. The app performs the user authorization flow itself.

## Part B — connect the Android app

1. Install and open the latest Sam Travels Android build.
2. In the workspace, find **Protect this workspace**.
3. Turn **Internet Access** on. This is a user-controlled master switch and defaults off.
4. Enter the Dropbox **App key**.
5. Keep the native redirect URI exactly as displayed: `samtravels://oauth`. The Android build registers this scheme/host. Use the exact value shown in the app; do not add a trailing slash or change capitalization.
6. Press **Connect Dropbox**. Sam Travels should open Dropbox authorization in the system browser.
7. Sign in to the intended Dropbox account and approve the requested app-folder file permissions.
8. Return to Sam Travels. If the Android callback was received, the app should report that an authorization code was returned.
9. Finish the connection in the app. Do not share the authorization URL, callback URL, authorization code, or tokens.
10. If Dropbox reports an invalid redirect URI, stop and capture only the non-secret error text. Do not switch to an insecure token flow. We will correct the registered URI/redirect handling before proceeding.

## Part C — create and verify the first encrypted backup

1. In **Protect this workspace**, create/unlock the browser vault only if using the PWA. Android uses Android Keystore-backed storage and should not ask for a browser-vault passphrase.
2. Enter a strong **backup passphrase** when creating the first backup.
3. Leave the recovery-key field empty for the first backup so the app generates a new recovery key.
4. Create the backup and wait for the success message.
5. Copy the generated recovery key exactly and save it in a password manager or another secure place outside this phone. Do not save it only in Sam Travels or Dropbox. The app cannot recover a lost recovery key.
6. Refresh backup history. Confirm a new `.stbackup` item appears in the app-folder backup list.
7. Confirm that the Dropbox app has created its Sam Travels app folder and that the uploaded object is present. Do not share a screenshot if it exposes account identifiers or private files.

## Part D — verify refresh, offline behavior, and retention

1. Close and reopen Sam Travels. Confirm Dropbox still shows as connected on Android.
2. With Internet Access enabled, refresh backup history. This should refresh an expired short-lived access token using the stored refresh token.
3. Turn Internet Access off. Try refreshing history. The request should be blocked locally and no Dropbox request should be made.
4. While offline, confirm local disconnect is still available. Reconnect only when ready to test again.
5. Create at least three test backups. Set retention to keep one backup and protect a different selected backup. Apply retention.
6. Confirm the newest backup and the explicitly protected backup remain. Confirm only the expected older unprotected item was deleted.
7. Turn Internet Access off again after testing if you do not want online operations enabled.

## Part E — restore safety test (use disposable test data only)

**Restore replaces the current workspace. Do not do this against business data you need to keep.**

1. Use a test workspace with disposable records, or first export and independently preserve anything important.
2. Create an encrypted backup and note its recovery key/passphrase.
3. Add a harmless test record after the backup so the current workspace differs from the backup.
4. Select the backup, choose the correct recovery secret type, enter the passphrase or recovery key, and tick the explicit replacement confirmation.
5. Restore. The app must create a local recovery checkpoint before replacing records.
6. Verify that the restored workspace matches the selected backup and that the local checkpoint remains listed as unverified.
7. If the restored workspace is wrong, use **Roll back** on that checkpoint and confirm the pre-restore test record returns.
8. Only after inspecting and accepting the restored workspace should you choose **Verify and discard checkpoint**.
9. Repeat once with an incorrect passphrase/recovery key. It must fail before replacing the current workspace and must leave the current data intact.

## Part F — physical Android resilience checks

Perform these only after Parts A–E work. Keep the phone charged and do not use important data for destructive restore tests.

1. Connect Dropbox, create a backup, then force-stop and reopen Sam Travels. Confirm the secure credential remains readable and history can refresh.
2. Begin Dropbox authorization, complete it in the external browser, and return to Sam Travels while the app is already running. Confirm the warm-start callback is consumed.
3. Repeat authorization after force-stopping Sam Travels before returning from the browser. Confirm the cold-start callback is consumed.
4. Turn Internet Access off, disconnect Wi-Fi/mobile data, reopen the app, and confirm local driver records and recovery controls remain usable. Re-enable Internet Access and reconnect only when ready.
5. Start a test restore, then exercise the checkpoint/rollback controls. Do not kill the app during a destructive restore against real data.
6. Reboot the phone and confirm the unique daily WorkManager job remains scheduled. With Internet Access disabled, confirm the worker defers without a Dropbox request; enable it only when ready to test.
7. Exercise offline deferral, then restore connectivity and confirm WorkManager retries. Toggle the Android lock screen during a scheduled run and confirm Keystore-protected key access behaves safely (defer/retry rather than upload an unencrypted package).
8. Enable battery optimization/Doze and observe that execution may be delayed; record actual execution time rather than assuming an exact 24-hour run.
6. Record Android version, device model, app build/version, the exact step, and the non-secret error text for any failure. Never include access tokens, refresh tokens, passphrases, recovery keys, authorization codes, or full callback URLs.

## Part G — daily backup scheduling gate

Android WorkManager scheduling is implemented in this PR but is not yet accepted on a physical device. Do not treat CI compilation as proof of daily execution. The PWA remains best-effort-on-next-open only. The native worker uses a stable, user-saved recovery key protected at rest by Android Keystore; it does not require or persist a passphrase.

Before accepting unattended jobs, verify:
- A durable unique schedule and bounded retry state that survives process death/reboot (automated scheduling semantics are implemented; reboot acceptance still requires a physical device).
- A background-safe encryption key strategy for Android using Keystore, without persisting the user's passphrase.
- A PWA strategy that works only where the browser supports the required background execution and can safely access the encryption material without persisting a plaintext passphrase.
- NetworkGateway enforcement, bounded retries, idempotent backup naming/upload, and user-visible last-success/last-failure state.
- Tests for app termination, reboot, locked-device/Keystore availability, revoked Dropbox authorization, offline periods, retry exhaustion, and duplicate job execution. The shared fixture verifies native V2 output with the TypeScript restore parser; worker resilience tests cover interrupted-I/O retry decisions and re-checking Internet Access after policy revocation.

This gate requires CI plus physical-device acceptance. The implementation is present, but Phase 6 remains open until these checks are recorded.

## What to send back after each manual step

Tell me only the step number and result, for example: `Part A, step 6 — app created; App key copied.` If an error occurs, send the exact non-secret error text. I will guide the next step based on the result.
