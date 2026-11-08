# Timeline Product Design

**Status: Approved and frozen product-design baseline.**

**Design approval: Complete Timeline product baseline frozen in the governing Architecture contract; the mobile visual direction and shift-summary treatment were explicitly approved on 5 November 2026.**
**Implementation authorization: Granted by the user's explicit implementation instruction on 8 November 2026.**
**Scope: Read-only Timeline feature registration, authoritative Work-event query, projection, screen, and date navigation.**

This document is the frozen product-design baseline for Timeline in the single-driver Sam Travels application. Its event presentation, logical-shift and calendar grouping, interval rules, summaries, and date navigation are implementation requirements. The implementation authorization does not authorize new business records, a second event store, maps, map tiles, automatic GPS collection, reverse-geocoding activation, hosted-provider credentials, or a persistent Timeline cache. Optional location enrichment remains deferred behind the existing network-access and privacy gates. Existing normative architecture and feature-ownership contracts remain authoritative.

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
- [Timeline Mockup Visual Fidelity Contract](TIMELINE_MOCKUP_VISUAL_FIDELITY_CONTRACT.md) — the approved mockup is the PWA main app's visual source of truth; original-reference preservation and visual regression requirements.

If this proposal appears to conflict with an existing normative contract, the existing contract remains authoritative. Resolve the conflict through an explicitly reviewed contract change before implementation; do not silently reinterpret the existing rule.

## 3. Timeline architecture

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

### Implementation source audit — initial read-only slice

The first implementation uses only the authoritative Work driver event log through the Work workflow's public event-list query. The shared Timeline projection remains disposable and is rebuilt for each read; no Timeline business data or cache is persisted.

| Timeline content | Current authoritative source / implementation status |
|---|---|
| Shift boundaries, pickup creation, ride start/end and cancellation | Work driver event log; available through the same Work workflow repository on PWA (Dexie) and Android (Room). |
| Pickup and passenger-trip intervals, ride/cancellation counts, logical-shift and calendar grouping | Derived by the existing pure Timeline projection from v2 Work events; no new lifecycle authority is introduced. |
| Fare, cancellation fee, toll and parking amounts | No complete public trip-finance read contract is currently wired to Timeline. Values remain explicitly unavailable; no loan/payment records are misused as trip revenue. |
| Odometer/business distance | No public odometer evidence query is currently wired to Timeline. Distance remains unavailable. |
| Human-readable location names | GPS evidence is present on source events, but no reverse-geocoding integration is activated. The screen identifies captured/unavailable location evidence without displaying invented place names. |
| Date/week navigation | Applied to the projection's Asia/Kolkata calendar-day index; logical shifts remain governed by the separate 04:00 boundary. The current Work public query exposes a full event snapshot, so source-level period scoping/pagination remains a known performance gap for very large histories. |

The existing Log Book event integration currently validates the legacy event set, while the current v2 Work lifecycle includes trip_create, start_ride, end_ride and cancel_ride. Timeline therefore reads the authoritative Work event log directly through the public Work workflow query; it does not rely on the incomplete Log Book consumer projection. This does not change Log Book ownership or mutate its records. Finance and odometer source adapters can be added later through their owning public query contracts without changing Timeline's presentation contract.

## 4. Event-wise presentation requirements

### 4.0 Approved mockup is the PWA visual source of truth

The approved mobile visual direction is preserved as the versioned SVG reference [sam-travels-timeline-approved-direction-v1.svg](reference/timeline-mockup/sam-travels-timeline-approved-direction-v1.svg), with provenance and checksum in its [v1 manifest](reference/timeline-mockup/manifest-v1.md). The reference was authored from the user's detailed chat mockup and the review direction explicitly approved on 5 November 2026; the earlier discussion supplied text rather than an existing image file. This artifact is the approved repository visual baseline, not a claim that an earlier uploaded screenshot was recovered.

The approved direction includes compact individually separated ride containers; pickup journeys as distinct connectors outside ride cards; restrained cancellation events; stronger shift start/end boundaries; shift-summary metric panels; and fixed bottom navigation labelled exactly **Drive · Timeline · Performance · Admin**. Shift summaries must distinguish confirmed values from unavailable or unresolved values. In the supplied example Shift 1 total fare is ₹1,120 (₹450 + ₹620 + ₹50 cancellation fee); its pickup/idle values remain unresolved pending interval reconciliation. Shift 2's supplied time values reconcile. Missing toll, parking and odometer values remain unavailable rather than fabricated.

The binding preservation, responsive-adaptation, measurement, change-control and visual-regression requirements are defined in the [Timeline Mockup Visual Fidelity Contract](TIMELINE_MOCKUP_VISUAL_FIDELITY_CONTRACT.md). The approved v1 artifact is immutable; future approved changes require a new versioned reference, manifest update, retained prior baseline and explicit approval. The approved reference and this document together form the frozen Timeline product-design baseline. Implementation is authorized within the scope stated at the top of this document. This authorization is constrained by the existing feature-extension, public-contract, authority-allocation, persistence, recovery and platform contracts; it does not authorize Timeline to recreate or take ownership of Work/Shift, Driver Workflow, Log Book/Trips, Finance, odometer or GPS capabilities.

The requirements below define the event content and semantic behavior; they do not authorize visual deviations from the approved reference.

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

The automatic 04:00 boundary is shown as a compact, neutral system divider labelled **`SHIFT ROTATED · 04:00`**. It separates the prior logical shift from the new logical-shift segment and includes a short secondary note that the Online session continued. It is not styled or counted as a driver-initiated Shift Started/Shift Ended action, and it carries no fabricated GPS location. If the app reconciles the boundary after being closed/offline, display the effective 04:00 boundary time, not the later recovery time. If odometer confirmation is deferred by an active trip, show a small **Odometer confirmation pending** status on the new shift until the driver completes it; the confirmation itself is a separate event at its actual completion time.

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

The intended reconciliation for each logical shift is:

`Logical-shift duration = allocated pickup time + allocated passenger-trip time + idle time`

