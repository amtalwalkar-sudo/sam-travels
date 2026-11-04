# Reliability Audit: Offline, Platform Coordination, and Backup/Restore

Audit target: PR #6 head before this audit's implementation commits.
Scope: Android native/Capacitor, browser-only PWA, native floating overlay, Room/IndexedDB persistence, and encrypted backup/restore.

## Executive result

The current architecture has durable local-first workflows and useful recovery paths. This audit found that the core single-driver event flow is protected against competing PWA/native-overlay transitions, but background guarantees differ by platform. It also found that backup participant coverage was implicit: the Android store currently has one Room entity and the PWA has five business tables, but a future table could have been silently omitted by the explicit snapshot lists.

This audit adds fail-closed schema/table coverage checks, stricter browser snapshot validation, order-independent restore verification, interrupted-restore tests, and a Dropbox token-refresh verification fix. It does not claim that a browser PWA can capture reliably with the screen off, nor that Android OEM power policies have been physically accepted.

## 1. Offline and background behavior

### Installed Android / Capacitor

- Android uses Room as the authoritative business store. Capacitor selects `NativeDriverWorkflowRepository` and `NativeEventLocationProvider`; it does not select the Dexie browser workflow on the installed app.
- The Capacitor location plugin requests one event-scoped fix with a bounded timeout and a temporary partial wake lock. The intent is already persisted in Room before this request starts.
- The floating overlay is a native foreground service with location foreground-service type, a persistent notification, a bounded GPS wake lock, and a single-update location request. Its service is sticky and attempts to recover a still-valid pending intent after service recreation.
- If Android kills the process or the request times out, the pending intent remains in Room. Recovery retries only while the original event-time GPS evidence window remains valid; expired evidence is retained for review and must not be silently backdated.
- **Limitation:** a Capacitor GPS request made without the floating foreground service is a short-lived request, not a guarantee of continued screen-off capture. Even the foreground overlay remains subject to permission state, location-provider availability, Doze/battery policy, force-stop, and manufacturer-specific process management. A physical-device screen-off / process-death / reboot matrix is still required.

### Browser-only PWA

- The browser PWA uses IndexedDB as its authoritative local business store. It queues the pending intent before requesting browser geolocation.
- Browser geolocation is a one-shot `getCurrentPosition` request with a 35-second timeout. The pending intent remains in IndexedDB if the page closes, the browser suspends it, permission is denied, or the request times out.
- On reopening, the app reconciles persisted pending intents and may retry while the original event-time evidence window remains valid.
- **Limitation:** a normal PWA has no dependable always-running background location service. A service worker may be suspended and cannot be treated as a continuous screen-off GPS runtime. Keep the PWA open and visible during GPS capture; screen-off capture is not guaranteed. This is a platform limitation, not something a shared TypeScript contract can remove.

### Offline conclusion

Local business writes do not require Dropbox or an Internet connection. Dropbox is a backup destination, not the primary database. Android and PWA preserve pending event intent locally, but only Android has the native foreground-service path for screen-off work.

## 2. Native overlay / Capacitor / PWA coordination

- On Android, both the Capacitor plugin and the native overlay open the same Room database and call the same `DriverWorkflowStore` transactional boundary.
- The Android WebView uses the native repository and native event-location provider. Browser-only PWA uses Dexie and browser geolocation. These are separate runtime authorities; the app does not dual-write the same Android business event to Room and IndexedDB.
- Queueing validates command identity, origin surface, expected revision, expected prior state, and event type inside a Room transaction.
- The store rejects another pending command for the same state revision. Completion atomically writes the immutable event, next state projection, terminal intent status, and outbox row. Replaying a recorded completion cannot create a second event or outbox item.
- The browser repository applies equivalent revision checks and performs event/state/intent/outbox writes in one IndexedDB transaction.
- Android instrumentation coverage races PWA-origin and overlay-origin commands against the same Room revision and asserts that exactly one is accepted. Browser tests race equivalent IndexedDB writes. Android and browser tests also cover duplicate identity, stale commands, pending-intent recovery, and replay after commit.
- The WebView polls the native snapshot and pending intents; the overlay observes Room invalidations. The surfaces can temporarily display stale projections during propagation, but the database transaction—not UI state—is the authority that prevents conflicting commits.

## 3. Backup and restore

### Snapshot completeness

