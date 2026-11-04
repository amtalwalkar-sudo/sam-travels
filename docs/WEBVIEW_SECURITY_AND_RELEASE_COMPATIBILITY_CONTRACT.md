# WebView Security and Release Compatibility Contract

## Purpose and authority

This contract makes the WebView security boundary and cross-version release compatibility explicit. It supplements [Security and Compatibility](SECURITY_AND_COMPATIBILITY_CONTRACT.md), [Native Android](ANDROID_NATIVE_CONTRACT.md), [Local Persistence](LOCAL_PERSISTENCE_CONTRACT.md), and [Runtime Capability and Bridge](RUNTIME_CAPABILITY_AND_BRIDGE_CONTRACT.md). Existing security, credential, permission, database, and migration rules remain authoritative.

## WebView security boundary

- Treat the WebView as an untrusted presentation/client boundary, not as a security authority for native operations.
- Allow navigation only to the packaged application origin and explicitly approved destinations. External links must leave the trusted application context through a controlled external-navigation path.
- Apply a restrictive Content Security Policy appropriate to the packaged application. Keep script, style, image, connect, and frame sources explicit; avoid broad wildcards and unsafe evaluation.
- Do not load remote executable code, remote fonts, or remote application bundles as a runtime dependency.
- Expose only required Capacitor plugins and narrow typed methods. Disable or avoid unnecessary WebView debugging in production builds.
- Validate every bridge payload and enforce authorization/permission checks again in native code. UI visibility is not authorization.
- Prevent arbitrary file URL access, untrusted file navigation, and broad JavaScript interfaces. File import/export uses explicit, validated capabilities.
- Keep secrets and OAuth credentials out of the web bundle, local storage, logs, crash reports, and bridge payloads unless a narrowly defined secure operation requires them.
- Redact sensitive values in diagnostics. Do not claim local database or file encryption unless it is implemented and verified under the security contract.

## Version dimensions

Keep these versions distinct; one version number must not be overloaded to represent all compatibility dimensions:

- **Application release version:** user-visible product build.
- **Web asset/build version:** packaged PWA/WebView shell identity.
- **Native Android build version:** installed APK/native implementation identity.
- **Bridge contract version:** JavaScript/Kotlin API compatibility.
- **Persisted schema version:** Room or IndexedDB schema migration level.
- **Domain/event contract version:** serialized command, event, and record payload compatibility.
- **Backup manifest version:** export/restore package compatibility.

Each persisted or exchanged payload must carry the relevant schema/contract version. A release manifest should make the shipped web/native/bridge compatibility relationship inspectable.

## Compatibility policy

- Define an explicit supported web-to-native bridge version range for each Android release.
- A web bundle must not call a bridge contract it has not negotiated successfully.
- Additive changes are compatible only when old consumers can safely ignore the new optional fields and defaults are unambiguous.
- Breaking payload, event, or behavior changes require a version increment, migration/compatibility notes, and coordinated release sequencing.
- Unknown future schema or event versions must fail safely while preserving source data; never silently drop fields or reinterpret payloads.
- Database migrations remain governed by the local persistence contract and must be tested from every supported prior version.
- Backup compatibility remains governed by the Dropbox backup contract; application/bridge compatibility does not imply backup compatibility.

## Upgrade sequencing and rollback

- The packaged Android web assets and native implementation must be released as a compatible pair or through an explicitly supported compatibility window.
- At startup, verify the installed native build and bridge range before enabling Android operations.
- On incompatible combinations, block only the affected operational surface as appropriate and present a clear update-required/recovery path; never route Android business writes into IndexedDB.
- Apply web asset updates only under the PWA lifecycle contract. A new web bundle must not activate against an unsupported native bridge or persisted schema.
- Do not downgrade a database or reinterpret newer records during application rollback. If rollback cannot safely read the current schema, enter a recovery/update-required state and preserve the database.
- Release artifacts must be traceable to source commit, workflow run, application version, and native/web compatibility manifest.

## Security and compatibility acceptance checks

1. Verify production WebView navigation and Content Security Policy reject unapproved origins/resources.
2. Verify native methods independently validate bridge inputs and authorization.
3. Scan bundles, logs, fixtures, and artifacts for secrets.
4. Test supported and unsupported web/native/bridge version combinations.
5. Test upgrades and rollback scenarios without destructive database downgrade.
6. Verify unknown event/schema versions preserve source data and produce a recoverable compatibility error.
7. Verify release artifacts identify the source commit and compatibility versions.
