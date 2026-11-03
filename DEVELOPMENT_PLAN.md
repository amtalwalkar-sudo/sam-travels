# Development Plan

Work is delivered in small, reviewable phases. Keep each phase buildable and testable; do not bypass existing gates to make a feature appear complete.

## Phase 0 — Foundation contracts

- Establish product scope, modular architecture, data contracts, native Android contract, and Dropbox backup/recovery contract.
- Confirm repository state and protect the default branch through pull-request review.
- Add the web/Capacitor scaffold and baseline CI in the next implementation phase.

## Phase 1 — Application shell

- React + TypeScript + Vite PWA.
- Capacitor Android project from the beginning.
- Navigation and responsive application shell with feature registration boundaries.
- Environment/configuration validation and typed platform capability detection.

## Phase 2 — Durable core

- Domain types, repository interfaces, IndexedDB implementation, migrations, and export/import primitives.
- Native Room journal and Capacitor bridge for durable platform events.
- Startup recovery, idempotent replay, and corruption/partial-write handling.
- Automated unit, integration, browser, and Android instrumentation tests.

## Phase 3 — Driver Log Book workflows

- Single-driver shift/work lifecycle with GPS-required start/end transitions.
- Trip and daily log records, odometer/kilometer capture, and history.
- GPS snapshots at shift start/end, trip start/end, and ride cancellation; acquire until a reliable fix is available and persist the transition plus snapshot durably before success.
- Offline GPS acquisition and transition capture; background location only while native overlay operation is confirmed active.
- Persisted state intervals and restart-safe shift, ride, and pickup-approach timers; live India clock in Asia/Kolkata HH:mm:ss.
- Offline entry and reconciliation; validate lifecycle across WebView reload and Android process death.

## Phase 4 — Business modules

- Finance and loan/EMI records.
- Vehicle, maintenance, and compliance records.
- Performance views based on domain-owned calculations.
- Admin configuration and backup/recovery controls.

## Phase 5 — Android resilience

- Overlay permission flow and native overlay lifecycle.
- Foreground/background service behavior within current Android policy.
- Screen-off and device-restart recovery.
- OEM battery-management validation and clear degraded-state UX.

## Phase 6 — Dropbox backup and release

- OAuth connection, scheduled daily backup, retry and retention.
- Restore checkpoint and confirmed restore flow.
- Release signing, Android artifact generation, PWA deployment, and release checklist.

## Definition of done

- Acceptance criteria and failure cases are documented.
- Domain logic has unit tests; persistence has migration/recovery tests.
- UI flows have component or browser coverage.
- Native behavior has Android instrumentation/device coverage where applicable.
- Offline, process-death, duplicate-event, and restore paths are tested.
- CI is green; no secrets or tokens are committed.
- User-facing permissions, limitations, backup state, and recovery state are explicit.

## Delivery rule

Prefer a complete vertical slice over disconnected screens. Do not merge an unfinished feature merely because the UI renders. Preserve stable contracts and expand them through reviewed, versioned changes.
