# Architecture Hardening Implementation Contract

**Status:** Implementation contract for the separate architecture-hardening pull request.
**Baseline:** Runtime architecture and Timeline foundation PR #12 at `f02b7d9c2f499412b048ab90aa1723eab943146d`.
**Principle:** Strengthen the architecture without destabilizing the verified foundation.

This contract supplements the existing architecture, persistence, recovery, feature, Timeline, and shared-foundation contracts. It does not replace them or authorize user-facing Timeline/UI/shell work.

## Isolation and change policy

- Keep PR #12 unchanged. Hardening work is performed on a separate branch and reviewed separately.
- Reuse existing authoritative stores, gateways, feature boundaries, and recovery machinery. Do not introduce a second business store, competing command algorithm, or duplicate event records.
- Each stage is a separate commit with targeted tests and a recorded CI result before the next stage is built on it.
- Changes must remain architecture/domain/application/persistence/platform-adapter/test scoped. No visual styling, navigation, Timeline screen, cards, or presentation changes.
- A failed gate blocks progression; do not waive checks to get a green build.
- Physical-phone and live Dropbox/account acceptance are distinct release gates and must not be represented as CI-verified.

## Stage 1 — Compiler/AST-backed persistence boundary enforcement

### Required implementation
- Replace or supplement brittle source-text matching with parser/compiler-backed checks for TypeScript import graphs and forbidden persistence access.
- Enforce repository-relative imports and configured path aliases, feature public entry points, dependency direction, and cycle prevention.
- Enforce Kotlin Room DAO/SQLite access ownership using compiler-supported analysis or a structured Kotlin AST parser; allow direct DAO access only in designated persistence gateways/migrations/backup adapters.
- Guard all production business writes through the authoritative command/application persistence boundary; reject unapproved direct table/database mutations.
- Produce actionable diagnostics: source file, offending symbol/import, violated rule, and approved boundary.

### Tests / exit gate
- Positive fixtures for authorized gateways and imports.
- Negative fixtures for direct IndexedDB, Dexie, Web Storage, Cache API, browser persistence-library imports, Room DAO access outside approved gateways, direct SQLite mutation, direct business writes, and path-alias bypasses.
- AST fixtures prove comments/string literals do not spoof access checks; malformed TypeScript fails closed.
- Run architecture checker suite and the full web and Android CI gates.
- No production behavior or schema change unless strictly needed to close a demonstrated bypass.

### Verification evidence
- **Verified code commit:** `42fd818ac12a5a69860863b1549d736892df4d91`
- **CI run:** Sam Travels CI #631 (`42190831986`)
- **Result:** architecture, web regression/build, Android compile/unit/instrumentation/reliability jobs all succeeded.
- **Scope:** no Workflow/Timeline UI, navigation, styling, or shell work; the only UI-file touch moved non-secret Dropbox convenience settings behind a dedicated persistence adapter. PR #12 remains unchanged.

## Stage 2 — Formal persistence and schema contracts

### Required implementation
- Define stable, explicit schema/record contract versions for persisted authoritative data and backup participants.
- Specify validation at persistence ingress and restore ingress: identity, required fields, enum/event discriminants, revisions, timestamps, and integrity constraints.
- Make migration chains explicit, ordered, deterministic, and idempotent where supported; reject unsupported future versions without destructive fallback.
- Maintain representative historical database and backup fixtures, including malformed, partial, duplicate-identity, and older-version records.
- Preserve source records and semantics; projections and caches remain derived and rebuildable.

### Tests / exit gate
- Migration tests for each supported historical fixture to current version.
- Migration repeatability and rollback/failure-injection tests.
- Validation tests for accepted/rejected records and backup compatibility.
- Tests prove unknown future schema versions fail safely and preserve recoverability.

