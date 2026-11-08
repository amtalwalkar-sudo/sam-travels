# Driver Location Reliability and Timeline Enrichment Implementation

Status: implementation plan for one integrated pull request.

## Scope and authority

This change improves event-scoped GPS acquisition, driver interaction responsiveness, and optional Timeline reverse-geocoding recovery. It does not introduce continuous location tracking, a second driver workflow, a second persistence authority, or a network dependency for recording trips.

The owning authorities remain:
- `docs/LOCATION_AND_STATE_TIMING_CONTRACT.md` for event GPS evidence and timestamp integrity.
- `docs/NETWORK_ACCESS_CONTRACT.md` for explicit user network policy and the shared network gateway.
- `docs/ARCHITECTURE_FOUNDATION_CONTRACT.md`, `docs/FEATURE_EXTENSION_ARCHITECTURE.md`, and `docs/FEATURE_EXTENSION_LIFECYCLE_CONTRACT.md` for ownership, persistence, migration, backup, recovery, and extension compatibility.
- The existing Driver Workflow and Timeline feature contracts for their respective business records and projections.

This plan is additive. It does not weaken or silently replace an existing contract.

## Seven implementation workstreams

### 1. Bounded repeated GPS acquisition
Replace one-shot location requests with event-scoped sampling. Continue receiving fixes only for the active transition and stop immediately when the first fix satisfies the existing versioned reliability policy, the user cancels where supported, permissions/services become unavailable, or the original evidence deadline expires. No location subscription remains after the event is resolved.

### 2. Evaluate fixes, do not accept the first callback blindly
Validate each candidate fix independently: coordinate range, finite values, horizontal accuracy, fix timestamp, provider, and permission/service state. Keep the best candidate only as transient acquisition state. Never substitute a cached/last-known fix or attach a fix to another event. Persist the actual accepted fix and its actual timestamp.

### 3. Align acquisition and recovery with the approved evidence window
The existing `gps-event-fix-v1` contract is strict: accuracy must be 50 metres or better and the fix must be no more than 30 seconds old relative to the original transition timestamp. Keep that rule unchanged in this PR. The acquisition deadline must not exceed that evidence window. A timeout must leave the original intent durable and visibly recoverable; it must not be converted into a successful event or silently given a later timestamp. After the original evidence window expires, a later fix cannot prove the original event-time location. Any later resolution must use the existing explicit degraded-evidence/manual-review path, with truthful status and original transition timestamp preserved.

### 4. Responsive driver interaction and durable intent
A swipe receives immediate visual acknowledgement. Persist its stable intent promptly through the authoritative repository, then acquire GPS asynchronously. Keep the screen, navigation, animations, clock, and unrelated presentation responsive. Prevent conflicting state transitions while one transition is unresolved, but do not block unrelated UI work. A transition is not shown as completed until valid GPS evidence and the authoritative local transaction commit. Retries remain idempotent.

### 5. Durable offline Timeline enrichment
Treat reverse geocoding as optional derived enrichment, never as trip evidence or a prerequisite for committing a driver event. Persist an idempotent pending enrichment task keyed to the immutable event identity and coordinates. Store the provider result/status separately from the original event. Success, not-found, disabled-network, and retryable failure states must be distinguishable. Repeated processing must not duplicate work or alter the source event.

### 6. Platform connectivity scheduling and responsibility boundaries
All requests continue through the existing shared network policy gateway. A disabled user network policy must prevent dispatch even when the device is online.

- Android: use OS connectivity/network constraints and durable unique scheduled work (WorkManager) to drain pending enrichment when a validated network becomes available. A connectivity callback may expedite scheduling, but it must not create a polling loop or a permanent service. Use bounded batches and backoff for transient failures.
- PWA: use browser online/resume/visibility signals to trigger a drain while the app is active. The durable queue remains in IndexedDB. A closed/suspended browser cannot promise background execution; process pending work on the next open/resume.
- A connectivity event means a network is available, not that the public internet or Geoapify is reachable. A failed proxy request remains pending and is retried later with backoff.
- Deduplicate by event/enrichment identity and avoid repeated lookups for already resolved coordinates. Do not hold a GPS wake lock or keep location active for network enrichment.

Keep event GPS acquisition, authoritative event persistence, optional Timeline enrichment, and any future integration delivery as separate responsibilities with explicit contracts and ownership.

### 7. Regression and lifecycle verification
Add focused tests for:
- no fix initially, then a valid fix before the deadline;
- inaccurate fixes followed by an acceptable fix;
- no acceptable fix before the deadline and durable pending recovery;
- strict rejection of fixes outside the existing 30-second/50-metre policy;
- preservation of original transition time and actual fix time;
- process interruption/restart and idempotent recovery;
- rapid gestures and no duplicate or cross-attached events;
- UI responsiveness while acquisition is pending;
- offline event recording with no network;
- pending enrichment surviving restart, network-offline periods, and proxy failures;
- connectivity return causing one bounded drain, not polling;
- network policy disabled preventing all enrichment dispatch;
- successful enrichment stored separately while the source GPS event remains byte-for-byte/semantically unchanged;
- duplicate notifications/work scheduling not duplicating lookups;
- Android Room and browser IndexedDB persistence/recovery paths;
- backup/restore participation or a documented derivation/rebuild strategy for any new persistent state;
- full architecture, web, Android, and integrated regression gates.

## Battery and network behavior

There is no periodic internet polling and no continuous GPS tracking. The app reacts to operating-system/browser connectivity and lifecycle events, schedules a single unique drain, and uses bounded retry/backoff only after a real request failure. Work is skipped while the user's network policy is disabled. Enrichment is small, event-driven, and does not hold a wake lock.

## Acceptance and release claims

A green CI run is necessary but does not prove every physical-device behavior. Report automated CI separately from physical Android verification, especially offline GPS acquisition, background scheduling, process death, battery restrictions, and a live Geoapify proxy request.
