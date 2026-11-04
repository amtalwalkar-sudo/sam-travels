# PWA Lifecycle Contract

## Purpose and authority

This contract defines delivery, offline-shell, service-worker, browser-storage, and update lifecycle behavior for the browser-only PWA. It supplements rather than replaces:

- [Local Persistence Ownership](LOCAL_PERSISTENCE_CONTRACT.md) for IndexedDB authority and migrations.
- [Data and Persistence](../DATA_CONTRACT.md) for record and durability semantics.
- [Transaction and Recovery](TRANSACTION_AND_RECOVERY_CONTRACT.md) for pending work and restart recovery.
- [Network Access](NETWORK_ACCESS_CONTRACT.md) for the user-controlled network gateway.

If a concern is already governed by one of those contracts, that contract remains normative; this document defines only the PWA delivery/lifecycle boundary.

## Runtime scope

- Browser-only PWA uses IndexedDB as its sole authoritative local business store.
- The installed Capacitor Android application uses Room as its sole authoritative local business store. The Android WebView must not use the browser PWA's IndexedDB adapter as a fallback for business records.
- The same platform-neutral domain/application contracts are used in both runtimes. Browser-only support does not imply that every Android OS capability can be reproduced in a browser.
- PWA installation, standalone display mode, and service-worker availability are presentation/delivery capabilities, not separate business runtimes or databases.

## Application shell and asset caching

- Cache only versioned application-shell assets and explicitly approved static resources needed to launch the PWA offline.
- Keep the shell, icons, fonts, and other required assets local or cacheable; remote assets must not be a startup dependency.
- Do not cache authenticated responses, business API responses, mutable business records, OAuth material, or native bridge responses as a substitute for their authoritative repository.
- Do not use a service-worker cache as a business-data store, transaction journal, or synchronization queue.
- Cache entries must be namespaced by release/build identity and cleaned up only after the replacement shell is verified available.
- A cache miss or corrupted cache must fail safely to a recoverable reload/update path; it must not clear IndexedDB or business records.

## Service-worker responsibilities and boundaries

The service worker may manage application-shell asset caching and update lifecycle only. It must not:
- Own business rules, domain transitions, timers, or financial calculations.
- Write directly to IndexedDB business tables or Room.
- create or replay driver transition commands independently of the application coordinator.
- Bypass the user-controlled network policy for optional requests.
- Claim background execution guarantees that browsers do not provide.

Any future service-worker background capability requires a separately reviewed contract and must preserve the same authority, idempotency, privacy, and offline rules.

## Updates and active work

- Detect and stage a new application version without silently replacing the currently running shell during an active user workflow.
- Apply an update at a safe boundary, normally after explicit user action or a confirmed safe reload opportunity.
- Before activation/reload, preserve all accepted work in the authoritative store. UI memory and unsaved form state must not be treated as durable.
- If an update is deferred, the current compatible shell remains usable; communicate that an update is available without blocking core work.
- A new shell must verify its compatibility with the persisted data schema and, in Android, the installed native bridge before enabling operational workflows.
- If compatibility cannot be established, fail closed into a clear upgrade/recovery screen. Do not run incompatible code against a database or bridge.
- Never delete old cached assets needed by an active client until the new shell is confirmed usable. Retain a bounded rollback window consistent with storage limits.

## Browser storage resilience

- Treat IndexedDB quota exhaustion, denied storage, eviction, transaction abort, and unavailable storage as explicit recoverable conditions.
- Do not report a record as saved until the IndexedDB transaction commits.
- On storage failure, preserve the user's input where safely possible, clearly distinguish unsaved from durable data, and offer a retry/recovery path. Never silently fall back to memory-only persistence.
- Do not automatically delete business records to free storage. Cache cleanup may remove only disposable, reconstructible assets.
- Use browser storage persistence requests only as a best-effort protection; do not promise that a browser or operating system will never evict data.
- The application must surface storage health and actionable failure states without exposing internal database details to ordinary users.

## Browser lifecycle

- On page load, reload, tab restore, visibility change, and return from suspension, re-read authoritative state and reconcile pending operations using the existing application recovery contract.
- Do not assume timers, JavaScript tasks, subscriptions, or in-memory services continued while the page was suspended or closed.
- Derive elapsed time from persisted instants and reconcile the current state; do not resume an incrementing in-memory counter.
- Browser notifications and service-worker messages are hints only. The authoritative repository remains the source of truth.
- If multiple tabs are supported, coordinate writes through the repository's transaction/revision boundary and reject stale commands; do not rely on a single-tab assumption unless it is explicitly enforced and tested.

## PWA acceptance checks

1. Launch the PWA offline after a successful installation/cache population and verify the application shell opens.
2. Verify core browser workflows operate offline and persist only through IndexedDB transactions.
3. Verify no service-worker cache entry becomes an authoritative business record or bypasses the network gateway.
4. Simulate quota exhaustion, transaction abort, unavailable storage, and cache corruption; verify no false saved acknowledgement or destructive cleanup.
5. Stage an update during active work; verify it does not interrupt the workflow or lose accepted work.
6. Verify an incompatible shell/schema combination is blocked with a recoverable message.
7. Close/reopen, reload, restore a suspended tab, and test multiple tabs if supported; verify state and pending work reconcile without duplication.
