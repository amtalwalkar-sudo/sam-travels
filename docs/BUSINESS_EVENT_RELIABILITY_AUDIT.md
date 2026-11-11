# Business-Event Reliability Audit

**Audit ID:** ST-BUSINESS-EVENT-RELIABILITY  
**Status:** In progress — baseline architecture and evidence-model review  
**Baseline branch:** `main`  
**Baseline commit:** `f766725fc9f8c1d94aa1aa5c99a0596eccec4539`  
**Baseline date:** 2026-11-11  
**Related integrated work:** [PR #69](https://github.com/amtalwalkar-sudo/sam-travels/pull/69) (merged)  
**Product authority:** [Intelligent Business Advisor Vision](INTELLIGENT_BUSINESS_ADVISOR_VISION.md)  
**Implementation authorization:** This audit authorizes inspection and documentation only. It does not authorize a new verification data model, business-rule changes, or runtime implementation.

## 1. Purpose

Determine whether Sam Travels captures business activity reliably across browser-only PWA and installed Capacitor Android, and whether captured records can support trustworthy business conclusions.

This audit distinguishes two questions:

1. **Application reliability:** Was the information captured, durably committed, recovered, and presented consistently?
2. **Business-event reliability:** Does the information adequately represent what happened in the real business, given its source and corroborating evidence?

Passing the first does not automatically pass the second. A durable owner-entered amount remains an assertion unless the event-specific evidence standard supports a stronger conclusion.

## 2. Evidence and rating vocabulary

### 2.1 Business-event evidence states — approved product vocabulary

- **Reported:** entered/asserted by an identified person or source; not sufficiently corroborated.
- **Corroborated:** supported by relevant separately identified evidence. Copies/derivatives of one assertion are not independent sources.
- **Verified:** meets the approved evidence requirements for that event type. Successful saving or GPS alone is insufficient.
- **Conflicting:** material evidence disagrees and is unresolved.
- **Unknown:** available evidence is insufficient to determine status.

These are evidence states, not an automatic status ladder. Missing evidence is not proof that an event did not happen. Verification rules must be specific to the event type and versioned. No confidence score is approved by this audit.

### 2.2 Audit result labels

- **Verified:** the named behaviour is supported by inspected implementation and relevant automated evidence at the baseline.
- **Partial:** some requirements are supported, but material paths, platform coverage, or acceptance remain incomplete.
- **Failed:** inspected evidence demonstrates a contract violation or incorrect result.
- **Unknown:** evidence has not yet been inspected or is insufficient.

A test passing is evidence only for the scenario it executes. CI, emulator, physical-device, and real-world business evidence must remain distinct.

## 3. Baseline and scope

PR #69 was merged into main at baseline commit `f766725fc9f8c1d94aa1aa5c99a0596eccec4539`. Its PR description explicitly says its integrated acceptance scope was not yet all complete and defers physical-phone acceptance. The baseline main CI run [#42991386321](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/42991386321) completed successfully with web, architecture, Android, production geocoder verification, and integrated regression jobs.

This establishes successful execution of those automated jobs, not proof of all lifecycle combinations, physical-device behaviour, live business evidence, or every real-world event.

### In-scope surfaces and paths

- Browser-only PWA with IndexedDB/Dexie authority.
- Installed Capacitor Android WebView with Room authority.
- Native Android driver overlay sharing the Android Room/application boundary.
- Shared driver command, GPS evidence, trip financial closeout, and shared-form submission paths.
- Persistence, recovery, backup participation, and platform parity relevant to captured records.

### Explicitly not accepted as complete by this baseline

- Physical Android phone/OEM lifecycle acceptance.
- PWA real-browser lifecycle matrix beyond automated tests inspected.
- Live Dropbox account acceptance.
- Independent corroboration of real-world fares, collections, expenses, fuel purchases, or maintenance events.
- Production event verification states and event-specific evidence policies.

## 4. Architecture and capture findings

### 4.1 Authoritative storage by runtime

| Runtime/surface | Authority | Baseline finding |
|---|---|---|
| Browser-only PWA | IndexedDB/Dexie | **Verified at architecture level.** Browser adapter uses Dexie and shared repository interfaces. |
| Installed Android WebView | Room | **Verified at architecture level.** Native plugin routes business reads/writes through Room-backed APIs. |
| Native Android overlay | Same Room-backed application/store boundary | **Verified at architecture level.** Overlay uses native workflow/financial stores; it is not a second business database. |
| Dropbox | Backup destination | Not a live business-record authority. Live account acceptance remains separate. |

The current browser database declares schema version 6. Its business/workflow tables include `records`, `driverState`, `driverIntents`, `driverEvents`, and `driverOutbox`; checkpoint, credential-vault, and diagnostics tables are separate participants/areas with their own policy.

The current Android Room database is schema version 3 and declares two entities/tables: `records` and `logbook_events`. Work/Trip driver events are written to `logbook_events`; driver state, intents, outbox, and feature records use the `records` table. The Room migration 2→3 moves legacy `driver-event:` rows into `logbook_events`.

**Documentation discrepancy:** the older [Reliability Audit](RELIABILITY_AUDIT.md) describes an earlier baseline in which Android had one Room table and the browser had five business tables. That audit explicitly targets PR #6 and is historical. Its table inventory must not be reused as current schema evidence. Preserve it as history; this audit is the current baseline record.

### 4.2 Driver event capture and GPS evidence

The inspected PWA and Android paths use event-scoped GPS acquisition, not continuous tracking. The shared `gps-event-fix-v1` policy requires valid coordinates, horizontal accuracy no worse than 50 metres, a fix within 30 seconds of the original transition time, and rejects future fixes beyond the defined tolerance.

The Android `DriverWorkflowPlugin` obtains a bounded location request and the browser `BrowserEventLocationProvider` samples browser geolocation until an acceptable fix or the deadline. The original transition time and actual fix time are distinct. A pending intent is persisted before acquisition; event, GPS evidence, state projection/revision, terminal intent status, and outbox are committed through the authoritative transaction boundary.

**Rating: Partial.** Automated policy and recovery paths exist, but GPS is location/time evidence only. It does not establish the commercial truth of a trip, fare, payment, or collection. Physical-device GPS and lifecycle acceptance remains deferred.

### 4.3 Driver workflow persistence and replay

Inspected code shows stable command/event identity, idempotency keys, expected state/revision checks, durable pending intents, atomic completion, outbox replay, and separate PWA/Android adapters. Browser and Android tests cover representative interruption/reopen, duplicate/replay, stale/conflicting transition, and failure-boundary scenarios. The current main CI Android job includes the required Room/workflow/backup reliability gate.

**Rating: Partial-to-verified for the tested technical paths.** The inspected contract and tests provide meaningful evidence, but they do not establish every possible lifecycle/process/OS combination or physical-device acceptance. The complete test inventory and gaps will be enumerated in the next audit pass.

### 4.4 Trip financial capture

The inspected shared definitions distinguish completed-ride Fare (required, explicit zero valid) from optional Toll/Parking with independent payer selections. Cancellation Fee is a separate required closeout, with explicit zero valid and no Toll/Parking fields. Values are represented in integer paise and trip-linked obligations are created at the driver transition boundary. Application services validate and use revision-aware/idempotent submission; the Android overlay has corresponding Room-backed submission stores and instrumented tests.

**Rating: Partial for business-event reliability.** The implementation demonstrates that the values are captured and persisted consistently under tested conditions. The inspected schemas identify the entered amounts, operation identity, and related trip/transition, but do not establish independent evidence that the fare was agreed, that the customer paid, or that an expense was actually incurred/paid. Such values must be treated as **Reported** until event-specific corroboration requirements are designed and satisfied.

### 4.5 Shared forms and working copies

The shared form runtime stores working copies in the runtime's authoritative record store, uses revision-aware writes, validates declared fields, and delegates submission to application-owned services. PWA and Android overlay paths exist for the inspected Work/Trip financial forms.

**Rating: Partial.** This supports consistent capture and recovery, but a working-copy or successful submission status is not a business verification status. A crash between domain submission and working-copy status update must remain safe through operation idempotency; exact coverage across every form and lifecycle remains to be audited.

## 5. Initial business-event reliability gap

The inspected driver event schema stores command, GPS snapshot, commit time, and revision. The inspected Trip financial obligations store the trip link, entered amounts/payer values, operation identity, submission status, and timestamps. In the inspected paths, no event-specific corroboration/verification decision is represented as an authoritative status.

Therefore, at this baseline:

- Driver transitions may be **durably recorded**, but that alone does not make the real-world event **Verified**.
- GPS evidence may corroborate a location/time observation, but does not independently prove the commercial event.
- Fare and cancellation-fee amounts entered through forms are **Reported** unless supported by a separately approved evidence rule and corroborating source.
- A submitted payment/expense form proves that the application accepted the entry, not necessarily that money moved or the expense occurred.
- No advisor output may silently promote these records to Verified.

This is a product/data capability gap, not yet a demonstrated persistence defect. Do not add generic verification flags to every record as a shortcut. First define evidence requirements by business-event type and map them to authoritative source contracts.

## 6. Remaining audit work

| Work item | Scope | Status |
|---|---|---|
| A. Architecture and authority map | Trace PWA, Android WebView, overlay, shared application services, adapters and durable stores | Partial — baseline paths inspected; full feature map remains |
| B. Driver workflow evidence | Trips, shift transitions, GPS, event identity, context, recovery and history | Partial — core path inspected; exhaustive acceptance map remains |
| C. Financial business events | Fare, collection, toll, parking, fuel, maintenance, loan/payment and settlements | Partial — Work/Trip closeout inspected; remaining domains not yet inspected |
| D. Form capture quality | Definitions, validation, draft persistence, submission idempotency, correction/audit history | Partial — shared runtime and Work/Trip inspected; every form not yet inventoried |
| E. Cross-platform equivalence | Equivalent PWA and Android operations and canonical outputs | Partial — shared contracts and selected parity/bridge tests exist; full scenario matrix remains |
| F. Durability and recovery | Failure injection, process recreation, migrations, backup/restore and replay | Partial — substantial automation exists; remaining paths and physical-device limits remain |
| G. Evidence/corroboration model | Source independence, event-specific rules, review and correction provenance | Unknown / not implemented in inspected paths |
| H. Intelligence eligibility | Per-metric data sufficiency, source states, partial totals and traceability | Unknown — requires candidate metric/source mapping |

## 7. Audit rules and next sequence

1. Finish the feature-by-feature source-of-truth map before changing code.
2. For each business event, record capture surface, authoritative command/service, authoritative store, required fields, source/provenance, recovery, correction path, corroboration sources, and intelligence eligibility.
3. Build equivalent PWA/Android fixtures for each high-value event and compare canonical business outputs, not merely UI success.
4. Define evidence requirements for Trips, Fare/collection, Toll/Parking, Fuel, Maintenance, Loans/payments and other domains separately.
5. Define what the system can observe, what a person asserts, what can independently corroborate it, and what remains unknowable.
6. Only after the audit and product-owner approval, create focused technical contracts and implement the smallest validated gaps.
7. Keep physical-device and real-world operational acceptance distinct from CI/emulator evidence.

Do not weaken existing transaction, persistence, privacy, GPS, form, or platform acceptance contracts to satisfy this audit. Do not change business rules or calculations as part of evidence classification without separate approval.

## 8. Change history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-11-11 | Initial baseline architecture and business-event evidence review at main commit `f766725`. |

**Current conclusion:** Sam Travels has a substantial local-first capture and recovery foundation for the inspected Work/Trip paths. The reviewed evidence does not yet justify calling manually entered business amounts or all real-world events independently verified. The full reliability audit remains in progress.
