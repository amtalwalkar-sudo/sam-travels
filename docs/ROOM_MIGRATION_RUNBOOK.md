# Room Database Migration Runbook

## Current baseline

- Android database: `sam-travels.db`.
- Room schema version: **2**.
- Version 1 stored the generic `records` table without an index.
- Migration `MIGRATION_1_2` adds the `updatedAt` index used by chronological record scans. It preserves every existing row and JSON payload.
- Every Android Room client (PWA bridge, overlay service, backup worker, backup/restore plugin, and generic Room store) must register all supported migrations. No client may open the database with destructive fallback.

## Schema export

The Android Gradle KSP configuration sets Room's `room.schemaLocation` to `android/app/schemas`, and `LocalDatabase` enables `exportSchema`. The schema directory is included in Android instrumentation-test assets.

For each future Room version:
1. Increment the database version.
2. Add an explicit migration from every supported previous version (or a tested migration chain).
3. Build the Android project to generate the new Room schema JSON.
4. Commit the generated schema JSON under `android/app/schemas/in.samtravels.app.LocalDatabase/` with the migration and tests.
5. Never use `fallbackToDestructiveMigration` for business data.

## Required migration verification

- Migrate a populated previous-version database and verify all record IDs, JSON payloads, schema versions and timestamps remain unchanged.
- Verify the new schema objects (indexes, tables, constraints) exist after migration.
- Inject a migration failure and verify SQLite rolls back the migration while preserving the original version and business records.
- Keep file-backed instrumentation tests; an in-memory-only test is not sufficient to prove on-disk migration behavior.
- Run migration tests on the Android CI emulator and retain physical-device acceptance for release testing.

## Record-envelope evolution

The Room schema version and each business record's `schemaVersion` are separate compatibility dimensions. A Room table migration must not silently reinterpret business JSON. Business payload evolution requires explicit, versioned record migration/recovery logic and backup compatibility tests.
