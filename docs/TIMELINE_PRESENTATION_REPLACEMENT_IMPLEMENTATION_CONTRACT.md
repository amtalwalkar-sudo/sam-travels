# Timeline Presentation Replacement Implementation Contract

**Status:** Proposed implementation contract — documentation-only phase; no Timeline implementation is authorized by this document until the user approves the contract and the visual change-control item in §4.  
**Target:** Sam Travels PWA main application, with shared platform-neutral presentation contracts where applicable.  
**Scope:** Replace the Timeline screen presentation end to end while preserving authoritative event ownership, projection semantics, PWA lifecycle, offline behavior, and platform boundaries.  
**Product intent:** A driver can quickly review any day or week, understand the sequence of work at a glance, and reveal deeper event details in clearly separated layers with very few interactions.

## 1. Purpose and product outcome

Timeline is the driver's read-only activity history. It must answer, quickly and clearly:

1. What happened during the selected day or week?
2. In what order did shifts, pickup attempts, rides, cancellations, and logical-shift rotations happen?
3. What happened inside a particular shift or trip?
4. What summary information is confirmed, pending, unavailable, or in need of review?

The screen must be driver-oriented, not an administrative event log or a technical diagnostic view. Labels must use familiar driver language. A driver should understand the main sequence without opening every event. Deeper information must be available on demand without overwhelming the initial view.

The primary navigation remains the existing four destinations: Drive, Timeline, Performance, and Admin. Timeline remains read-only and does not become a place to edit, recreate, or correct business records.

## 2. Governing contracts and precedence

This contract supplements and must be read with:

- `docs/TIMELINE_DESIGN_PROPOSAL.md` — Timeline purpose, event semantics, grouping, summaries, 04:00 behavior, location enrichment and known source gaps.
- `docs/TIMELINE_MOCKUP_VISUAL_FIDELITY_CONTRACT.md` and `docs/reference/timeline-mockup/` — approved visual baseline and version/change-control rules.
- `docs/UI_UX_SHELL_FOUNDATION_CONTRACT.md` — replaceable shell, feature-owned presentation, explicit screen context, accessibility and component isolation.
- `docs/ARCHITECTURE_FOUNDATION_CONTRACT.md`, `docs/ARCHITECTURE.md`, `docs/FEATURE_MODULE_CONTRACT.md`, and `docs/FEATURE_EXTENSION_LIFECYCLE_CONTRACT.md` — ownership, dependency direction, feature registration and platform parity.
- `docs/DRIVER_WORKFLOW_CONTRACT.md`, `docs/LOCATION_AND_STATE_TIMING_CONTRACT.md`, `docs/NETWORK_ACCESS_CONTRACT.md`, `docs/PWA_LIFECYCLE_CONTRACT.md`, and `docs/ANDROID_NATIVE_CONTRACT.md` — event authority, timestamp/GPS integrity, network consent, lifecycle and platform behavior.
- `docs/DATA_CONTRACT.md`, `docs/LOCAL_PERSISTENCE_CONTRACT.md`, and `docs/TRANSACTION_AND_RECOVERY_CONTRACT.md` — authoritative data, read consistency, recovery and idempotency.

If this contract conflicts with an authoritative business, data, persistence, security, lifecycle, or platform rule, the authoritative rule wins. Resolve a genuine product conflict by an explicit versioned contract change; do not reinterpret it inside presentation code.

## 3. Non-negotiable architecture principles

The same separation principles used for the Work screen replacement apply:

- The Timeline shell, navigation/date controls, day overview, shift sequence, event components, detail layers, summary presentation, and empty/loading/error states must be independently replaceable.
- The Timeline presentation must be replaceable without changing event ownership, event creation, shift/trip state machines, calculations, persistence, recovery, backup, GPS capture, reverse-geocoding policy, or unrelated screens.
- Each component receives only the typed state and actions it actually consumes. Do not pass the entire application runtime, feature registry, repository, service container, or broad workspace object into leaf presentation components.
- Presentation owns transient view state only: selected date/range, selected layer, expanded item, and local navigation state. It must not own durable business state.
- Domain and application layers must not import React, CSS, browser APIs, or presentation components.
- Timeline presentation must not access Dexie, Room, database tables, native plugins, network clients, or another feature's private implementation.
- No parallel shell, feature registry, event store, projection engine, query framework, or form framework may be introduced.
- Keep the existing Timeline feature registration and public extension architecture. Extend its public context only when a concrete presentation need requires it, with explicit versioning and compatibility tests.
- Keep Work/Shift, Driver Workflow, Log Book/Trips, Finance, odometer and GPS as the owners of their respective records and rules.

