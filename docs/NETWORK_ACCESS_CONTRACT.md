# Internet Access Control Contract

## Product rule

Sam Travels is a local-first, offline-capable application. Core driver and business workflows must operate without internet. Network access is an explicit, user-controlled capability exposed by a dedicated Internet icon in the main application header, immediately beside the GPS status/permission icon.

This is an in-app network policy control, not an Android runtime permission prompt. Android's `INTERNET` manifest permission is a normal install-time permission; the app must not imply that tapping the icon grants a runtime OS permission. The icon enables or disables Sam Travels' own use of network-dependent capabilities. Actual connectivity, captive portals, authentication, and OS restrictions remain separate status conditions.

## Header control and user experience

- Show a dedicated Internet icon adjacent to the GPS icon on the PWA and native Android surfaces.
- The icon must communicate the app's network policy state at a glance: enabled or disabled. Its detail/status view should distinguish policy disabled, device offline/no connection, connecting/working, and service/authentication error.
- Tapping the icon opens a clear, compact control where the user can enable or disable Sam Travels' internet access. The control must explain that enabling it allows configured online capabilities, including Dropbox backup and optional services such as reverse geocoding.
- The enabled state is an explicit user choice and must persist across app restarts and device reboots. Do not silently enable it because connectivity becomes available, an update is installed, or a new feature is added.
- Disabling access stops or cancels eligible app-initiated network work, prevents new optional requests, and leaves local workflows and queued local data intact. Handle in-flight operations safely; never lose local records.
- Display actual connectivity separately from the user's enabled/disabled policy. Turning the policy on does not mean the device is online or that Dropbox is authenticated.
- The PWA and native Android shell must read and update the same persisted network-policy setting. Changes propagate locally between surfaces without cloud access.

## Network policy enforcement

- All app-initiated network requests must pass through one application-level network capability/policy gateway. Feature modules must not call fetch, HTTP clients, SDKs, or third-party endpoints directly.
- The gateway checks the persisted user policy, actual connectivity, feature-specific enablement where applicable, and authentication before dispatch.
- Default policy is disabled until the user explicitly enables it.
- No hidden analytics, telemetry, geocoding, map tiles, remote fonts, update checks, or other background requests may bypass the gateway. Keep required application assets local or cache them so the core app shell remains usable offline.
- No online call may be a prerequisite for a core driver action, local persistence, timer, report, calculation, PWA/native overlay synchronization, or recovery of local state.
- Network failures must degrade gracefully to local operation. Retain queued work and show a concise, recoverable status; never block driver gestures or discard data.
- The gateway must be extensible: future online capabilities register a named capability, purpose, data scope, and offline fallback. Adding a capability must not silently broaden existing network permissions.

## Capability behavior

### Dropbox backup and restore

- Dropbox operations are allowed only while the master Internet Access policy is enabled and the user has connected Dropbox through OAuth.
- Daily automatic backup may run when the policy is enabled, Dropbox is authenticated, connectivity is available, and the scheduler/OS permits it. If internet access is disabled or unavailable, defer the backup and retry at the next eligible opportunity without affecting local work.
- Restore is always an explicit user-initiated operation with source/scope review and confirmation. The master toggle authorizes network access; it does not authorize replacing local data automatically.
- Preserve the existing checkpoint-before-restore, validation, and recoverability safeguards.
- Turning the master toggle off pauses new Dropbox requests and safely defers pending backup work. It must not delete local data, backups, credentials, or queued backup intent.

### Optional reverse geocoding and future services

- GPS coordinates are captured and stored locally at the defined user-triggered events, independently of internet access.
- Reverse geocoding (coordinates to locality/address) is an optional online enrichment. It may run only when the master Internet Access policy is enabled and the capability is registered/enabled under that policy.
- If offline or disabled, preserve the coordinates and mark locality enrichment as pending/unavailable; do not block or alter the original event, coordinates, transition timestamp, or GPS fix timestamp.
- When access later becomes available, eligible enrichment can be retried idempotently. Store provider, lookup time, result, and status separately from the immutable GPS evidence.
- New internet-dependent features must follow the same opt-in gateway and offline-fallback rules.

## Security, privacy, and observability

- Request only the data needed for the specific enabled capability. Do not transmit the full business database for a locality lookup.
- Explain the purpose and data sent before first use of a new optional capability where appropriate. Master Internet Access alone is not consent to send GPS coordinates to a third-party geocoder; Timeline location enrichment requires its own explicit opt-in.
- Keep OAuth tokens in platform-appropriate secure storage; never expose them in logs, exports, or UI.
- Record operational status without logging secrets or unnecessary personal/financial data.
- Provide a clear way to see why an operation did not run: policy disabled, device offline, authentication required, service unavailable, or OS/scheduler deferred.

## Acceptance tests

- With Internet Access disabled and the device online, verify no app-initiated external requests occur and every core workflow remains usable.
- With Internet Access enabled but device offline, verify core workflows remain usable and online tasks are safely deferred.
- Toggle access off/on across PWA and native overlay and verify the persisted state synchronizes without internet.
- Restart the app and reboot the device; verify the user's choice is retained.
- Verify Dropbox automatic backup runs only when policy, authentication, connectivity, and scheduler conditions permit; verify restore still requires explicit user confirmation.
- Verify GPS event capture succeeds offline and reverse geocoding is deferred; when enabled later, enrichment must not rewrite original GPS evidence or timestamps.
- Add a test online capability and verify it cannot bypass the gateway.
