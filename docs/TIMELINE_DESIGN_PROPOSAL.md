# Timeline Design Proposal

**Status: Proposed; discussion remains open.**
**Approval state: Not frozen.**
**Implementation authorization: Not granted.**
**Scope of this document change: Documentation only.**

This document records the Timeline product and architecture decisions discussed for the single-driver Sam Travels application. It is a proposal for review, not an implementation specification that authorizes code, schema, migration, UI, background-service, or runtime changes. Further product decisions may be added before the design is frozen.

## 1. Purpose and product boundary

Timeline is a driver-friendly, event-wise chronological history of the driver's shifts and trips. It is inspired by the event-list presentation of Google Maps Timeline, but **must not display maps or require map tiles**.

Timeline is a read-only projection of authoritative Sam Travels business history. It is not a second shift/trip system, a second business database, or a place to manually recreate or correct source transactions.

The existing single-driver product boundary remains unchanged. No dispatch, passenger booking, fleet, driver assignment, or multi-driver capability is introduced.

## 2. Governing architecture and precedence

Timeline must follow, and does not replace or weaken, the existing contracts:

- [Architecture](../ARCHITECTURE.md) — layers, dependency direction, feature ownership, runtime persistence selection and offline-first principles.
- [Architecture Foundation Contract](ARCHITECTURE_FOUNDATION_CONTRACT.md) — durable ownership, versioning, recovery, platform boundaries, calculations and feature registration.
- [Feature Module and Extension Contract](FEATURE_MODULE_CONTRACT.md) — capability isolation, public contracts, add-on/change isolation and calculation ownership.
- [Data and Persistence Contract](../DATA_CONTRACT.md) and [Local Persistence Ownership Contract](LOCAL_PERSISTENCE_CONTRACT.md) — stable record/event identity and authoritative storage.
- [Transaction and Recovery Contract](TRANSACTION_AND_RECOVERY_CONTRACT.md) — durable intent, atomic completion, idempotent replay and recovery.
- [Driver Workflow and Business Rules Contract](DRIVER_WORKFLOW_CONTRACT.md) — shift/trip lifecycle, fare/cancellation entry, odometer and 04:00 logical-shift behavior.
- [GPS Evidence and State Timing Contract](LOCATION_AND_STATE_TIMING_CONTRACT.md) — event-scoped GPS, timestamp integrity and timer derivation.
- [Internet Access Control Contract](NETWORK_ACCESS_CONTRACT.md) — explicit network opt-in, gateway enforcement and optional reverse geocoding.
- [Native Android Contract](ANDROID_NATIVE_CONTRACT.md), [Application Lifecycle Contract](APPLICATION_LIFECYCLE_CONTRACT.md), [PWA Lifecycle Contract](PWA_LIFECYCLE_CONTRACT.md) and [Platform Acceptance Contract](PLATFORM_ACCEPTANCE_CONTRACT.md) — platform and lifecycle limitations.
- [Architecture Enforcement and Verification](ARCHITECTURE_ENFORCEMENT.md) — static checks, runtime tests and acceptance evidence.

If this proposal appears to conflict with an existing normative contract, the existing contract remains authoritative. Resolve the conflict through an explicitly reviewed contract change before implementation; do not silently reinterpret the existing rule.

## 3. Proposed Timeline architecture

The conceptual flow is:

1. **Presentation** — renders the event sequence, filters, shift sections, ride/cancellation blocks, location labels and summaries.
2. **Timeline Projection** — converts authoritative source records into display-ready chronological event groups and metric values.
3. **Timeline Domain** — defines Timeline-specific ordering, grouping, interval interpretation and projection validation. It does not own shift/trip lifecycle rules already owned by Work/Shift and Log Book/Trips.
4. **Timeline Application Queries** — coordinates read-only queries across the public contracts of the owning capabilities, applies date/week selection and returns bounded results.
5. **Authoritative feature repositories** — supply shifts, trips, pickup attempts, cancellation fees, fares, toll/parking, odometer readings and GPS evidence.

### Ownership rules

