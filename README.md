# Sam Travels

## Documentation authority

Use the [Contract and Documentation Index](docs/CONTRACT_INDEX.md) to find the authoritative owner for each rule, product specification, implementation guide, audit and historical record. The [repository-wide Markdown audit](docs/MARKDOWN_DOCUMENTATION_AUDIT.md) records the 63-file baseline inventory and reconciliation decisions.

## Permanent application architecture

The approved, frozen scope is documented in [docs/PERMANENT_APPLICATION_ARCHITECTURE.md](docs/PERMANENT_APPLICATION_ARCHITECTURE.md). The Stage 0 audit and implementation gap matrix are in [docs/PERMANENT_APPLICATION_ARCHITECTURE_AUDIT.md](docs/PERMANENT_APPLICATION_ARCHITECTURE_AUDIT.md). Follow the staged plan; do not rebuild Stage 5 or treat the scope document as proof of implementation.


Sam Travels is a single-driver Driver Log Book and business operations PWA, with a native Android layer for capabilities that the browser cannot reliably provide.

## Core principles

- Single-driver workflow; this is not a multi-driver fleet-management product.
- Offline-first, local-first operation with durable records and explicit recovery.
- React + TypeScript web UI, installable as a PWA and packaged for Android with Capacitor.
- Kotlin Android services/plugins own overlay, background execution, and other OS-integrated behavior.
- Dropbox automatic daily backup, with transparent status and recoverable versions.
- Modular feature contracts: business rules, persistence, native integrations, and presentation remain decoupled.

## Project status

Core foundation and shared driver workflow have been merged to main. The PWA/Capacitor lifecycle, bridge, runtime capability, security, compatibility, and platform acceptance rules are documented in the architecture contracts. Their implementation status is not implied by the documentation. Physical-device acceptance and live Dropbox acceptance remain separate release gates. See [ARCHITECTURE.md](ARCHITECTURE.md) and [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md).

## Requirements

- Node.js LTS and npm
- Android Studio and Android SDK for native builds
- A supported Android device for overlay, background, and screen-off validation

Install dependencies with `npm install`, run checks with `npm test` and `npm run build`, and start the PWA with `npm run dev`. Android builds require Android SDK tooling and Java 21.

## Architecture contracts

The foundation is governed by the contracts linked from [ARCHITECTURE.md](ARCHITECTURE.md), including local persistence ownership, crash-safe transaction/recovery, event-scoped GPS and time integrity, user-controlled network access, Dropbox backup/recovery, modular feature boundaries, PWA lifecycle, runtime capability detection, Capacitor bridge compatibility, application lifecycle, WebView security, and platform acceptance. The seven-phase sequence and exit gates are in [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md). GPS policy v1 is 50 m / 30 s. Backup encryption v1 is AES-256-GCM with passphrase or recovery-key access; full backup workflows are scheduled for Phase 6.