The implementation should follow a composition pattern equivalent to Work: a thin feature composition adapter supplies narrowed, explicit presentation contracts to a feature-owned screen shell and independent components. The shell must not import business or persistence infrastructure.

## 4. Visual authority and required approval gate

The repository currently contains an approved, frozen v1 visual reference:

- `docs/reference/timeline-mockup/sam-travels-timeline-approved-direction-v1.svg`
- `docs/reference/timeline-mockup/manifest-v1.md`

The v1 reference governs the existing Timeline visual presentation. It must remain immutable.

This request adds a stronger product requirement: layered day/week review with a driver-first overview and progressive event detail. Where this new interaction model cannot be implemented faithfully within the v1 visual reference, it is a visual/product change—not an implementation convenience.

Before replacing the visible design:
1. Retain v1 unchanged as historical approved baseline.
2. Produce a versioned v2 visual reference and manifest that demonstrate the agreed driver-first day/week overview, sequence, and progressive detail layers.
3. Obtain explicit user approval of v2.
4. Update the visual-fidelity contract to identify v2 as the current visual source of truth while retaining v1 and its provenance.
5. Capture deterministic reference fixtures and viewport assumptions.

No developer may silently redraw, overwrite, or discard v1. Until v2 is approved, implementation may proceed only on documentation, architecture preparation, and tests that do not commit the app to a conflicting visual design.

## 5. Driver-oriented information architecture

The proposed information hierarchy has three review levels. They are presentation layers over the same read-only projection, not separate data sources.

### Layer 1 — Period overview

- Default to the current day.
- Make the selected day unmistakable and provide direct previous/next day navigation.
- Provide a one-tap switch to week review.
- Week review shows the seven calendar days in the selected Monday–Sunday week, with a clear indication of days containing activity and a compact per-day activity cue derived only from available projection data.
- Selecting a day from the week opens that day directly.
- Provide a direct date picker/jump-to-date action; a driver must not have to repeatedly tap through many weeks to reach older history.
- Include a clear return-to-Today action whenever the selected date is not today.
- Keep date calculations in Asia/Kolkata. Calendar days use local midnight boundaries; logical shifts continue to use the separate 04:00 boundary.
- Period navigation must preserve the selected day when switching between day and week modes.

### Layer 2 — Chronological day sequence

- Present the selected day's activity in chronological order, grouped into the correct logical-shift sections.
- The main sequence must be understandable at a glance: shift start, pickup journey, ride start/completion, cancellation, shift end, and system-generated 04:00 rotation.
- Give completed rides and cancelled pickup attempts visibly different treatments.
- Pickup journeys are connectors between trip creation and the pickup outcome; they are not ride cards.
- Clearly distinguish driver actions from system-generated events.
- A logical shift that crosses 04:00 must be segmented according to the existing projection; do not fabricate a driver action, GPS fix, or second physical shift.
- Keep one clear event identity and chronological position for each source event. Do not duplicate events merely because a logical shift spans calendar days.

### Layer 3 — Event and shift detail

- Tapping an event reveals its available details without navigating away from the selected period or losing the driver's place in the sequence.
- Detail presentation may show event time, event type in driver language, duration, from/to locations, fare/cancellation fee, and location-evidence status only when the corresponding source contract supplies them.
- A shift summary remains associated with its logical shift and clearly separates confirmed values from pending, unavailable, invalid, or not-applicable values.
- Integrity warnings and unresolved evidence must be understandable and actionable in wording, but Timeline must not offer unsupported correction or mutation actions.
- Collapsing details returns to the same day/scroll position.
- The default sequence must remain compact; secondary evidence must not dominate the first-glance view.

The exact visual composition and interaction affordances for these layers are to be shown in the v2 reference before implementation. Do not introduce maps, map tiles, or a dashboard-style redesign.

## 6. Existing event and summary semantics to preserve

