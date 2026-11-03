# Sam Travels

Sam Travels is a single-driver Driver Log Book and business operations PWA, with a native Android layer for capabilities that the browser cannot reliably provide.

## Core principles

- Single-driver workflow; this is not a multi-driver fleet-management product.
- Offline-first, local-first operation with durable records and explicit recovery.
- React + TypeScript web UI, installable as a PWA and packaged for Android with Capacitor.
- Kotlin Android services/plugins own overlay, background execution, and other OS-integrated behavior.
- Dropbox automatic daily backup, with transparent status and recoverable versions.
- Modular feature contracts: business rules, persistence, native integrations, and presentation remain decoupled.

## Project status

Phase 1 architecture and contracts are approved. Phase 2 establishes the React/TypeScript PWA, Capacitor Android shell, browser IndexedDB and native Room persistence, typed feature contracts, and network policy foundation. See [ARCHITECTURE.md](ARCHITECTURE.md) and [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md).

## Requirements

- Node.js LTS and npm
- Android Studio and Android SDK for native builds
- A supported Android device for overlay, background, and screen-off validation

Install dependencies with `npm install`, run checks with `npm test` and `npm run build`, and start the PWA with `npm run dev`. Android builds require Android SDK tooling and Java 17.

## Architecture contracts

The foundation is governed by the contracts linked from [ARCHITECTURE.md](ARCHITECTURE.md), including local persistence ownership, crash-safe transaction/recovery, event-scoped GPS and time integrity, user-controlled network access, Dropbox backup/recovery, modular feature boundaries, and security/compatibility. The seven-phase sequence and exit gates are in [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md). GPS policy v1 is 50 m / 30 s. Backup encryption v1 is AES-256-GCM with passphrase or recovery-key access; full backup workflows are scheduled for Phase 6.