For intervals crossing a logical-shift boundary, allocate elapsed time by actual interval overlap with each logical shift's time window. Idle time is the remaining, non-overlapping portion of that logical shift's duration after pickup and passenger-trip intervals have been allocated. Validate that the three components reconcile exactly (subject only to the documented timestamp precision); never hide, invent or double-count time. Trip/attempt counts and financial ownership remain attached to the originating logical shift as specified in Section 6.2.

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

**Approved calendar-day grouping rule:** Today, Week and By date use ordinary `Asia/Kolkata` calendar dates, from 00:00 to 00:00, as their day keys. Week is Monday through Sunday, with each calendar date shown as its own daily group. Events are placed under the calendar date of their event timestamp in `Asia/Kolkata`; they are not moved to the date on which the logical shift began.

A logical shift may span midnight. Its section may therefore continue across consecutive calendar-day groups and must be visibly identified as a continuation of the same logical shift (using the same stable logical-shift identity and without fabricating another shift start). Do not duplicate the underlying event or business record merely to show the continuation. Today and By date show the events belonging to the selected calendar date, with enough shift context to make a continued shift understandable. The 04:00 logical-shift rotation remains a separate rule from midnight calendar grouping: at 04:00 the existing workflow creates the next logical-shift segment. A shift summary is shown exactly once, only when that logical shift ends; it must not be repeated in every calendar-day group the shift spans.

### 6.2 Proposed cross-04:00 interval and ownership reconciliation

A pickup or passenger ride may begin before 04:00 and finish after the 04:00 logical-shift rotation. Preserve one authoritative trip/attempt record and its stable ID; do not split it into duplicate trips. Apply these ownership and time-allocation rules:

- The trip/attempt, completed-ride count, fare, cancellation fee and other trip-owned financial values remain owned by the logical shift active when that trip/attempt was created, consistent with the Driver Workflow contract.
- Elapsed pickup time is allocated to each logical shift according to the actual overlap between the pickup interval and that shift's time window.
- Elapsed passenger-trip time (Start ride → End ride) is allocated in the same way, by interval overlap.
- A shift receives only the elapsed minutes that fall within its own time window. The interval is counted once across all overlapping logical shifts; there is no duplication.
- Idle time for each logical shift is the complement of its allocated pickup and passenger-trip intervals within that shift's duration.
- Counts and money are not apportioned by elapsed minutes. Therefore, a later logical shift can legitimately show allocated passenger-trip time but zero completed rides and no fare for that trip when the trip record is owned by the preceding shift. The Timeline must make the distinction between time allocation and record/financial ownership clear.

**Example:** A passenger ride runs from 03:50 to 04:20. The originating logical shift receives 10 minutes of passenger-trip time, while the next logical shift receives 20 minutes. There is one trip record, one completed-ride count and one fare, all owned by the originating shift. The later shift's summary includes its 20 minutes of allocated passenger-trip time but does not claim the ride count or fare. Apply the same overlap method to a pickup interval crossing 04:00, including a cancelled attempt. Boundary instants must be handled consistently so a single instant or duration is never counted twice.

Treat every allocated interval as half-open: [start, end). A logical-shift window uses the same convention, so an instant exactly at 04:00 belongs to the new shift window and contributes no duration to both windows. For an interval and a shift window, allocated duration is the non-negative overlap between their endpoints; each elapsed instant belongs to at most one allocation.

Pickup and passenger-trip intervals must not overlap within a valid workflow. If source events produce overlapping, reversed, or otherwise impossible intervals, mark the affected calculation invalid/needs-attention and preserve the source evidence; do not double-count, clamp silently, or manufacture a negative idle duration. Idle time is the complement of the union of valid allocated pickup and passenger intervals within the logical-shift window. The reconciliation must hold exactly at the source timestamp precision, subject only to an explicitly documented display-rounding rule.

The per-shift reconciliation remains:

`Logical-shift duration = allocated pickup time + allocated passenger-trip time + idle time`

This is a time-accounting rule only; it does not change source-record ownership, trip assignment, lifecycle transitions, or the existing 04:00 workflow.

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

Presentation configuration is separate from calculation definitions. It may control visibility, order, labels, compactness, grouping, formatting and layout without changing business calculations.

### 7.1 Extensible metric and summary contract

The ten v1 metrics below are the initial approved baseline, **not a permanent ceiling or a hardcoded summary-panel schema**. The Timeline must remain compatible with later additions, removals, reordering, regrouping and replacement of presentation components.

- Give every metric a stable, namespaced ID and an independently versioned definition. A metric definition owns its formula, inputs, units, currency, precision, result-state semantics, dependencies, historical policy and golden fixtures; it does not own screen layout.
- Expose metrics through a versioned registry/catalogue or equivalent public extension contract. The registry must validate duplicate IDs, missing dependencies, unsupported versions and invalid ownership. Consumers address metrics by stable ID, never by array position or display label.
- Keep metric calculation/output contracts independent from summary-panel presentation. A summary panel consumes a collection of typed metric results and presentation metadata; it must not contain metric formulas or assume a fixed number/order of metrics.
- A new metric may be added without changing existing metric IDs, formulas, outputs, source ownership, persistence records or consumers. Adding/removing/hiding/reordering a metric must be independently testable.
- Presentation configuration must be separately versioned and disposable. It may select which registered metrics appear, their order/group, label, formatting and responsive arrangement. Unknown or unsupported presentation metadata must degrade safely without corrupting metric results.
- A future layout may replace the current summary panel, split it into sections, add collapsible groups or introduce new presentation components while consuming the same metric-result contracts. A visual redesign must not require rewriting calculation or source-data wiring.
- Metric definitions may declare dependencies on other published metric contracts, but no hidden dependency on another metric's rendered component, display label or position is permitted. Dependency cycles are rejected.
- New event types and Timeline sections must use independently registered, versioned presentation contracts and source-owned public event/query contracts. Event renderers must not become owners of source records. An unrecognized event type must remain visible through a safe generic/unsupported presentation rather than being silently dropped.
- New Timeline capabilities must be additive and isolated behind stable public contracts. They must not require changing unrelated Work/Shift, Log Book/Trips, Finance or other feature internals. Any source-domain or cross-feature change still requires its own product and architecture approval.
- Version the metric catalogue, presentation configuration and projection independently where they evolve independently. Migration/compatibility rules must preserve old stored source data and allow disposable projections/configuration to be rebuilt or safely defaulted.
- A new metric or event feature requires an explicit product decision and its own calculation/event contract, but it must not require redesigning or replacing the stable Timeline foundation.