- Work/Shift remains the owner of shift lifecycle and shift-level odometer readings.
- Log Book/Trips remains the owner of trip lifecycle and trip-level fare, toll, parking and cancellation-fee records, according to the existing driver workflow contract.
- GPS evidence remains owned by the source event/transition and its existing location contract.
- Timeline consumes versioned public application queries/contracts or published events. It must not read another feature's private tables, import its persistence adapter, or mutate its records.
- Timeline must not create duplicate authoritative shift, trip, fare, cancellation, odometer or GPS records.
- Any cached Timeline projection is derived, non-authoritative, disposable and rebuildable from source records. It must carry a projection/schema version if persisted. It must not become a second business history.
- If future implementation requires Timeline-owned durable business data, that is a new product/architecture decision and must use the feature-registration, migration, backup and restore rules. This proposal does not authorize such data.

## 4. Event-wise presentation requirements

The Timeline is compact, readable at phone size and visually ordered like an algorithm/event sequence. It must avoid oversized cards, redundant labels and maps. Distinct rides and shifts need unmistakable boundaries.

### 4.1 Shift start

Show:
- Shift start time.
- Human-readable start location when resolved.
- A live elapsed shift timer in `HH:mm:ss` while the logical shift is active in Timeline.
- After shift end, replace the live timer with the fixed total shift duration.

The timer is always derived from persisted start/end instants and the current clock. It is never an incrementing UI counter and must recover across app/WebView/process/device restart subject to the clock-integrity limitations in the existing GPS/time contract.

This Timeline presentation does not change the existing Work-screen presentation rule about not showing a prominent continuously running shift timer.

### 4.2 Going-to-pickup connector

Between pickup initiation and its outcome, show:
- A prominent downward arrow centered in the event sequence.
- Elapsed pickup duration beside the arrow.
- A small `TO PICKUP` caption.

The interval begins when the driver creates the trip/enters Going to Pickup. It ends at Start ride or cancellation, whichever occurs first. The connector is outside the ride container. It repeats for subsequent attempts.

### 4.3 Completed ride block

Each completed ride is shown in its own compact, visually distinct container with clear boundaries from adjacent rides. Show:
- Ride start time and fare as the strongest information.
- Passenger ride duration as secondary information.
- Readable From → To locations.

The ride duration is Start ride to End ride. Do not duplicate labels or show redundant information.

### 4.4 Cancelled pickup attempt

A cancellation is a distinct event block, not a completed ride. Use restrained warning styling and show:
- Cancellation time.
- Cancellation fee (including an explicit zero amount).
- Time from pickup initiation until cancellation.
- Available human-readable location.

The pickup connector ends at cancellation. A later attempt is a new trip/attempt with its own identity and pickup interval.

### 4.5 Shift end

Show shift end time, resolved location where available, and the fixed total shift duration. Visually separate one shift from the next.

### 4.6 Multiple shifts and 04:00 logical boundary

Each logical shift is a separate section with its own independent duration. The existing 04:00 Asia/Kolkata logical-shift rotation remains authoritative:
- The boundary is a system-generated logical segmentation event, not a fabricated driver action.
- The driver's Online session remains continuous across the boundary.
- Trips remain assigned to the logical-shift ID active when the trip was created, as required by the driver workflow contract.
- Timeline must not invent a GPS fix or driver shift-start action for the automatic boundary.
- Any pending odometer confirmation and active-trip deferral continue to follow the driver workflow contract.

The visual treatment of an automatic 04:00 boundary may need a distinct system event rather than a normal manually initiated Shift Started event.

## 5. Shift Summary

After each ended logical shift, show a compact Shift Summary. It is a projection of source records, not a separately entered or independently persisted financial summary.

### Money

- **Total fare:** sum of completed ride fares plus cancellation fees.
- **Toll:** displayed separately.
- **Parking:** displayed separately.
- Toll and parking are not included in Total fare.

### Time

- **Total trip time:** sum of passenger ride intervals (Start ride → End ride).
- **Total pickup time:** sum of all Going-to-Pickup intervals, including cancelled attempts.
- **Total idle time:** shift duration minus pickup time minus trip time.

Idle time consists of:
- Shift start until the first pickup initiation.
- Gaps between the end of one completed/cancelled attempt and the next pickup initiation.
- The period after the final completed/cancelled attempt until shift end.

It excludes pickup-approach and passenger-ride intervals.

The intended reconciliation is:

`Shift duration = Total pickup time + Total trip time + Total idle time`

This reconciliation must be validated, not forced by hiding or inventing time. The 04:00 cross-boundary trip attribution issue in Section 11 must be resolved before this calculation is frozen.

### Distance and counts

- **Total kilometres:** ending odometer minus starting odometer for the logical shift.
- **Completed rides:** count of completed ride records.
- **Cancelled rides/attempts:** count of cancelled pickup attempts.