The existing Timeline Product Design remains authoritative for event meaning and must be carried forward, including:

- Shift start/end timestamps and locations; active duration is derived from persisted instants and the current clock, never maintained as an incrementing business counter.
- Going-to-pickup duration from trip creation to Start ride or cancellation.
- Completed ride duration from Start ride to End ride.
- Cancellation as a separate pickup attempt, including an explicit zero cancellation fee when the authoritative finance source supplies zero.
- Independent logical-shift sections and summaries.
- The 04:00 Asia/Kolkata logical-shift rotation, including continuous Online session, trip ownership by the shift active at trip creation, effective boundary time during recovery, and pending odometer confirmation when applicable.
- Existing summary metric definitions, interval reconciliation, integrity issue classification, and explicit metric statuses.
- Existing location enrichment consent, network gateway, proxy, provider-key secrecy, attribution, in-memory cache and graceful fallback behavior.
- Read-only behavior: Timeline never writes source records or becomes a correction surface.

Do not copy business rules into components. Reuse the existing pure projection and application query contracts unless a separately reviewed upstream contract change is necessary.

## 7. Data truth, unavailable layers, and source gaps

The current implementation reads the authoritative Work/Driver Operational Workflow event stream through the Work public event-list query and rebuilds a disposable Timeline projection.

The source audit in `TIMELINE_DESIGN_PROPOSAL.md` remains binding. In particular:

- Work/Shift owns shift lifecycle and shift-level odometer readings.
- Driver Workflow owns committed operational transitions.
- Log Book/Trips owns trip-history and trip-linked financial records.
- GPS evidence belongs to the source event/transition.
- Finance, pickup interval, and odometer evidence must be consumed only through their owning public query contracts.
- The current Timeline integration has known gaps for complete trip finance, legacy pickup interval evidence, and odometer/business-distance evidence. Until an owning public source is wired and validated, show the appropriate unavailable/pending state. Never infer a value from unrelated records or show an unavailable value as zero.
- The current source query returns a full event snapshot; period filtering currently happens after the read. Efficient source-level period queries/pagination are a known performance gap for large histories. Do not solve this by adding a Timeline-owned persistent cache or second event store.

The first presentation replacement must not expand scope to implement missing Finance, odometer, or Log Book source capabilities. Record those as explicit integration dependencies and preserve graceful partial rendering.

## 8. Date navigation and interaction requirements

- Day review must be reachable from any other date with one date-jump interaction, or by a bounded previous/next action.
- Week review must use Monday–Sunday weeks in Asia/Kolkata and show the exact date range.
- Previous/next week changes the selected week by exactly seven calendar days.
- Selecting a date from the week overview switches to that day without an extra confirmation.
- Today is always directly reachable.
- Loading, refresh, stale data, errors, and empty periods must be distinguishable.
- A failed read must not replace the last successfully rendered period with fabricated empty activity.
- A late response for an older date selection must not overwrite a newer selection. Abort/stale-request handling must remain correct.
- Optional location enrichment must never block the core event sequence and must never make Timeline unusable offline.
- All controls must be touch-friendly, keyboard-operable, labelled, and screen-reader accessible.

## 9. Performance, lifecycle, and offline behavior

- Preserve the PWA's offline-first behavior. Core Timeline event history must load from the authoritative local source; no internet is required to navigate or review already stored activity.
- Reverse geocoding remains an optional enrichment only. The explicit master Internet Access policy and separate Timeline session consent remain in force.
- Do not introduce automatic GPS collection, background location polling, map requests, analytics beacons, or a new external provider.
- Cancel or ignore obsolete period reads and enrichment responses when selection changes or the screen unmounts.
- Keep derived projections disposable and rebuildable. No persistent Timeline cache is authorized.
- Do not introduce a new timer loop for every event. Any active duration refresh remains presentation-only and derives from authoritative timestamps.
- Avoid unbounded DOM rendering for very large histories. Before adding virtualization or period-scoped query APIs, demonstrate need and define them in their owning architecture/application contracts. Do not silently alter the source query contract in this presentation change.

## 10. Implementation boundaries and permitted changes

