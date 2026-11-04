# Application Lifecycle and Startup Contract

## Purpose and precedence

This contract defines startup, resume, and shutdown coordination across browser PWA, Android WebView, and native Android services. It composes the existing [Transaction and Recovery](TRANSACTION_AND_RECOVERY_CONTRACT.md), [Local Persistence](LOCAL_PERSISTENCE_CONTRACT.md), [Native Android](ANDROID_NATIVE_CONTRACT.md), and [Runtime Capability and Bridge](RUNTIME_CAPABILITY_AND_BRIDGE_CONTRACT.md) contracts. It does not redefine their transaction or platform guarantees.

## Startup gates

The operational UI must not enable state-changing actions until the runtime's required startup gates have completed.

### Browser-only PWA

1. Identify browser-only runtime and select the IndexedDB adapter.
2. Open the database and validate its schema.
3. Run the required safe, versioned migrations.
4. Load the latest committed application state and revision.
5. Recover pending commands and eligible outbox work using the transaction/recovery contract.
6. Register browser lifecycle and repository change listeners.
7. Enable the operational UI with the recovered state.

### Installed Capacitor Android

1. Identify the installed Android runtime and complete the native bridge compatibility handshake.
2. Confirm the Room-backed repository capability is available; never fall back to IndexedDB for business data.
3. Open Room and validate schema/migration state.
4. Load the latest committed projection/revision and restore active workflow state.
5. Scan and reconcile durable pending intents, incomplete operations, and outbox entries using the transaction/recovery contract.
6. Register/re-register bridge event subscriptions and reconcile the latest revision after subscription.
7. Reconcile eligible native work and permission/capability status without requesting permissions unexpectedly.
8. Enable the operational UI only when the required authoritative state is ready; show unavailable capabilities separately.

The exact implementation may perform independent read-only preparation concurrently, but it must preserve these logical gates and must not enable actions before the authoritative state and compatibility checks are complete.

## Resume and reattachment

- On browser visibility return, page restoration, WebView attach/resume, overlay reattachment, or native service restart, treat in-memory state and prior notifications as potentially stale.
- Re-read the latest durable revision, reconcile pending work, and then refresh the presentation projection.
- Register event listeners before the final revision reconciliation to reduce missed-notification windows; still treat notifications as hints.
- A surface must not issue a state-changing command using a stale expected revision. The coordinator validates against current durable state.
- Surface-specific loading or stale status must not be confused with business workflow status.

## Shutdown and interruption

- Do not rely on graceful shutdown callbacks for durability. Accepted work must already be persisted according to the durable-intent boundary.
- Cleanup listeners, subscriptions, and transient resources when a surface is destroyed, without deleting durable work.
- Native service stop, WebView destruction, process death, force-stop, device reboot, and OS scheduling deferral must preserve pending work in the authoritative store.
- Re-register eligible work after restart where Android permits. Do not claim that Android guarantees execution after force-stop or under all OEM battery restrictions.
- A cancelled UI wait or destroyed surface does not cancel an already durable business intent.

## State readiness and error handling

- Distinguish database unavailable, migration in progress/failed, bridge unavailable/incompatible, recovery in progress, permission unavailable, and ordinary offline/network status.
- Do not collapse all startup failures into an OFFLINE status.
- If recovery or migration fails, preserve source data and enter the established recoverable state. Never clear/recreate the database to force startup.
- Provide actionable user-facing explanations without leaking stack traces, database internals, or sensitive data.
- Keep the shell capable of presenting recovery/status information even when business operations are gated.

## Lifecycle acceptance checks

1. Verify startup gating in browser and Android runtimes.
2. Kill/recreate WebView during a pending operation; verify the same durable state and ID recover.
3. Restart native service and reboot Android with pending work; verify recovery when execution is permitted.
4. Return from browser tab suspension and Android background/foreground; verify latest revision is loaded before actions are enabled.
5. Simulate migration, Room, IndexedDB, and bridge failures; verify no false-ready state and no destructive fallback.
6. Verify listeners are registered/removed correctly and missed notifications are recovered through revision reconciliation.