Required isolation guarantees:
- Hiding or removing a metric from Timeline presentation must not delete source data, unregister its owning capability, or remove its calculation from another consumer.
- Adding a metric must not alter existing metrics or their source records.
- Reordering or redesigning metric presentation must not change calculation outputs.
- Changing visibility, order, labels, formatting, grouping, filters or layout must not mutate source records, timestamps, ownership, stored calculations, historical results or calculation versions. Presentation configuration is a disposable/read-model concern, never a business fact.
- A formula change requires explicit review, a versioned rule/effective-date decision where applicable, before/after fixtures and regression tests.
- New source features must not silently change an existing metric. Cross-feature inputs require the approved, versioned integration contract.
- Existing metric outputs and shift-summary reconciliation must be checked against fixed datasets after every metric change.
- A missing source value must be represented honestly (for example unavailable/pending), not converted to zero unless zero is the actual recorded value and the metric contract says so.
- Preserve a typed/explicit result state alongside every displayed metric: known (including known zero), unavailable/unknown, pending/incomplete, not applicable, or invalid/needs-attention. These states are not interchangeable.
- A count or sum may be zero when the selected authoritative scope has been completely read and contains no qualifying records, but only where that metric's calculation contract defines the empty set as zero. Missing or pending source records must not be mistaken for an empty complete set.
- If a required input is missing, invalid or pending, do not display the aggregate as a final complete total. A partial aggregate must be visibly labelled partial and must not be confused with a final shift summary.
- Examples: zero completed rides is a known zero when the shift's trip records are complete; business kilometres are unavailable when either authoritative odometer reading is missing/invalid; an unresolved or unreconciled shift summary remains pending rather than displaying zero totals.

The architecture should make display metrics independently addable/removable while preserving the stable application, repository and source-data wiring.

### Approved initial Timeline metric catalogue (v1)

The initial v1 catalogue contains the following ten shift-summary metrics. It is an extensible baseline, not a maximum; later additions require explicit product approval and their own independently versioned calculation contract:

| Stable metric ID | Display meaning and calculation |
|---|---|
| `shift_duration` | Elapsed time between the logical shift's authoritative start and end instants. |
| `pickup_time` | Sum of pickup-approach intervals allocated to this logical shift by actual interval overlap, including cancelled attempts. |
| `passenger_trip_time` | Sum of passenger ride intervals allocated to this logical shift by actual interval overlap. |
| `idle_time` | Logical-shift duration minus allocated pickup time and passenger-trip time. |
| `total_fare` | Completed-ride fares plus cancellation fees owned by this logical shift; toll and parking excluded. |
| `toll_total` | Sum of toll amounts owned by this logical shift, displayed separately. |
| `parking_total` | Sum of parking amounts owned by this logical shift, displayed separately. |
| `business_km` | Ending shift odometer minus starting shift odometer; unavailable if either authoritative reading is missing/invalid. |
| `completed_ride_count` | Count of completed ride records owned by this logical shift. |
| `cancelled_attempt_count` | Count of cancelled pickup attempts owned by this logical shift. |

All money remains in INR and is summed from authoritative source amounts without silently rounding individual entries. Time is calculated from persisted instants at the source timestamp precision; display formatting must not change the calculation. Cross-04:00 time allocation and record/financial ownership follow Section 6.2. No derived net-income, fuel, profitability, or distance-from-GPS metric is part of this initial Timeline catalogue.

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

### 8.3 Selected provider and deployment decision

**Selected primary provider: Geoapify Reverse Geocoding API.** Geoapify is the selected initial hosted provider for Sam Travels' text-only location enrichment. Its reverse endpoint accepts latitude/longitude and can return structured address components, including locality, city, postcode and formatted address. Use the dedicated reverse endpoint, not forward geocoding or a map/tiles product. The provider is selected as a deployment choice behind the shared provider-independent Location Resolution interface; Timeline and source features must not depend directly on Geoapify SDKs, response types or URLs.