In scope:
- Replace Timeline screen composition and presentation components.
- Add a feature-owned Timeline presentation shell and narrowly typed child components.
- Add transient day/week navigation and progressive detail interactions.
- Extract pure presentation selectors/view models only where useful and testable.
- Isolate Timeline styles so changing the Timeline visual system does not affect Work, Performance, Admin, or global shell.
- Add deterministic presentation fixtures, component contract tests, accessibility/responsive tests, visual regression evidence, and dependency-boundary enforcement.
- Update Timeline documentation and contract index after implementation.

Out of scope:
- Changing Work, Shift, Driver Workflow, Log Book/Trips, Finance, odometer, GPS, backup, restore, transaction, recovery, or business calculation rules.
- Adding/editing/deleting source events from Timeline.
- New authoritative records, persistence tables, projection caches, event stores, or migrations.
- Implementing missing Finance, odometer, or legacy pickup source adapters.
- Maps, map tiles, continuous tracking, new geocoding providers, or changes to network-consent rules.
- Redesigning the global application shell or navigation.
- Changes to Performance, Admin, Drive/Work forms, Android overlay, or unrelated screens.
- Changing the existing four primary navigation destinations.

## 11. Verification and acceptance gates

The implementation is complete only when all applicable gates pass:

### Architecture and isolation
- Timeline presentation shell has no domain lifecycle, application service, repository, storage, native, or network dependencies.
- Leaf components receive explicit narrow props and cannot access the feature runtime or service container.
- Timeline remains a non-persistent feature registered through the existing feature-extension architecture.
- Replacing the Timeline presentation implementation leaves projection, query, source ownership and other feature registrations unchanged.
- Work/Drive, Performance, Admin and global shell have no unintended source or visual changes.

### Behavior and data integrity
- Day/week/date-jump navigation, period retention, Today shortcut and Monday–Sunday boundaries are tested, including month/year transitions and Asia/Kolkata midnight.
- Events are ordered and grouped correctly across calendar days and 04:00 logical-shift boundaries.
- Pickup, ride, cancellation, shift, rotation and summary semantics match the existing projection contract.
- Pending, unavailable, invalid, and not-applicable states remain distinct; unavailable values are never rendered as zero.
- Source event IDs, timestamps, revisions, GPS evidence and source records remain unchanged.
- Optional enrichment failure, network disabled, offline mode, abort, stale response and app resume are tested.
- Empty, loading, refresh, stale-data, read-error and integrity-warning states are covered.

### Presentation, accessibility and visual evidence
- v2 reference is approved, versioned and retained alongside v1 before visual replacement.
- Deterministic fixtures reproduce the approved reference content.
- Same-viewport side-by-side and overlay/difference review is recorded.
- Narrow and wider PWA viewports preserve the same information hierarchy without clipping or hiding required details.
- Keyboard, screen-reader labels/announcements, focus order, text scaling, contrast and touch targets are tested.
- Every interactive layer and date-navigation control has a real, tested action.

### CI and release
- Existing architecture, web, Android, integrated regression, service-worker, privacy and platform parity gates remain green.
- Add no new CI bypass or ignored test.
- Physical phone testing remains a separate final acceptance activity; automated CI does not claim to replace it.

## 12. Delivery sequence

1. **Contract and design approval:** review this contract, resolve any open product semantics, and approve a versioned v2 visual reference.
2. **Presentation boundary:** define Timeline shell and component contracts; add architecture tests before replacing the current screen.
3. **Composition replacement:** build the new screen from independent presentation components using the existing read-only Timeline context.
4. **Navigation and layers:** implement day/week overview, date jump, chronological sequence, and progressive event/shift detail.
5. **Parity and regression:** prove projection parity, 04:00 behavior, source ownership, offline/enrichment behavior, and unchanged other screens.
6. **Visual/accessibility validation:** compare against approved v2, test responsive/accessibility behavior, and retain evidence.
7. **CI and PR:** complete all required CI checks, report exact head and job results, and leave the PR draft/open/unmerged unless the user explicitly instructs otherwise.

No implementation step may silently expand the approved scope. If a missing upstream data source blocks a value, preserve the explicit unavailable state and report the gap rather than inventing data or changing ownership.


## 13. Enforceable decoupling contract

This section makes the independence requirements testable. A folder split, component count, or naming convention alone does not satisfy it.

### 13.1 Dependency direction