Shift start/end odometer readings are required by the existing workflow. If a reading is missing or invalid because of a legacy, recovery or data-integrity case, show the distance as unavailable; do not estimate it from GPS.

Toll, parking, trip count, cancellation count and distance must retain their own meanings and must not be silently combined.

## 6. Timeline date and duration navigation

The proposed filter has three choices, in this order:

1. **Today** — selected by default whenever Timeline is opened.
2. **Week** — the current Monday–Sunday calendar week by default.
3. **By date** — lets the driver select a specific historical calendar date.

### Week behavior

- A week runs Monday through Sunday in the `Asia/Kolkata` business timezone.
- Each week is visually grouped into separate days.
- Horizontal swiping navigates to the adjacent historical/newer or older week. The selected week range remains visible.
- Historical weekly navigation must query and display actual persisted historical records. It must not merely relabel the current data with another date range.
- Provide a clear action to return to the current week.
- Changing a filter or swiping changes only the read query/projection. It never changes source records, shift assignments, timestamps or calculations.
- Empty days/weeks should have a clear empty state rather than fabricated activity.
- Date queries must be bounded and efficient for large histories.

### By date behavior

- Select one date and show the corresponding historical Timeline.
- Keep the selected date visible and provide previous/next date navigation where practical.
- The selected date must not be silently replaced by today's date on refresh or app restart.

### Date and shift grouping

Persisted UTC event instants and the existing Asia/Kolkata business-date/timezone context remain authoritative. The 04:00 logical-shift assignment rule must never be replaced by UI date arithmetic.

A product decision is still required for how a logical shift that spans midnight is visually placed in daily groups within a calendar week, and whether Today/By date use the calendar date or the persisted operational/business date as their primary day key. Until approved, do not split, reassign or duplicate the underlying shift/trip records to make a visual grouping fit.

## 7. Metric add/remove/change isolation and regression protection

Timeline metrics must follow the calculation ownership and versioning rules in the Architecture Foundation and Feature Module contracts.

Each metric definition must identify:
- Stable metric ID and owning capability.
- Calculation/rule version and effective-date policy.
- Formula, units, currency and precision/rounding rules where relevant.
- Required/optional inputs and their authoritative source contracts.
- Inclusion/exclusion rules and treatment of missing, invalid or incomplete data.
- Output meaning and formatting metadata.
- Historical-result/recalculation policy.
- Golden examples, boundary cases and regression fixtures.

Presentation configuration is separate from calculation definitions. It may control visibility, order, labels, compactness and formatting without changing business calculations.

Required isolation guarantees:
- Hiding or removing a metric from Timeline presentation must not delete source data, unregister its owning capability, or remove its calculation from another consumer.
- Adding a metric must not alter existing metrics or their source records.
- Reordering or redesigning metric presentation must not change calculation outputs.
- A formula change requires explicit review, a versioned rule/effective-date decision where applicable, before/after fixtures and regression tests.
- New source features must not silently change an existing metric. Cross-feature inputs require the approved, versioned integration contract.
- Existing metric outputs and shift-summary reconciliation must be checked against fixed datasets after every metric change.
- A missing source value must be represented honestly (for example unavailable/pending), not converted to zero unless zero is the actual recorded value and the metric contract says so.

The architecture should make display metrics independently addable/removable while preserving the stable application, repository and source-data wiring.

## 8. Location display and reverse geocoding

### 8.1 Immutable GPS evidence

The original event GPS snapshot remains authoritative evidence and follows `gps-event-fix-v1` and the existing location/time contract. Preserve coordinates, accuracy, provider/source, GPS fix timestamp, transition timestamp and policy version. Do not replace coordinates with an address or rewrite event timestamps when a readable label is obtained.

Timeline must not request GPS merely to render a historical event or resolve an address. GPS acquisition remains event-scoped to the approved driver actions.

### 8.2 Human-readable display

- Main Timeline: locality/area plus city, when supported by the geocoder result and GPS accuracy.
- Event inspection/detail: full available address and GPS details, including coordinates and accuracy where available.
- If no reliable readable result exists, show an honest state such as Location pending or Location unavailable.
- Do not claim a precise street, building or landmark when the evidence/provider result supports only a broader locality.
- Timeline remains map-free; reverse geocoding is text enrichment only.

### 8.3 Separate enrichment record

