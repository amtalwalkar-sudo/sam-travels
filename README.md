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

The repository is being established in phases. The current foundation branch defines architecture, data, native Android, backup, and delivery contracts before feature implementation. See [ARCHITECTURE.md](ARCHITECTURE.md) and [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md).

## Requirements

- Node.js LTS and npm
- Android Studio and Android SDK for native builds
- A supported Android device for overlay, background, and screen-off validation

Implementation and setup instructions will be added with the application scaffold.