The permitted direction is:

`authoritative feature sources → existing application query/projection → Timeline feature composition adapter → typed presentation model/actions → Timeline shell and leaf components`

The arrow means "may provide data to / may be depended on by". Dependencies must not point back toward infrastructure from presentation.

- The feature composition adapter is the only Timeline presentation boundary allowed to bind the existing feature context/query to the presentation.
- The adapter may depend on the existing public Timeline/application contract and feature extension context. It must not become a second business-rule implementation.
- The shell may depend on Timeline-owned presentation contracts and Timeline-owned visual primitives only.
- A leaf component may depend on its own prop contract and presentation primitives explicitly approved for reuse. It may not import the shell, composition adapter, application query, projection service, domain model, repository, or another leaf component's private implementation.
- Shared leaf components must not import sibling components. Composition belongs to a parent composition component.
- Domain and application code may not depend on any Timeline presentation module, React, JSX, CSS, DOM, browser, or platform API.
- No component may reach into global application context, a singleton service locator, a feature registry, a repository, or a database to obtain data or actions.

### 13.2 Component responsibility and interface inventory

The exact file names may follow the repository's established naming conventions, but the responsibilities and contracts below are mandatory and must remain independently replaceable.

| Boundary | Owns | Receives | Must not own |
|---|---|---|---|
| Feature composition adapter | Connects existing Timeline context to presentation props/actions | Existing typed feature context | Visual layout, business rules, persistence |
| Timeline shell | Overall Timeline frame and placement of child regions | Screen-level presentation model and callbacks | Source queries, event interpretation, durable state |
| Period navigation | Day/week mode, previous/next, date jump, Today interaction rendering | Selected period, mode, permitted date bounds/status, callbacks | Calendar business policy, source query |
| Period overview | Seven-day week overview and activity cues | Prepared week/day view model | Data fetching, inferred activity |
| Day sequence | Ordered logical-shift sections | Prepared sequence view model | Reordering source events, shift lifecycle |
| Shift section | Shift boundary, shift-level sequence and summary placement | One shift view model | Calculating authoritative shift values |
| Event renderer | One event's compact visual representation | One discriminated event view model | Fetching other events, deriving missing fields |
| Pickup connector | Pickup interval visual connector | Explicit pickup interval/status view model | Reconstructing trip state |
| Event detail | Expanded read-only details for one selected event | One detail view model and close callback | Mutation/correction commands |
| Shift detail/summary | Read-only shift detail and metric states | One shift summary/detail view model | Recalculating finance or distance |
| Status surfaces | Loading, refreshing, stale, empty, unavailable, error and integrity states | Explicit status model and retry callback where supported | Converting failures into empty success |
| Timeline style layer | Timeline-local tokens, CSS and icons | No runtime data | Global theme mutation or styles leaking to other features |

If a responsibility is combined for a demonstrable simplicity reason, its public interface must still be independently testable and replaceable. Do not create speculative generic component frameworks.

### 13.3 Typed presentation contracts

- Define a presentation-only model that is serializable or otherwise plain-data in shape: discriminated unions, explicit nullable/optional fields, stable source identifiers, and explicit value-status variants.
- Do not pass domain entities, database rows, repository objects, class instances with behavior, or broad service objects directly to visual components.
- Represent values using the source's real status. At minimum preserve confirmed, pending, unavailable, invalid, and not-applicable where the source contract distinguishes them.
- A missing value must not be encoded as numeric zero, empty string, or a fabricated location.
- Events must retain stable source identity, source timestamp, event kind, logical-shift association and provenance needed for ordering/details. Presentation keys must not be generated from array position.
- Actions are explicit callbacks with narrow arguments (for example, select period, select day, open event detail, close detail, retry read). No arbitrary command dispatcher or stringly typed action bus.
- Component props must be immutable inputs. Components must not mutate the supplied view model.
- Public feature context identity/version rules from the UI/UX Shell Foundation and Feature Module contracts remain in force. Any context contract change requires versioning and compatibility tests.

### 13.4 State ownership and lifecycle

