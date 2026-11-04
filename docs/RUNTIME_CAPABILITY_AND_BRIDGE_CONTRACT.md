# Runtime Capability and Capacitor Bridge Contract

## Purpose and relationship to existing contracts

This contract defines how the application identifies its runtime, exposes platform capabilities, and communicates with the Capacitor/Kotlin layer. It supplements [Native Android](ANDROID_NATIVE_CONTRACT.md), [Local Persistence](LOCAL_PERSISTENCE_CONTRACT.md), [Feature Modules](FEATURE_MODULE_CONTRACT.md), and [Security and Compatibility](SECURITY_AND_COMPATIBILITY_CONTRACT.md). Those documents remain authoritative for database ownership, Android behavior, and feature boundaries.

## Runtime identification

- Determine runtime from an explicit, successful native capability handshake with the installed Capacitor application—not from user-agent strings, screen size, device brand, or a guessed platform flag.
- Distinguish at least: browser-only PWA; Capacitor Android with a compatible native bridge; Capacitor Android with a missing/incompatible bridge; and unsupported/unknown runtime.
- Browser-only PWA may select the IndexedDB repository adapter when the native runtime is genuinely absent.
- If the app is running inside the installed Android shell but the required native bridge or Room-backed repository is unavailable, enter a clear blocked/recovery state. Never silently select IndexedDB for Android business data.
- Runtime identity is an infrastructure concern. Domain rules and feature business logic must not branch on platform names or database technologies.

## Capability registry

- Expose a typed capability registry built from verified runtime/plugin availability and declared contract versions.
- A capability entry identifies its stable capability ID, version, availability, required permission/authorization state, and a typed adapter.
- Examples include authoritative repository access, event-scoped location, overlay control, secure credential storage, and optional background scheduling.
- Capability absence is explicit. Features must provide a documented unavailable/deferred state or disable the relevant action; they must not pretend a capability succeeded.
- Capability detection must not request sensitive permissions as a side effect. Permission prompts occur only at the feature's justified user-facing action and follow the native security contract.
- Do not expose an unrestricted service locator or generic native invocation API to feature modules. Only registered, narrow, typed ports may be used.
- New capabilities must declare ownership, permission requirements, offline behavior, error semantics, and acceptance tests before registration.

## Bridge contract

- All JavaScript-to-native communication uses a versioned, typed Capacitor plugin/API boundary.
- Every request has a request ID, capability/operation identifier, contract version, and validated payload. State-changing operations additionally carry the stable command/event identity and idempotency data required by the transaction contract.
- Responses use a consistent typed envelope distinguishing success, validation failure, unavailable capability, permission denial, timeout/unknown outcome, and recoverable native failure.
- Validate payload shape, lengths, numeric ranges, enum values, and supported schema versions on both sides of the bridge. Never trust WebView input merely because it is typed in TypeScript.
- Return only the minimum data needed by the caller. Do not expose database handles, SQL, arbitrary file paths, raw credentials, or unrestricted native APIs to JavaScript.
- Native callbacks/events use typed, versioned payloads. Consumers must register and unregister listeners with the WebView lifecycle and deduplicate notifications by stable event/message ID or durable revision.
- Notifications are hints, not the source of truth. After listener registration, WebView recreation, or missed delivery, query the authoritative repository revision and reconcile.
- Keep storage, GPS, and other blocking work off the Android main thread. Bridge callbacks must not make UI responsiveness depend on database, location, or network latency.

## Timeouts, cancellation, and uncertain outcomes

- A bridge timeout means the caller does not know the outcome; it does not prove that the native operation failed or was rolled back.
- For state-changing calls, retry using the same command/event ID and idempotency key. Never generate a new business command merely because a response was lost.
- After timeout or WebView recreation, query the operation status and latest durable revision before deciding whether a retry is needed.
- Cancellation is best-effort and must have explicit semantics. A caller cancelling its wait must not erase an already durable intent or imply that the underlying operation was cancelled.
- Native errors must be mapped to stable, documented error categories; do not make UI behavior depend on parsing platform exception strings.

## Compatibility handshake

- On startup, the web application requests the native bridge's supported contract version and capability set before enabling Android operational workflows.
- The handshake reports app/native build identity, bridge contract version, supported command/event schema versions, and required capability availability. It must not disclose secrets.
- Compatibility policy is explicit: additive compatible changes may coexist within a declared range; breaking changes require a new contract version and a coordinated migration/release plan.
- If web and native versions are incompatible, block affected operations and show a clear update-required/recovery state. Never attempt a best-effort call using an unknown payload shape.
- The installed Android runtime's Room repository remains authoritative regardless of WebView version.

## Bridge acceptance checks

1. Verify correct runtime selection in browser-only PWA and installed Android.
2. Simulate missing plugin, denied permission, unsupported bridge version, malformed payload, timeout, native process restart, and lost event notification.
3. Verify Android never falls back to IndexedDB for business data.
4. Verify duplicate state-changing requests with the same idempotency key create one business effect.
5. Verify timed-out commands are reconciled by querying durable status rather than blindly reissued with new IDs.
6. Verify listener cleanup and re-subscription across WebView recreation and foreground/resume.
7. Verify no feature can invoke arbitrary native methods or bypass its typed capability port.
