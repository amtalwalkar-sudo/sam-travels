# Phase 6 — Background Backup Design

Status: design decision for implementation; not an acceptance claim.

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
5. The background worker creates a fresh random 256-bit DEK per backup and a fresh AES-GCM nonce per encryption. It wraps the DEK using the retained recovery key and creates the normal `backup-encryption-v1` recovery envelope. A passphrase envelope may be omitted only through an explicitly versioned package-format extension; never create a package that falsely claims a passphrase envelope exists.
6. The existing package format currently requires both passphrase and recovery envelopes. Therefore, before enabling unattended backup, implement and test a backward-compatible, explicitly versioned envelope representation that supports a recovery-key-only unattended package while preserving restore via the recovery key. Do not weaken Argon2id or invent/store a user passphrase.
7. The worker reads Dropbox credentials only through the native Keystore-backed credential vault, refreshes OAuth credentials through the approved PKCE token lifecycle, and checks the persisted Internet Access policy immediately before every network operation. If policy is disabled, credentials are unavailable, the device is locked and key use is disallowed, or connectivity is absent, defer safely.
8. Use an idempotent upload identity derived from the backup snapshot revision and creation identifier. Upload to a temporary/collision-safe path, verify the remote result, then mark the run successful. Never overwrite the only known-good backup.
9. Apply retention only after a new backup has been verified remotely. Protect the newest known-good backup and any user-protected backup.
10. Record bounded exponential retry/backoff and distinguish transient failures from authorization, policy-disabled, key-unavailable, and permanent validation failures. A later eligible run must reconcile interrupted/in-progress records.

## PWA behavior

- Do not promise reliable daily execution while the browser/PWA is closed. Browser Background Sync/Periodic Background Sync support is inconsistent and browser-controlled.
- Use supported background APIs only when feature-detected and permitted; otherwise mark the schedule as best-effort-on-next-open and run a due backup after the PWA opens and policy/authentication are valid.
- Never persist the browser vault passphrase or an unwrapped DEK to simulate unattended execution. The user must unlock the browser vault before PWA backup work that needs it.

## Verification gates

- Unit tests: envelope version compatibility, recovery-only package creation/decryption, nonce uniqueness, integrity failure, wrong recovery key, and malformed package rejection.
- Android instrumentation: Keystore alias isolation, encrypted secret persistence across process recreation, worker scheduling persistence across reboot simulation where feasible, unique-work idempotency, offline/policy-disabled deferral, token refresh, upload retry, and interrupted-run reconciliation.
- Room instrumentation: consistent snapshot, restore checkpoint creation, interruption at each restore stage, rollback integrity, and verified-checkpoint discard.
- CI must build the PWA and Android app, run all unit tests, and execute Android emulator instrumentation.
- Real Dropbox OAuth/upload/download and physical-device Doze/reboot/locked-device checks remain manual acceptance gates. CI cannot prove these external/device behaviors.