### Implementation evidence under test
- Shared TypeScript record-envelope v1 and backup snapshot v1 validators are defined in `packages/core/src/persistence-contract.ts`.
- Browser IndexedDB schema is explicitly versioned at v5; Android Room remains v3 with the ordered 1→2→3 migration chain. RoomStore now registers both migrations, matching Backup.
- Record validation is enforced by the application service, Dexie write adapter, Android Room write plugin, and backup export/restore ingress. Legacy Room rows remain readable for migration/recovery; typed application reads validate before business use.
- Native and browser backup manifests validate required metadata, record counts, participant versions, and reject unsupported future versions before checkpoint/replacement.
- Work command, intent, state, committed-event, and outbox discriminants/revisions are validated at browser/native persistence and backup boundaries; malformed persisted intents/events fail closed rather than being silently skipped.
- Historical/adversarial fixtures live in `fixtures/persistence/`; TypeScript and Android tests exercise v1/v2 Room migration, Dexie v1→v5 upgrade, record validation, duplicate identities, future-version rejection, and migration rollback.

## Stage 3 — Real persisted-data cross-platform parity

### Required implementation
- Drive the same deterministic headless projection contract from records actually read from PWA IndexedDB/Dexie and Android Room—not only a shared synthetic fixture or mocked bridge.
- Normalize only platform-specific transport/storage representations; do not normalize away business differences.
- Compare complete outputs: stable event/group IDs, metric IDs, values, result states, ordering, shift/day allocation, and diagnostics where contractually relevant.
- Include ordinary, edge, missing/invalid, duplicate/replayed, migrated, and restored persisted datasets.

### Tests / exit gate
- Web integration test persists then reads the dataset from IndexedDB and runs projection.
- Android instrumentation persists then reads the equivalent dataset from Room and runs projection through the real Android data gateway.
- Compare deterministic serialized business outputs against one parity oracle with explainable mismatch diagnostics.
- Fixture-only parity remains useful but is not sufficient for this gate.

## Stage 4 — Recovery and transaction guarantees

### Required implementation
- Establish a shared documented transaction/recovery lifecycle for commands, persistence, projections, and restore: validate → identity/revision/idempotency check → authoritative atomic write → derived projection rebuild/update → durable completion.
- Ensure derived Timeline/summary/cache data never becomes an authoritative source and can be rebuilt from source records.
- Preserve checkpoint-before-replacement restore semantics; validate backup before mutation and verify restored state after commit.
- Make interruption, duplicate delivery, concurrent/stale commands, migration failure, restore failure, and restart paths observable through bounded privacy-safe diagnostics.
- Roll back or recover to a known valid state; avoid partial writes and duplicate business records.

### Tests / exit gate
- Failure injection at every durable transition boundary.
- Duplicate/replay and concurrent command tests proving exactly-once effects (idempotent outcomes, not assumed exactly-once delivery).
- Restart/reopen tests for browser persistence and Room.
- Restore checkpoint, replacement, verification, and rollback tests.
- Derived projection rebuild equivalence test before/after restart and restore.

## Stage 5 — Integrated regression gate

### Required implementation
- Add/extend a single CI gate that runs architecture enforcement, schema/contract validation, historical migration fixtures, persisted-data parity, recovery/transaction reliability, full web regression/build, and Android build/unit/instrumentation reliability gates.
- Ensure stage-specific test groups are included in required integrated execution, not merely present in repository.
- Preserve existing CI gates; do not downgrade or silently skip failures.

### Exit gate
- All architecture, web, Android, storage, parity, migration, recovery, and backup/restore checks pass on the hardening PR head.
- PR description records exact commit SHA and CI run(s) for each stage.
- Scope audit confirms PR #12 is unchanged and no UI/shell/presentation work entered this branch.

## Acceptance register

| Stage | Deliverable | Evidence required | Status |
|---|---|---|---|
| 1 | AST/compiler-backed persistence ownership enforcement | Positive/negative architecture fixtures and CI #631 on `42fd818ac12a5a69860863b1549d736892df4d91` | Verified |
| 2 | Versioned persistence/schema contracts and migration fixtures | Historical fixture migration, validation, rollback tests | Not yet verified |
| 3 | Actual IndexedDB + Room persisted-record parity | Web integration + Android instrumentation comparison | Not yet verified |
| 4 | Transaction/recovery guarantees | Failure-injection, replay, restart, restore tests | Not yet verified |
| 5 | Integrated regression gate | Full CI green on PR head | Not yet verified |

A contract or documentation commit alone does not count as implementation completion. Mark a stage verified only after its code, tests, and CI evidence are present.