- Android Room currently has one entity/table: `records`. Feature-owned business data, workflow state, events, intents, and outbox records are stored as records. Native snapshots include every record except the two reserved internal recovery namespaces (checkpoint and journal).
- Both manual Room export and the headless Dropbox worker now call the same Room schema coverage guard. If a future Room entity is added without extending backup coverage, backup creation fails closed.
- Browser IndexedDB currently has five business tables: `records`, `driverState`, `driverIntents`, `driverEvents`, and `driverOutbox`. Snapshots include all five in one Dexie read transaction.
- Browser recovery checkpoints and the local credential vault (`backupCheckpoints`, `credentialVault`, `credentialVaultMeta`) are intentionally excluded from business backups. The new coverage guard requires every Dexie table to be either a registered business participant or an explicit internal exclusion. A newly added unclassified table blocks export and restore.
- Browser restore validates each participant's primary key and duplicate IDs before creating a checkpoint. Post-restore and rollback verification compare canonicalized rows, so harmless serialization order changes no longer cause false restore failures.
- No separate binary attachment table exists in the current Room or Dexie schema. Any future attachment store must be added to the snapshot participant contract before it can be used for persistent business data.

### Encryption compatibility

- User-created backups use the TypeScript AES-256-GCM package format with Argon2id passphrase key wrapping and a recovery-key envelope.
- Headless Android daily backup uses the native V2 recovery-key-only format because WebView JavaScript is unavailable in WorkManager.
- The shared Android-generated V2 fixture is decrypted by the TypeScript restore path in CI. TypeScript crypto tests cover package parsing, integrity checks, and passphrase/recovery-key paths.
- The Dropbox worker uses a deterministic content-derived filename and add/no-autorename upload semantics, then verifies remote metadata size. The metadata verification request now uses the active token after any refresh, rather than a stale pre-refresh token.

### Restore and interruption safety

- Decryption and authenticated integrity verification happen before the authoritative store is asked to replace data.
- Android validates the snapshot, writes a pre-restore Room checkpoint and journal, replaces business records in one Room transaction, and verifies the resulting records. A failed restore attempts a transactional rollback. If the process is interrupted, Room transaction atomicity leaves either the pre-restore or committed restored state; the retained journal/checkpoint makes the state reviewable or rollback-eligible.
- Browser restore writes its checkpoint before replacement, replaces all registered business tables and updates the journal in one IndexedDB transaction, verifies the result, and rolls back from the retained checkpoint on a detected failure. An interrupted transaction is atomic; the checkpoint remains available.
- A restore checkpoint is retained until the user verifies the restored workspace. It must not be silently discarded during restore.

## 4. CI gates

The pull-request workflow runs:
- `npm run check:architecture` for source boundaries and mandatory architecture contract checks.
- `npm test` for browser workflow, backup completeness, encryption interoperability, restore recovery, and application tests.
- `npm run build` for TypeScript and production web compilation.
- Android Gradle unit tests and `connectedDebugAndroidTest` on an emulator, including Room, workflow coordination, restore recovery, and the Room backup coverage gate.

The new browser coverage and restore tests run under the existing web test job. The Android Room coverage test runs under the existing emulator instrumentation job. These are PR-triggered workflow checks. GitHub rulesets returned no configured rulesets; the branch-protection endpoint was not readable by the connected GitHub integration, so required-check enforcement at the repository settings level remains unverified and must not be claimed.

## 5. Remaining acceptance gates

1. Physical Android device: screen-off event capture with overlay enabled and disabled, permission changes, Doze/battery optimization, app process kill, force-stop, reboot, and recovery.
2. Physical Android device: verify the foreground notification and overlay service remain correctly visible/usable under the target Android version and OEM.
3. Live Dropbox account: OAuth refresh, upload interruption, duplicate retry, metadata verification, retention, and restore.
4. Browser matrix: supported browsers, page suspension, close/reopen, offline write, permission denial, and GPS timeout. Do not interpret these as a promise of screen-off PWA GPS.
5. Repository administration: confirm and configure required status checks in branch protection after check names stabilize.

## 6. Explicit non-claims

- This audit does not claim screen-off PWA GPS capture.
- This audit does not claim Android background behavior is immune to OS/OEM restrictions.
- This audit does not claim live Dropbox/OAuth or physical-device acceptance has passed.
- The universal runtime Feature Registry for feature schemas, dependencies, migrations, and lifecycle is still an architectural requirement; the table-coverage guards here specifically close the current backup omission path for the actual Room and Dexie schemas.
