# Phase 2 — Application and Database Foundation

## Delivered foundation

- Separate platform-neutral domain surface and application record use case package; application services depend on repository interfaces, not storage adapters.

- React, TypeScript, Vite and an installable PWA shell.
- Capacitor Android project with Kotlin entry point and Room-backed native storage plugin.
- Browser-only PWA persistence uses Dexie/IndexedDB.
- Installed Android selects the native Room repository through the typed Capacitor `RoomStore` bridge; it does not write business records to IndexedDB.
- Platform-neutral record envelope, repository interfaces, versioned feature registry and dependency validation.
- Persisted app network policy defaults to disabled. NetworkGateway refuses operations until the user explicitly enables access.
- GPS policy is implemented as a pure, testable validator using approved `gps-event-fix-v1` limits (50 m / 30 s).
- Backup encryption design is locked in `docs/DROPBOX_BACKUP_CONTRACT.md`; actual backup encryption and transport remain Phase 6.

## Persistence model

The initial Room/Dexie adapter stores versioned JSON record envelopes behind one repository interface. Room schema version is 1. This generic envelope is a persistence foundation; module-specific typed entities and additive migrations are introduced as feature modules arrive. Feature modules must not bypass repository contracts or write one another's records.

## Commands

- `npm install` — install the workspace dependencies.
- `npm test` — run unit tests.
- `npm run build` — typecheck and build the PWA.
- `npm run dev` — run the local PWA.
- `npm run cap:sync` — build web assets and synchronize Capacitor Android assets.
- `gradle -p android assembleDebug` — build the Android debug APK with Java 17 and Android SDK installed.

## Boundaries intentionally deferred

- Driver shift/trip state machine, durable GPS acquisition orchestration, overlay UI and cross-surface live synchronization: Phase 3.
- Business modules and user forms: Phase 4.
- Full recovery/failure injection and physical-device lifecycle validation: Phase 5.
- Dropbox OAuth, encrypted package generation, passphrase/recovery-key setup UX, scheduled backup and restore: Phase 6.
- Signed release, physical-device acceptance and release: Phase 7.

## Phase 2 exit gate

Both browser and Android builds compile; browser persistence works without native APIs; Android persistence routes through Room; network policy defaults closed; GPS policy and feature registration are covered by automated tests. CI runs web checks and Android debug build.