A reverse-geocoding result is optional enrichment linked to an immutable GPS snapshot. Store separately:
- Source event/GPS snapshot identity.
- Resolved locality, city and available address components.
- Provider/source and lookup timestamp.
- Resolution status and applicable result/version metadata.

The enrichment may be refreshed or replaced under an explicit provider/cache policy. The original GPS evidence and event timestamps may not be changed by that process.

### 8.4 Offline behavior and durable queue

- Event capture and business operations work offline and never wait for reverse geocoding.
- When no cached label exists and the device is offline, preserve the GPS snapshot and mark the enrichment pending/deferred.
- The pending enrichment work must survive app closure, WebView recreation, process death and device restart.
- When eligible network access returns, automatically schedule and process pending work; update the readable label without changing the original event.
- Retries must be idempotent and bounded, with backoff and a maximum retry interval. Provider failure must not cause a tight retry loop.
- Deduplicate equivalent lookups and reuse cached results where safe. Cache matching must respect coordinate precision/accuracy and must not merge materially different locations.
- Batch lookups when the selected provider supports it and doing so reduces requests; do not send the full business database for a location lookup.
- Stop scheduling work when no eligible pending enrichment remains.

### 8.5 User-controlled network access

The existing Internet Access Control Contract takes precedence:
- Reverse geocoding is optional and must use the shared network capability/policy gateway.
- The master Internet Access policy defaults disabled and must be explicitly enabled by the user.
- The reverse-geocoding capability must be registered/enabled under that policy and its purpose/data scope must be explained as required by the network contract.
- Connectivity becoming available does not silently enable the user's network policy or the capability.
- If policy is disabled, leave enrichment pending/deferred and make no request. If policy is enabled but connectivity is absent, defer safely.
- Turning network access off stops eligible new requests and safely retains pending work.

### 8.6 Battery- and data-conscious automatic processing

Automatic resolution must not mean continuous background activity:
- Never start continuous GPS, a location listener, periodic coordinate sampling or GPS polling for geocoding.
- Never continuously poll connectivity or keep a wake lock solely for reverse geocoding.
- Android should use unique, persistent, network-constrained scheduled work (WorkManager or the platform-approved equivalent), with bounded batches, deduplication and backoff. Do not create one independent repeating worker per event.
- Respect Doze, battery saver, background restrictions, OEM policies and OS scheduling. Work may be deferred; never promise instant or unconditional background execution.
- PWA processing may run while the app is active/resumed and may use browser-supported background facilities where available. Browser lifecycle rules do not guarantee execution while the browser is closed or suspended; retry on the next eligible foreground/resume opportunity.
- Perform network and storage work off the UI/main thread. Do not block a shift, pickup, ride, cancellation, fare or odometer operation.
- When the queue is empty, no periodic geocoding work should remain scheduled.

### 8.7 Honest status

Distinguish at least:
- Resolved.
- Pending because network is unavailable.
- Deferred because Internet Access is disabled.
- Waiting for scheduled execution/OS allowance.
- Provider temporarily unavailable/retry scheduled.
- Unavailable because source GPS evidence is missing or unusable.

Do not display an unresolved location as if it were a confirmed address.

## 9. Cross-platform behavior

The PWA and installed Android application must use the same Timeline domain rules, event ordering, shift grouping, metric contracts and date semantics.

- Browser-only PWA reads from the IndexedDB-authoritative repository.
- Installed Android reads through the Room-authoritative application/repository boundary.
- Android WebView and native overlay must not create separate Timeline business histories or bypass Room.
- Platform-specific scheduling and persistence adapters may differ, but user-visible meaning and business calculations must remain consistent.
- Platform limitations (especially PWA background execution and Android/OEM scheduling) must be represented honestly.

## 10. Query, projection and performance requirements

- Timeline queries should be read-only and scoped to the selected day/week/date.
- Use stable event identity, persisted event instants, source revisions and deterministic tie-breaking for events with equal timestamps.
- Delayed/replayed source events must not create duplicate Timeline entries.
- A changed authoritative source record invalidates/rebuilds the affected projection and dependent metrics; it does not create a second correction path in Timeline.
- Large histories must use bounded queries/pagination or equivalent indexing. Do not load the complete lifetime history for a one-day view.
- Projection caches, if introduced, must be versioned, disposable and rebuildable. Cache invalidation must never delete authoritative records.
- Incomplete/pending source workflows must be represented honestly and must not appear as completed rides or finalized summaries.