Provider documentation:
- [Geoapify Reverse Geocoding API](https://apidocs.geoapify.com/docs/geocoding/reverse-geocoding/)
- [Geoapify pricing](https://www.geoapify.com/pricing/)
- [Geoapify terms and conditions](https://www.geoapify.com/terms-and-conditions/)
- [Geoapify pricing details](https://www.geoapify.com/pricing-details/)

**Why Geoapify was selected:** its published documentation provides a dedicated reverse-geocoding API with address components and language selection; its published commercial-use guidance permits production use on the Free plan within its quota; and its published guidance states that API results may be stored, subject to the applicable terms and required attribution. This aligns better with Sam Travels' durable, offline-first enrichment cache than services whose result-retention rules are materially restrictive. The API is a hosted service and has published quota/rate limits and paid tiers for growth.

**Initial cost posture:** do not authorize recurring spend by selecting the provider. The currently published Free plan lists 3,000 credits per day, with a simple reverse-geocoding request costing one credit, and no credit card required. Treat this as a planning reference, not a guaranteed future price or quota. Start with a hard application-side daily request budget no higher than the then-current free allowance, deduplicate requests, reuse permitted cached results and expose usage/failure diagnostics. Do not automatically upgrade, incur overage, or enable a paid plan. Any paid tier, recurring spend or higher budget requires the operator's explicit approval after checking current pricing. Recheck quota, rate limits, price and plan terms immediately before production activation.

**India acceptance gate:** Geoapify documents worldwide geocoding, but documentation alone does not prove the quality of every Indian locality, road, building or rural address. Before enabling production enrichment, run a bounded representative acceptance sample across the actual operating areas in India (urban, suburban and rural where relevant). Evaluate locality/city correctness, address specificity, language/script behavior, missing results, ambiguous matches and GPS-accuracy-aware display. Do not invent a street/building label when the result only supports a broader locality. If the sample is inadequate, keep enrichment disabled and return to provider review; do not silently substitute another provider.

**Storage and attribution obligations:** Geoapify's published guidance says its results may be stored and requires OpenStreetMap attribution. Geoapify attribution is also mandatory on the Free plan, including a follow-link near the information provided by the service. The UI must therefore display clear, legible attribution adjacent to Geoapify-derived location information (including the Geoapify follow-link while on the Free plan) and the required OpenStreetMap attribution. Reconfirm the exact attribution wording, placement and any plan-specific obligations against the live provider terms before activation. Store only the minimum enrichment fields needed by Sam Travels; preserve provider/source metadata and lookup time. Provider storage permission does not override Sam Travels' own retention, privacy, backup or deletion rules.

**Privacy and credential safeguards:** a reverse lookup sends event GPS coordinates to Geoapify. Before activation, disclose that data flow in the app's network-access purpose/consent information and complete the operator's privacy/data-processing review, including current Geoapify privacy terms, subprocessors, processing locations, retention, security and applicable Indian legal requirements. Do not send trip details, fares, driver identity, customer data or the business database—only the minimum coordinate/query fields required. Never commit a production API key to the repository or treat a key embedded in a distributed PWA/Android package as secret. The deployment must establish a safe credential model (prefer a controlled server-side broker where available, or tightly restricted, quota-limited client credentials with monitoring and rotation) before activation.

**Rate, budget and failure controls:** use a conservative configurable request rate below the provider's current account limit, a strict daily budget, request deduplication, bounded batches, exponential backoff with jitter, and a circuit-breaker/cooldown for provider failures or quota responses. Respect HTTP 429 and provider retry guidance. No unbounded retries, no per-event repeating workers and no provider request on every render. If quota is exhausted, the provider is unavailable, credentials fail, the budget is reached or the user disables Internet Access, leave the enrichment pending/deferred and preserve all original GPS evidence. No paid fallback or automatic provider switch is authorized.

**Replaceability and future provider changes:** Geoapify is the selected primary, not a vendor lock-in. Keep a normalized internal result contract and provider adapter; provider-specific response fields, attribution metadata, error codes and credentials stay inside that adapter. A future provider replacement requires a reviewed decision, current terms/pricing/privacy assessment, India acceptance testing and an explicit documentation update. Do not silently switch providers.

**Activation remains separate from selection:** this document selects Geoapify for the product design, but does not claim that a Geoapify account, API key, billing setup, backend broker, provider configuration or integration exists. None has been created or enabled by this documentation change. Production activation remains blocked until the operator completes the India acceptance sample, privacy/data-processing review, credential setup, attribution implementation plan and explicit usage-budget approval. Until then, reverse geocoding remains unconfigured and unavailable/deferred; local GPS evidence capture and Timeline remain fully usable.

Do **not** use the public OpenStreetMap Nominatim shared endpoint as Sam Travels' production background queue provider. Its published policy imposes a maximum of one request per second, requires identifying request headers and attribution, requires caching, and strongly discourages periodic app requests/background bulk geocoding; it also warns that access may be withdrawn. These constraints make it a poor default for durable automatic queue processing. A separately operated/self-hosted Nominatim instance is not selected. See the [OpenStreetMap Foundation Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/).

### 8.4 Separate enrichment record

A reverse-geocoding result is optional enrichment linked to an immutable GPS snapshot. Store separately:
- Source event/GPS snapshot identity.
- Resolved locality, city and available address components.
- Provider/source and lookup timestamp.
- Resolution status and applicable result/version metadata.

The enrichment may be refreshed or replaced under an explicit provider/cache policy. The original GPS evidence and event timestamps may not be changed by that process.

### 8.5 Offline behavior and durable queue

- Event capture and business operations work offline and never wait for reverse geocoding.
- When no cached label exists and the device is offline, preserve the GPS snapshot and mark the enrichment pending/deferred.
- The pending enrichment work must survive app closure, WebView recreation, process death and device restart.
- When eligible network access returns, automatically schedule and process pending work; update the readable label without changing the original event.
- Retries must be idempotent and bounded, with backoff and a maximum retry interval. Provider failure must not cause a tight retry loop.
- Deduplicate equivalent lookups and reuse cached results where safe. Cache matching must respect coordinate precision/accuracy and must not merge materially different locations.
- Batch lookups when the selected provider supports it and doing so reduces requests; do not send the full business database for a location lookup.
- Stop scheduling work when no eligible pending enrichment remains.

### 8.6 User-controlled network access

The existing Internet Access Control Contract takes precedence:
- Reverse geocoding is optional and must use the shared network capability/policy gateway.
- The master Internet Access policy defaults disabled and must be explicitly enabled by the user.
- The reverse-geocoding capability must be registered/enabled under that policy and its purpose/data scope must be explained as required by the network contract.
- Connectivity becoming available does not silently enable the user's network policy or the capability.
- If policy is disabled, leave enrichment pending/deferred and make no request. If policy is enabled but connectivity is absent, defer safely.
- Turning network access off stops eligible new requests and safely retains pending work.

### 8.7 Battery- and data-conscious automatic processing

Automatic resolution must not mean continuous background activity:
- Never start continuous GPS, a location listener, periodic coordinate sampling or GPS polling for geocoding.
- Never continuously poll connectivity or keep a wake lock solely for reverse geocoding.
- Android should use unique, persistent, network-constrained scheduled work (WorkManager or the platform-approved equivalent), with bounded batches, deduplication and backoff. Do not create one independent repeating worker per event.
- Respect Doze, battery saver, background restrictions, OEM policies and OS scheduling. Work may be deferred; never promise instant or unconditional background execution.
- PWA processing may run while the app is active/resumed and may use browser-supported background facilities where available. Browser lifecycle rules do not guarantee execution while the browser is closed or suspended; retry on the next eligible foreground/resume opportunity.
- Perform network and storage work off the UI/main thread. Do not block a shift, pickup, ride, cancellation, fare or odometer operation.
- When the queue is empty, no periodic geocoding work should remain scheduled.

### 8.8 Honest status

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
- Order events first by immutable occurrence instant, then by the authoritative source-defined event sequence/order when available, and finally by stable event ID as the deterministic tie-breaker. Persisted source ordering is not replaced by receive, sync, recovery or render time.
- Equal-timestamp events must retain the same order across refresh, replay, pagination, restart, PWA and Android. Do not rewrite timestamps to force an ordering; preserve event identity and sequence separately.
- Keep occurred-at, received-at, persisted-at and recovered-at distinct. Delayed delivery or recovery must not move an event to a different historical time group.
- Use stable event identity and source revisions for deduplication and projection invalidation; the ordering rule above remains authoritative for display order.
- Delayed/replayed source events must not create duplicate Timeline entries.
- A changed authoritative source record invalidates/rebuilds the affected projection and dependent metrics; it does not create a second correction path in Timeline.
- Large histories must use bounded queries/pagination or equivalent indexing. Do not load the complete lifetime history for a one-day view.
- Projection caches, if introduced, must be versioned, disposable and rebuildable. Cache invalidation must never delete authoritative records.
- Incomplete/pending source workflows must be represented honestly and must not appear as completed rides or finalized summaries.

## 11. Decision closure and change control

The previously open Timeline-specific product decisions are now recorded as follows:

1. **Geocoding provider:** Geoapify Reverse Geocoding API is selected as the primary hosted provider behind the shared replaceable adapter, subject to the India-quality, privacy, credential, attribution and budget activation gates in Section 8.3. No account, key, integration, paid plan or recurring spend is created or authorized by this design decision. The public shared Nominatim endpoint is not selected for automatic background processing.
2. **Initial metric catalogue:** The ten stable v1 metric IDs listed in Section 7 form the approved initial baseline, not a permanent limit. Future metrics and summary sections may be added through the extensible metric/presentation contracts in Section 7.1, with explicit product approval and independent calculation versioning.
3. **04:00 boundary presentation:** A neutral system divider labelled `SHIFT ROTATED · 04:00`, with an Online-session-continuity note and a separate pending-odometer status when applicable; it is not a fabricated driver action or GPS event.

The product-design decisions recorded here, together with the approved visual reference and the governing Architecture contract, form the frozen Timeline product baseline. Geoapify remains the selected primary hosted provider behind the replaceable interface; credentials, India acceptance, privacy/contract review, attribution and usage-budget approval remain deployment prerequisites before reverse geocoding is enabled. Provider selection does not authorize activation or recurring spend.

## 12. Required verification before implementation/release acceptance

This is the acceptance checklist for the authorized implementation and its release verification. It is not evidence that implementation, tests or acceptance gates have already passed.

### Mockup visual fidelity
- Verify the currently approved versioned SVG reference is committed with a matching SHA-256 checksum and documented viewport/state/provenance; retain all prior approved versions when a later reference is authorized.
- Verify the PWA main app against the reference at the same viewport using side-by-side and overlay/difference review; retain evidence tied to the exact build/commit and reference checksum.
- Verify narrower/wider viewport adaptations preserve the same composition, event order, grouping, hierarchy and visual language without clipping, overlap or hiding essential information.
- Do not mark visual fidelity verified while the original reference artifact is absent.

### Event and shift correctness
- Verify deterministic ordering by occurrence instant, source-defined sequence and stable event ID, including equal timestamps, delayed delivery, replay, pagination and recovery; prove receive/recovery time never replaces occurrence time.
- Verify persisted UTC instants, Asia/Kolkata business-date context, active duration after restart, clock rollback/forward, timezone/display changes and explicit uncertainty when offline reboot clock changes make exact elapsed time unknowable.
- Verify shift start/end, pickup initiation, Start ride, End ride and cancellation blocks.
- Verify multiple shifts, live/final timer continuity, app restart and clock-integrity limitations.
- Verify the 04:00 boundary, continuous Online session, active-trip deferral and trip assignment.
- Verify cross-midnight and cross-boundary cases against the proposed grouping, ownership and interval-allocation rules in Sections 6 and 6.2.

### Summary and metric regression
- Verify fare includes completed fares plus cancellation fees; toll and parking remain separate.
- Verify odometer difference, completed/cancelled counts, trip time, pickup time and idle time.
- Verify missing/invalid source values are not fabricated.
- Test known zero, complete-empty scope, unavailable/unknown, pending/incomplete, not-applicable and invalid/needs-attention independently; prove missing/null/invalid inputs never become zero and incomplete aggregates are not shown as final.
- Verify exact half-open interval allocation at, before and after 04:00; no instant or duration is allocated twice, pickup/passenger intervals do not overlap, invalid overlaps are surfaced, and idle time is the complement of the union of valid intervals.
- Verify metric add, hide, remove, reorder, grouping, new event types, new summary sections and full presentation redesign through extension contracts do not alter existing metrics, source records or unrelated feature wiring.
- Verify presentation-only changes to visibility, labels, formatting, grouping, filters and layout leave source snapshots, timestamps, ownership, calculation versions, outputs and historical results unchanged; verify old presentation/configuration versions safely default or migrate.
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

## 12.1 Timeline Runtime Conformance and Evidence Matrix

This matrix makes the six architecture-quality requirements independently traceable for Timeline. It maps Timeline acceptance to the existing normative contracts; it does not create competing persistence, transaction, lifecycle, migration, backup/restore, or platform rules. Where a shared contract is stricter than this matrix, the shared contract wins.

**Status meanings**
- **Documented** — the requirement and its verification/evidence criteria are recorded, but Timeline-specific implementation or passing test evidence has not been established.
- **Implemented** — the relevant Timeline runtime behavior and automated checks exist in the repository, but the required CI/device evidence has not yet been established for this matrix.
- **CI-verified** — the relevant automated enforcement and tests have passed in a recorded required CI run for the current implementation revision.
- **Device-verified** — the relevant physical-device acceptance has passed and its device/OS/build evidence is recorded.
- A row may advance only when its evidence is linked to the exact tested commit/build. A passing unrelated or older shared-foundation run does not automatically verify Timeline-specific behavior.

| Requirement | Authoritative governing contract(s) | Required automated test or enforcement check | Evidence required to mark passed | Verification class | Current status |
|---|---|---|---|---|---|
| **1. Automated enforcement of ownership boundaries** | [Architecture](../ARCHITECTURE.md); [Architecture Foundation Contract](ARCHITECTURE_FOUNDATION_CONTRACT.md); [Feature Module and Extension Contract](FEATURE_MODULE_CONTRACT.md); [Architecture Enforcement and Verification](ARCHITECTURE_ENFORCEMENT.md) | CI architecture checks must reject Timeline imports of private Work/Shift or Log Book/Trips persistence, direct writes to source-owned records, dependency cycles, unapproved cross-feature access, and duplicate authoritative ownership. Verify Timeline accesses source data only through versioned public application queries/contracts or published events. | Required architecture job result for the exact commit; machine-readable or reviewable check output identifying the enforced Timeline boundaries; negative fixtures proving prohibited imports/writes fail; positive fixtures proving approved public-contract access passes. | **CI check** (static enforcement), supplemented by runtime contract tests where static analysis cannot prove behavior. | **Documented** — Timeline-specific enforcement and passing evidence are not yet established. |
| **2. Verified transactional persistence and recovery** | [Data and Persistence Contract](../DATA_CONTRACT.md); [Local Persistence Ownership Contract](LOCAL_PERSISTENCE_CONTRACT.md); [Transaction and Recovery Contract](TRANSACTION_AND_RECOVERY_CONTRACT.md); [Architecture Foundation Contract](ARCHITECTURE_FOUNDATION_CONTRACT.md) | Test that Timeline remains read-only against authoritative business records; any permitted derived projection/cache is versioned, disposable and rebuildable. Inject failures during projection refresh/commit, interruption before/after durable boundaries, duplicate/replayed source events, restart/recovery, clock discontinuity and uncertain elapsed-time reconstruction. Verify source transactions are never partially modified by Timeline; exact interval allocation never double-counts; invalid/overlapping intervals surface needs-attention; zero, unavailable, pending and invalid values remain distinct. If Timeline introduces no durable projection, explicitly test deterministic reconstruction from authoritative repositories. | Passing repository/integration and failure-injection reports; before/after authoritative record/revision snapshots proving no source mutation or loss; proof that interrupted projection work is safely retried/rebuilt and duplicate delivery produces no duplicate Timeline item; migration/restore fixtures if any Timeline-owned cache is persisted. | **Runtime test** in CI against the authoritative persistence adapters; device lifecycle coverage remains separate where platform process behavior is involved. | **Documented** — shared transaction/recovery rules exist, but Timeline-specific runtime evidence is not established. |
| **3. Cross-platform parity** | [Architecture Foundation Contract](ARCHITECTURE_FOUNDATION_CONTRACT.md); [Native Android Contract](ANDROID_NATIVE_CONTRACT.md); [PWA Lifecycle Contract](PWA_LIFECYCLE_CONTRACT.md); [Platform Acceptance Contract](PLATFORM_ACCEPTANCE_CONTRACT.md); Section 9 of this document | Run the same deterministic Timeline source fixtures through browser-only PWA/IndexedDB and installed Android/Room application boundaries. Compare deterministic event ordering (occurrence instant, source sequence, stable ID), calendar-day grouping, logical-shift continuation, 04:00 rotation, interval allocations, all v1 metric outputs, known-zero/unavailable/pending/invalid states, and selected date/week results. Assert Android WebView/overlay cannot fall back to a competing IndexedDB business store. | Reproducible parity test report and fixture set; normalized output comparison showing identical business meaning/calculations; evidence of the correct authoritative store on each platform; required CI result for the exact commit. Physical-device behavior is not inferred from this comparison. | **Runtime test** in CI, with separate deferred physical-device checks for actual Android lifecycle/OS behavior. | **Documented** — parity requirements are specified; Timeline-specific parity execution is not established. |
| **4. Boundary, interruption, migration and restore tests** | [Driver Workflow and Business Rules Contract](DRIVER_WORKFLOW_CONTRACT.md); [Transaction and Recovery Contract](TRANSACTION_AND_RECOVERY_CONTRACT.md); [Architecture Foundation Contract](ARCHITECTURE_FOUNDATION_CONTRACT.md); [Feature Module and Extension Contract](FEATURE_MODULE_CONTRACT.md); [Backup/Restore contract](DROPBOX_BACKUP_CONTRACT.md); [Room Migration Runbook](ROOM_MIGRATION_RUNBOOK.md) | Exercise midnight calendar grouping independently from 04:00 logical-shift rotation; intervals starting/ending exactly at or spanning 04:00; repeated boundary reconciliation; delayed/duplicate events; app/process interruption at projection and source-event boundaries; supported prior-schema migrations; backup inclusion, validation, checkpoint-before-restore, interrupted restore and rollback. Assert half-open interval allocation at exact boundaries, no overlap/double-counting, idle-time complement, per-shift time reconciliation and single ownership/count/fare invariants. | Named deterministic fixtures for before/at/after midnight and 04:00; passing boundary and failure-injection reports; migration-from-each-supported-version results; backup manifest/participant completeness evidence; restore validation, checkpoint and rollback reports; unchanged source IDs, timestamps, relationships and financial ownership after recovery. | **Runtime test** in CI. Physical-device process-death/reboot/OS lifecycle checks remain a separately recorded **deferred physical-device check**. | **Documented** — cases and expected outcomes are defined; Timeline-specific execution evidence is not established. |
| **5. Future metrics can be added without disturbing existing metrics** | [Architecture Foundation Contract](ARCHITECTURE_FOUNDATION_CONTRACT.md), calculation ownership section; [Feature Module and Extension Contract](FEATURE_MODULE_CONTRACT.md), calculation/integration sections; Section 7 of this document | Maintain golden fixtures for all ten v1 stable metric IDs. Add a test-only new metric through the approved registration/calculation contract and prove existing metric IDs, outputs, source records, owners and consumers remain unchanged. Also test hide/remove/reorder/presentation redesign independently from calculation execution; require source snapshots, ownership, calculation versions, outputs and historical results to remain unchanged; require versioned review and before/after fixtures for any formula change. | Baseline and post-change golden-fixture reports; diff showing no change to existing outputs/source records/consumer contracts; registration and dependency validation output; test-only metric addition/removal evidence; reviewed calculation-version/effective-date decision for any intentional formula change. | **Runtime test** and calculation-regression suite in CI; architecture/static checks enforce ownership and dependency rules. | **Documented** — isolation rules are explicit in Section 7; Timeline-specific add-on proof is not established. |
| **6. Full regression against the shared foundation** | [Shared Foundation Enforcement Contract](SHARED_FOUNDATION_ENFORCEMENT_CONTRACT.md); [Architecture Enforcement and Verification](ARCHITECTURE_ENFORCEMENT.md); [Architecture Foundation Contract](ARCHITECTURE_FOUNDATION_CONTRACT.md); [Development Plan](../DEVELOPMENT_PLAN.md), Phase 4B | Run the required shared-foundation architecture and regression suites together with Timeline tests: ownership/dependency enforcement, authoritative persistence, transaction/idempotency/recovery, shared time integrity, zero-versus-unavailable semantics, offline/network policy, feature registration, backup/restore participation, migration/compatibility, diagnostics boundaries, and PWA/Android application-boundary parity. Verify Timeline introduces no weakened shared rule or feature-local substitute. | Required CI run on the exact candidate commit with all mandatory jobs green; test reports and coverage of the applicable shared-foundation acceptance groups; architecture-gate output; migration/backup/restore fixtures; documented exceptions (if any) with owner, expiry and regression test. Device-only checks must remain separately listed and cannot be inferred from CI. | **CI check + runtime test**; separately tracked physical-device acceptance where required by the governing platform contracts. | **Documented** — shared-foundation gates are defined and have prior implementation history, but a current Timeline-inclusive passing regression run has not been evidenced here. |

### Evidence and status discipline

- The current status for all six Timeline rows is **Documented**. This is deliberately conservative: shared-foundation implementation or an earlier CI pass is not proof that the Timeline-specific conformance suite has been implemented and passed.
- Do not mark a row **Implemented** based only on a contract, plan, source stub, or test name. Confirm the runtime path and the relevant test/check actually exist.
- Do not mark a row **CI-verified** without a successful required CI run tied to the exact commit being reviewed. Preserve links to the workflow run, job and relevant test report.
- Do not mark a row **Device-verified** without a recorded physical device/model, Android version, app build/commit, test scenario, outcome and diagnostics. The user's phone testing remains deliberately deferred; no device verification is claimed by this document.
- Reverse geocoding is deliberately deferred. It is not a prerequisite for Timeline core conformance, and no geocoder credential, provider call or live-provider acceptance is required to pass the six core architecture rows. Provider-specific activation and India-quality checks remain governed by Section 8.3 and must be tracked separately.
- A row can have CI-verified core behavior while its separately required physical-device sub-check remains pending. Record that distinction explicitly rather than treating one as proof of the other.
- This matrix is an evidence/traceability addition to the current proposal. It does not authorize Timeline implementation, phone testing, reverse-geocoder activation, schema changes, migrations, UI work or runtime changes.

## 12.2 Six remaining Timeline completion gates

The following six gates are the explicit remaining completion criteria for the Timeline. They consolidate and strengthen the requirements in Sections 7–12 and the six-row Runtime Conformance and Evidence Matrix in Section 12.1. They do not replace the governing architecture contracts or create a second implementation authority.

**All six gates remain `Documented — verification pending`.** The expected behavior and evidence are specified; this is not proof that runtime implementation, architecture enforcement, tests, CI, or visual implementation have been completed. A gate may advance only on evidence tied to the exact source commit/build and approved reference version.

| Gate | Required outcome and minimum proof | Current status |
|---|---|---|
| **1. Authoritative runtime data for every Timeline metric** | For every displayed metric and event field, trace the value end-to-end from the authoritative owning feature's persisted record/event, through its public repository/application query, into the Timeline projection and rendered result. Record the owner, source entity/event and field, stable identity, period/shift scope, formula, units/currency, precision/rounding, inclusion/exclusion, dependencies, version, and zero/empty/unavailable/pending/invalid behavior. The v1 source map must cover: `shift_duration` — persisted shift start/end instants; `pickup_time` — pickup initiation to Start ride or cancellation instants; `passenger_trip_time` — Start ride to End ride instants; `idle_time` — non-overlapping complement of valid pickup/passenger intervals within the logical shift; `total_fare` — completed-ride fare records plus cancellation-fee records; `toll_total` and `parking_total` — their respective trip-owned financial records; `business_km` — valid ending minus starting odometer readings; `completed_ride_count` — authoritative completed trip records; `cancelled_attempt_count` — authoritative cancelled attempt records. Prove each value is computed from real runtime repositories and not a mock, duplicate summary table, UI-local state, stale cache or hard-coded fixture. Use source-to-output trace tests, deterministic golden fixtures, boundary cases, reconciliation and invalid/missing-input tests. Derived projections/caches must be disposable and rebuildable; they must never become authoritative. No missing or invalid input may be fabricated or silently coerced to zero. | **Documented — runtime source-to-output proof pending.** |
| **2. Enforced ownership boundaries across TypeScript and Kotlin** | Enforce the same feature ownership and dependency rules across TypeScript/JavaScript and Kotlin/Java. Timeline may consume Work/Shift, Log Book/Trips, GPS and other feature data only through their approved versioned public application contracts or published events. It must not import private feature persistence adapters, access private tables/Room DAOs, write source-owned records, bypass public repositories, create competing business stores, or introduce dependency cycles. Architecture checks must inspect both language ecosystems, resolve relevant imports/aliases and Gradle/module dependencies, and run in required CI. Include negative fixtures that deliberately violate each prohibited boundary and must fail, plus positive fixtures that demonstrate permitted public-contract access. Where static checks cannot prove runtime access, add runtime contract tests. | **Documented — cross-language enforcement and CI evidence pending.** |
| **3. Identical PWA and Android business results** | Run the same deterministic authoritative source fixtures through the browser-only PWA/IndexedDB path and installed Android/Room application path. Compare normalized business outputs, not merely visual similarity: stable event identity and ordering; calendar-day grouping; logical-shift grouping and 04:00 rotation; cross-boundary interval allocation; all v1 metric values and currency/precision; zero, unavailable, pending and invalid states; date/week filters; and empty/error results. Prove Android WebView/native surfaces use the intended authoritative Android store and cannot silently fall back to a competing IndexedDB business store. Define deterministic comparison rules for timestamps, rounding and ordering so platform-specific representation differences cannot mask a business-result mismatch. Physical-device/OS lifecycle acceptance remains separate from automated parity. | **Documented — executable parity suite and exact-commit evidence pending.** |
| **4. Interruption, restart, duplicate-event and restore resilience** | Exercise Timeline reconstruction and reads while offline and across app closure, WebView recreation, process death, device restart, interrupted projection refresh/commit, delayed delivery, duplicate/replayed events, migration and backup/restore. Inject failures at relevant durable boundaries. Verify idempotent delivery, deterministic rebuild, no duplicate/missing Timeline items, no mutation or loss of source records, preservation of stable IDs/timestamps/relationships and originating-shift financial/count ownership, and exact interval/time reconciliation after recovery. Where a projection/cache is persisted, verify version compatibility and rebuild behavior. For restore, prove backup participation where applicable, manifest/schema validation, checkpoint-before-replacement, explicit confirmation, interrupted-restore recovery, rollback and safe retry. If Timeline owns no durable state, prove it reconstructs correctly from restored authoritative feature data without introducing its own restore participant. | **Documented — failure-injection, restart and restore evidence pending.** |
| **5. Actual UI verified against the approved visual reference** | Verify the implemented PWA Timeline against the immutable approved SVG v1 reference and its manifest/checksum using equivalent deterministic content and the exact reference viewport. Retain side-by-side, overlay and pixel-difference evidence linked to the tested build/commit and reference checksum. Check the approved hierarchy and treatment of shift boundaries, ride containers, pickup connectors outside ride cards, cancellation events, summary panels and fixed navigation. Run responsive checks at supported narrower/wider widths and relevant text/empty/unavailable states; prove no clipping, overlap, hidden information, changed event order or loss of semantic distinction. A committed SVG, screenshot or subjective review alone is not a passing visual regression test. Any approved visual change requires a new immutable versioned reference, manifest/checksum update, retained prior baseline and explicit approval under the Visual Fidelity Contract. | **Documented — implemented-screen comparison and regression evidence pending.** |
| **6. Frozen design traceability and change control** | Verify the implementation maps to the frozen product baseline, the immutable SVG v1 visual reference and the governing architecture/ownership contracts. Confirm that unresolved source availability is represented as unavailable, and that optional geocoding remains disabled until its existing privacy, credential, India-quality, attribution, budget and network-policy gates are separately satisfied. Any later product change requires explicit review and approval plus a versioned contract/reference update. | **Design approved/frozen; implementation traceability and regression evidence pending.** |

### Gate sequencing and evidence discipline

- Gate 1's source-to-output map and calculation contracts were reviewed before this implementation began; keep missing business facts unavailable rather than inferring them from display requirements.
- Gate 2 must enforce both TypeScript and Kotlin boundaries. A TypeScript-only lint or dependency check is insufficient. A documented rule, source stub, or test name is not enforcement evidence.
- Gates 1–4 require executable implementation and tests against real application/repository paths. Mocks and fixtures are test inputs, not proof that production runtime paths use authoritative data.
- Gate 3 must compare equivalent normalized business results from the two platform application boundaries; matching screens or shared presentation components alone do not prove parity.
- Gate 4 must include actual failure injection and before/after authoritative-data assertions. Happy-path restart tests alone do not prove interruption, duplicate delivery or restore safety.
- Gate 5 requires an implemented screen and reproducible visual comparison. The approved SVG is the baseline, not proof that the current UI matches it.
- Gate 6 is now a design-traceability/change-control gate. Product design approval is frozen; implementation and regression evidence remain pending.
- The six gates are related but not interchangeable: metric correctness does not prove ownership enforcement; ownership enforcement does not prove parity; parity does not prove recovery; runtime correctness does not prove visual fidelity; and passing technical tests does not approve unresolved product decisions.
- Every status transition must cite the exact commit/build, relevant CI workflow/job and test or visual report. Do not mark a gate Implemented, CI-verified or Device-verified based only on documentation, diagrams, source declarations, test names, an unrelated earlier CI run or an unrecorded manual check.
- **Physical-phone testing remains deliberately deferred.** Emulator/CI parity and lifecycle tests do not establish acceptance on the user's Redmi Note 11 Pro+ 5G or any other physical device. Record physical-device acceptance separately when explicitly scheduled and authorized.
- **Dropbox/live-account acceptance and reverse-geocoder activation remain deferred** under their existing contracts. Do not make them implicit prerequisites for the six core Timeline gates or claim they have passed.
- This implementation is authorized within the bounded read-only scope recorded at the top of this document. The six technical gates remain Documented — verification pending until exact-commit CI, runtime and visual evidence is attached.

## 13. Implementation authorization and scope boundaries

The user authorized one integrated Timeline implementation, one pull request and one full CI run on 8 November 2026. This authorizes the following bounded read-only slice:
- Register Timeline as a non-persistent feature using the existing feature manifest and extension registry.
- Read authoritative Work events through the public Work workflow query and rebuild the existing shared projection.
- Render the approved event-wise Timeline screen, shift summaries, explicit unavailable states, and Today/Week/By date navigation.
- Add focused tests and documentation that record the source gaps and implementation boundaries.

This authorization does **not** authorize:
- A Timeline-owned database, event store, persistent projection/cache, or duplicate shift/trip/financial records.
- Mutations to Work, Log Book, Finance or Vehicle records; changes to shift/trip lifecycle or GPS capture.
- Maps, map tiles, continuous GPS, automatic location tracking or reverse-geocoding activation.
- New Finance/odometer business rules, loan/payment records treated as trip income, or invented location/fare/distance values.
- Changes to backup/restore, network policy, Android background services, or branch protection.

The design is frozen. Future product changes require explicit review and approval. Technical release acceptance remains subject to the verification gates and separate physical-device/live-provider acceptance contracts.
