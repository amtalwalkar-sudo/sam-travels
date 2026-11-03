# Dropbox Backup and Recovery Contract

Dropbox automatic daily backup is a core product requirement.

## Connection and security

- Use Dropbox OAuth; never ask for or store a Dropbox account password.
- Request the narrowest practical scopes.
- Store refresh/access credentials in Android secure storage for native builds and an appropriate protected mechanism for supported web contexts.
- Never commit credentials, tokens, client secrets, or exported private records.

## Scheduled backup

- Schedule a daily backup using WorkManager on Android and an appropriate best-effort scheduler in supported PWA contexts.
- Android scheduling is inexact: Doze, battery restrictions, network availability, and OS policy can delay execution. Do not promise an exact clock time.
- Backup should run when the app is closed where Android permits, using compliant background work.
- Retry transient failures with backoff and resume when connectivity and authentication are available.
- If a scheduled backup is missed, run it at the next eligible opportunity and report the actual completion time.
- Backup must be generated from a consistent versioned snapshot, not a live partially changing set of tables.

## Backup package

Include a manifest with application version, data schema version, creation time, business identity metadata needed for restore, record counts, and checksums. Include required business data and attachment references/files. Exclude credentials and ephemeral caches.

Use versioned, collision-safe filenames and retain a configurable history. Never overwrite the only known-good backup.

## Status and history

Show connection state, last successful backup time, latest attempt/result, next eligible scheduled window when known, and concise failure/retry status. Keep a backup history so the user can distinguish scheduled, manual, failed, and retried runs.

## Restore safety

1. Validate package format, schema compatibility, and checksums.
2. Create an internal recovery checkpoint of current local data.
3. Show the restore source and scope and require explicit confirmation.
4. Restore transactionally where possible; otherwise use a staged replace with a recoverable journal.
5. Verify record counts/checksums and run reconciliation.
6. Preserve the pre-restore checkpoint until the user has verified the restored state.

A failed or interrupted restore must leave either the previous data or a recoverable checkpoint. Never silently reset business data.


## Internet access policy

- Dropbox backup and restore are permitted only when the user's app-level Internet Access toggle is enabled and Dropbox OAuth is connected.
- The header Internet icon is the visible control for this policy. It is shared by PWA and native surfaces and persists across restart/reboot.
- Enabling internet access allows scheduled daily Dropbox backup to run when connectivity and Android/PWA scheduling conditions permit. If disabled/offline, defer safely and retry at the next eligible opportunity.
- Enabling internet access does not authorize an automatic restore. Restore remains explicitly user-initiated, reviewed, and confirmed, with the existing recovery checkpoint safeguards.
- Disabling internet access prevents new Dropbox requests and defers queued backup work without deleting local records, backup history, or credentials.
- Dropbox operations must use the common network policy gateway; do not let the Dropbox SDK bypass the user's setting.

## Reset

Data reset is a separate, clearly labeled destructive workflow. Require confirmation, create/retain recovery safeguards, clear business data, and reset application preferences to defaults as specified by product decisions. Never conflate reset with restore.

## Snapshot consistency and package hardening

- Create a consistent snapshot from the authoritative database at a defined revision/transaction boundary. Do not copy tables independently while writes are in progress and call the result consistent.
- Record the snapshot revision/watermark, app version, schema version, creation instant, business timezone/context, record counts, attachment inventory, and per-file/package checksums in the manifest.
- Use a staged package build: snapshot, serialize, checksum, validate locally, then upload. A failed upload must not mark the backup successful.
- The approved design is **`backup-encryption-v1`**. Encrypt backup payloads client-side with **AES-256-GCM** before any remote upload. Generate a cryptographically random 256-bit data-encryption key (DEK) per backup; use a fresh 96-bit nonce for each AES-GCM encryption and authenticate the versioned manifest as additional authenticated data.
- Wrap the per-backup DEK for two independent recovery methods: (1) a user-created backup passphrase processed with **Argon2id** using a unique random salt and versioned parameters; and (2) a separately generated cryptographically random **256-bit recovery key**. The recovery key is displayed once at setup/rotation and the user must save it outside the app. Neither secret nor an unwrapped DEK is uploaded or stored in ordinary business records/logs.
- The backup package carries only the wrapped DEK material, salts/nonces, KDF/cipher identifiers and parameters, and authenticated manifest needed to recover it. Dropbox receives ciphertext and non-secret recovery metadata only.
- Either the passphrase or recovery key can recover the DEK. If both are lost, the backup is unrecoverable; clearly warn the user before enabling encrypted backup. Do not make a device-bound Android Keystore key the sole recovery path.
- Version cipher/KDF parameters and support migration. Validate authentication tags before accepting any decrypted content. Do not claim encryption is implemented until cryptographic implementation and recovery tests pass.
- Validate remote download size, manifest, checksums, supported schema, and attachment completeness before restore staging.
- Retention must never delete the only known-good backup or the current recovery checkpoint. Retention policy and minimum protected versions must be explicit.
- Backup scheduling is best effort and depends on the app-level Internet Access policy, OAuth, connectivity, and OS scheduler. A missed schedule is reported and retried at the next eligible opportunity, not promised at an exact time.