## 11. Open design decisions to resolve before freeze

These are intentionally not decided by this proposal:

1. **Calendar-day versus operational-day grouping:** How should Today, By date and the daily groups within Week place shifts/events around midnight and the 04:00 logical boundary? Existing logical-shift IDs and trip assignment remain authoritative. Do not split/reassign source records.
2. **Trip crossing the 04:00 boundary and summary reconciliation:** The existing workflow assigns a trip wholly to the logical shift in which it was created, while logical shifts rotate at 04:00. A pickup/ride interval can therefore extend beyond the logical shift's end. Decide whether summary time is attributed by interval overlap across logical shifts or another explicit rule. The shift-duration reconciliation must not be claimed until this is resolved; do not silently split the trip record or double-count its duration.
3. **Geocoder provider and cache policy:** Provider, locale, cache key/precision, cache freshness/refresh, provider attribution and retention must be selected through a privacy/cost review. This proposal does not select a vendor.
4. **Metric catalogue:** The initial display metrics are listed in Sections 5 and 7, but future additions/removals and any additional financial or performance metrics require separate product approval and calculation contracts.
5. **Automatic 04:00 boundary presentation:** Confirm the exact visual label and placement for the system-generated logical-shift boundary and deferred odometer confirmation.

No unresolved item should be guessed during implementation.

## 12. Required verification before any future implementation approval

This is a proposed acceptance checklist, not evidence that implementation or tests already exist.

### Event and shift correctness
- Verify deterministic ordering, stable IDs, duplicate/delayed delivery, and correction/replay behavior.
- Verify shift start/end, pickup initiation, Start ride, End ride and cancellation blocks.
- Verify multiple shifts, live/final timer continuity, app restart and clock-integrity limitations.
- Verify the 04:00 boundary, continuous Online session, active-trip deferral and trip assignment.
- Verify cross-midnight and cross-boundary cases after the open attribution/grouping rules are approved.

### Summary and metric regression
- Verify fare includes completed fares plus cancellation fees; toll and parking remain separate.
- Verify odometer difference, completed/cancelled counts, trip time, pickup time and idle time.
- Verify missing/invalid source values are not fabricated.
- Verify metric add, hide, remove, reorder and presentation redesign do not alter other metrics or source records.
- Verify calculation version changes against golden fixtures, historical-result policy and all dependent consumers.

### Date/week navigation
- Verify Today is the default.
- Verify Monday–Sunday week boundaries in Asia/Kolkata.
- Verify swiping to older/newer weeks queries actual historical records and the selected range is correct.
- Verify separate daily groups, empty days/weeks, By date historical selection, previous/next navigation and return to current week.
- Verify app restart and data refresh preserve the selected historical period where appropriate.

### Location and network
- Verify location labels are derived from the correct source event and never replace GPS evidence.
- Verify cached result, offline pending state, policy-disabled deferral, reconnect scheduling, provider failure, deduplication and retry idempotency.
- Verify no continuous GPS, connectivity polling, unbounded retries, wake locks or per-event repeating workers.
- Verify Android Doze/battery restrictions and reboot behavior; record OEM/device limits separately.
- Verify PWA foreground/resume retries without claiming guaranteed closed-browser execution.
- Verify no geocoding request bypasses the shared Internet Access gateway or transmits unrelated business data.
- Verify geocoding failure never blocks a driver operation or changes a recorded event.

### Platform, persistence and recovery
- Verify Android Room and browser IndexedDB remain the respective runtime authorities.
- Verify Timeline projection recovery/rebuild after app restart, WebView recreation, process death and migration.
- Verify historical records and source ownership remain intact across supported migrations and backup/restore.
- Verify PWA and Android produce equivalent event ordering, grouping and metric results from equivalent source data.

## 13. Non-authorization and change control

This document records the proposed Timeline design only.

It does **not** authorize:
- Timeline UI or navigation implementation.
- Domain/application code, query services or projection code.
- Database schema, indexes, migrations or persisted metric definitions.
- Android workers/services, PWA background behavior or geocoder integration.
- Changes to GPS capture, shift/trip workflows, network policy, backup/restore or existing calculations.
- Freezing the Timeline design or treating unresolved decisions as approved.

Any future implementation requires the user to approve the completed product design, resolve the open decisions, review the implementation plan and explicitly authorize the implementation scope.