- Durable operational state remains in its owning feature and repository.
- Read/query state remains with the existing application/query owner.
- The feature composition adapter coordinates query lifecycle only where the existing feature contract assigns it that responsibility.
- The presentation shell owns transient selection state only: day/week mode, selected calendar date/week, expanded event or shift detail, and local scroll/focus restoration state.
- Leaf components are controlled renderers. They do not keep duplicate copies of selected date, event data, shift totals, or source status.
- No global mutable store, cross-feature event bus, shared singleton, or persistent browser storage may be introduced for Timeline view state.
- A selected period change invalidates or supersedes prior reads. Aborted or stale results must not overwrite the currently selected period.
- Returning from details restores the selected period and prior sequence position/focus without persisting business data.

### 13.5 Style and visual isolation

- Timeline styles are feature-owned and namespaced/scoped. They must not redefine global element selectors, shared shell styles, or global tokens as a side effect.
- Timeline may use shared low-level primitives only when those primitives are presentation-neutral and their use does not constrain independent replacement.
- Timeline-specific typography, spacing, colours, icons, event shapes, and motion are local to Timeline unless explicitly approved as shared tokens.
- Removing/replacing Timeline CSS must not alter Work/Drive, Performance, Admin, global navigation, or Android overlay presentation.
- Responsive adaptation follows the approved visual reference and visual-fidelity contract; it is not permission to couple Timeline to global breakpoints or redesign other screens.

### 13.6 Explicit non-coupling guarantees

The implementation must demonstrate all of the following:

1. Replacing the Timeline shell while keeping the same presentation contract leaves every leaf component and the application query/projection unchanged.
2. Replacing one leaf component while keeping its props contract leaves the shell, sibling components, query/projection and persistence unchanged.
3. Replacing Timeline styling leaves component behavior, query/projection, and all other feature styles unchanged.
4. Replacing the presentation adapter implementation while honoring the public feature context contract leaves the shell and leaf components unchanged.
5. Replacing the Timeline presentation as a whole leaves authoritative source records, source feature APIs, business calculations, persistence schemas, backup/restore and other screens unchanged.
6. Replacing or extending the authoritative source implementation behind the existing public query/projection contract does not require presentation components to import or understand its storage/platform implementation.

A test or architecture check must fail if these guarantees are violated. Document the exact enforced import paths and any unavoidable exception; exceptions require a named owner, reason, narrow scope and regression test.

### 13.7 Prohibited shortcuts

The following are implementation failures even if the screen appears correct:

- Passing a whole runtime/context/service container through the component tree.
- Importing domain, application, repository, database, native or network modules from presentation components.
- Recomputing fare, duration, pickup interval, shift ownership, odometer, business distance or other authoritative semantics in JSX/components.
- Duplicating query/projection logic in the shell or leaf components.
- Sharing mutable state between unrelated components through module globals or a hidden singleton.
- Importing sibling components from leaf components to create implicit circular composition.
- Global CSS selectors or global token changes to achieve Timeline styling.
- A component that cannot be rendered in isolation from a typed fixture without mounting the entire application runtime.
- Making unrelated features change their public API or visual output to accommodate Timeline layout.

## 14. Definition of done — no partial substitution

Timeline replacement is not complete merely because the new screen renders or because CI is green. All of the following are required:

- Approved v2 reference and manifest; v1 bytes and checksum unchanged.
- Documented component/interface inventory and dependency direction.
- Feature-owned composition adapter and shell, with narrow typed props/actions.
- Each independently replaceable component can be rendered/tested using fixtures without the full application runtime.
- Automated import/dependency enforcement covers all prohibited presentation-to-infrastructure and domain/application-to-presentation edges.
- Contract tests demonstrate shell replacement, leaf replacement, adapter replacement and style isolation.
- Existing projection output is unchanged for the same authoritative source fixtures.
- No writes, schema changes, caches, new event stores, or business-rule changes.
- All required behavior, accessibility, responsive, offline, stale-read and platform-parity tests pass.
- Full required CI is green on the exact final PR head SHA.
- Manual physical-device testing remains separately pending until the user performs it; do not claim it has passed.
- PR remains draft/open/unmerged until the user explicitly authorizes merge.

The detailed staged execution checklist and evidence ledger are maintained in `docs/TIMELINE_PRESENTATION_REPLACEMENT_IMPLEMENTATION_PLAN.md`. That plan is a delivery guide; this contract and the existing owner contracts remain authoritative.
