# Phase 6 — Background Backup Design

Status: Android WorkManager implementation and automated resilience gates are green in CI; real-account and physical-device acceptance remain outstanding by user deferral.

## Goals

- Produce best-effort daily encrypted Dropbox backups without requiring the UI to remain open.
- Recover safely after Android process death, reboot, temporary offline periods, or expired access tokens.
- Preserve the existing `backup-encryption-v1` recovery model: each package remains recoverable with the user's backup passphrase or independently saved recovery key.
- Never persist a plaintext passphrase, access token, refresh token, or unwrapped data-encryption key in ordinary preferences, business records, logs, or WorkManager input data.

## Android design

1. Use WorkManager unique periodic work with a 24-hour interval and network-connected constraint. Android execution is inexact and may be delayed by Doze, battery policy, OEM restrictions, or connectivity.
2. Persist only non-secret scheduling configuration and status (enabled/disabled, last attempt, last success, next eligible run, failure category) in native app storage. WorkManager input contains identifiers/versions only, never credentials or key material.
3. Use a dedicated Android Keystore AES-GCM key alias for backup-secret protection. It must be separate from the existing Dropbox credential-vault key alias and must not be exported.
4. At explicit backup setup, the user supplies a recovery key (or establishes one during the first backup). Show it for the user to save externally. A device-protected copy may be retained only as a credential-vault item encrypted by the dedicated Keystore key, so the background worker can create a recovery envelope without asking for a UI-only passphrase. The externally saved recovery key remains the portable recovery path on a replacement device.
5. The background worker creates a fresh random 256-bit DEK per backup and a fresh AES-GCM nonce per encryption. It wraps the DEK using the retained recovery key.
6. **Implemented in code:** `backup-encryption-v1` remains unchanged and continues to require both passphrase and recovery envelopes. The explicitly selected `backup-encryption-v2` format supports a recovery-key-only envelope. Creation requires `mode: "recovery-key-only"` and an existing user recovery key; it never silently generates a key the user has not saved. V2 packages are authenticated with the versioned manifest as AES-GCM additional data, parse/serialize through the normal package APIs, and restore only with the recovery key. Passphrase restore fails clearly with `backup_passphrase_not_available`. V1 package parsing and both legacy restore paths remain supported. Argon2id parameters and v1 output are unchanged.
7. **Implemented:** `DailyDropboxBackupWorker` reads OAuth tokens through the same Keystore-backed credential vault used by the foreground plugin, refreshes expired access tokens using the stored refresh token and app key, and checks the Room-backed Internet Access policy before each HTTP request. Missing configuration, credentials, recovery key, or disabled policy defers the run. No token, passphrase, recovery key, or DEK is passed in WorkManager input.
8. **Implemented:** the worker derives a collision-safe upload path from the snapshot revision and plaintext digest, uses Dropbox add/no-autorename semantics, and verifies the remote object metadata and byte size before marking success. Existing backups are not overwritten.
9. Apply retention only after a new backup has been verified remotely. Protect the newest known-good backup and any user-protected backup.
10. **Implemented baseline:** WorkManager uses persisted unique periodic 24-hour work plus unique immediate work, connected-network constraints, exponential backoff, a bounded retry count, and native status timestamps/categories. Policy-disabled, missing-key, and missing-auth states defer without uploading. Broader interrupted-run reconciliation, forced refresh after server-side token revocation, retention, and failure-injection coverage remain.

## PWA behavior

- Do not promise reliable daily execution while the browser/PWA is closed. Browser Background Sync/Periodic Background Sync support is inconsistent and browser-controlled.
- Use supported background APIs only when feature-detected and permitted; otherwise mark the schedule as best-effort-on-next-open and run a due backup after the PWA opens and policy/authentication are valid.
- Never persist the browser vault passphrase or an unwrapped DEK to simulate unattended execution. The user must unlock the browser vault before PWA backup work that needs it.

## Verification gates

- CI run [#301](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/41833914640) on head `b2d14e9bf7448ec91c4861f05420518accc87175` is green for web tests/build, Android debug/unit/instrumentation tasks, and unsigned release assembly.
- Automated tests cover encrypted V1/V2 package paths, recovery-key restoration and cross-runtime native V2 fixture decryption, OAuth policy/state/token-refresh behavior, retry and retention decisions, interrupted-run reconciliation decisions, Room transactional rollback under injected replacement failure, and recovery-key vault persistence across vault recreation.
- The Android worker uses bounded WorkManager retries, status reconciliation for stale `running` attempts, policy checks before requests, and Keystore-backed recovery material. CI validates compilation and automated test scenarios, but it is not proof of scheduling execution through real process death, reboot, Doze, or locked-device states.
- Remaining manual acceptance: real Dropbox OAuth/upload/download/revocation and physical-device Doze/reboot/locked-device checks, plus owner walkthrough of restore/rollback with disposable data. These remain deferred; CI cannot prove external/device behavior.
