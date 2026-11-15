# Timeline Presentation Replacement — Methodical Implementation Plan

**Status:** Active execution plan; visual design decisions are delegated to the assistant within the approved product and architecture contracts.  
**Normative authority:** `TIMELINE_PRESENTATION_REPLACEMENT_IMPLEMENTATION_CONTRACT.md` and the owner contracts listed there.  
**Delivery rule:** Work phase by phase. Do not start a later phase while an earlier phase's exit gate is open. Do not silently widen scope.

## 1. Outcome and non-negotiable promise

Replace the Timeline screen with a driver-first, layered day/week review while preserving the existing authoritative data and behavior.

The change must be independently replaceable at every presentation boundary:

- The Timeline presentation can be replaced without changing its query, projection, source records, persistence or other screens.
- The shell can be replaced without changing child components.
- Any one child component can be replaced without changing its siblings, shell or data contracts.
- The presentation adapter can be replaced without changing the shell/components, provided it honors the same public context contract.
- Timeline styling can be replaced without changing component behavior or other feature styling.
- An underlying source implementation can change behind its existing public contract without presentation components knowing which database/platform supplies it.

A visually successful screen with hidden dependencies is not a successful delivery.

## 2. Decision register

These decisions are fixed for this workstream unless the user explicitly changes them:

| Decision | Binding direction |
|---|---|
| Product audience | Single driver; driver-friendly, not admin/diagnostic |
| Main purpose | Review activity by day or week, understand sequence at a glance, inspect details on demand |
| Primary navigation | Preserve Drive, Timeline, Performance, Admin |
| Default period | Current day |
| Week definition | Monday–Sunday in Asia/Kolkata |
| Calendar boundary | Local midnight in Asia/Kolkata |
| Logical shift boundary | Existing 04:00 Asia/Kolkata rule; do not conflate with calendar day |
| Interaction layers | Period overview → chronological shift/event sequence → event/shift details |
| Mutability | Read-only; no correction or source-record mutation |
| Source of truth | Existing public application queries and authoritative owning features |
| Projection | Existing disposable Timeline projection; do not duplicate it |
| Persistence | No Timeline-owned persistent cache, event store, table or migration |
| Network | Core history works offline; existing optional reverse-geocoding consent/policy remains unchanged |
| Visual direction | v1 remains immutable history; v2 is the initial selected direction, refined under delegated design authority |
| Device acceptance | Physical phone testing is deferred to the user's final acceptance stage |
| PR policy | Keep draft/open/unmerged until explicitly instructed otherwise |

### Explicitly unresolved / must not be guessed

- Visual refinements beyond the v2 starting direction are owned by the assistant and must be documented with accessibility, responsive and source-truthfulness rationale; do not claim personal user approval.
- Any missing source values (complete trip finance, legacy pickup interval evidence, odometer/business distance): remain pending/unavailable according to the source contract.
- Source-level period query/pagination: known performance gap; do not fix inside this presentation replacement.
- Any new source capability, feature context change, or public query change: stop and propose a separate owner-contract change before implementation.

## 3. Work sequence and exit gates

### Phase 0 — Baseline and source audit

**Tasks**
1. Record the exact base commit and current PR head.
2. Read the Timeline product design, visual-fidelity contract, v1 manifest/reference, UI/UX shell foundation, feature module/extension contracts, architecture enforcement, data/persistence/recovery, Driver Workflow, location/time, network and platform lifecycle contracts.
3. Inspect the current Timeline feature manifest, public entry point, feature descriptor/context, presentation components, application query, projection, domain types, tests and CI architecture checks.
4. Trace every displayed field from owning source → public query → projection → presentation model → renderer.
5. Record current behavior and fixture outputs before changing presentation.
6. Record current architecture exceptions and CI limitations; do not claim a rule is enforced if no test currently enforces it.

**Exit gate**
- Baseline commit, current files, public contracts, source ownership map, test inventory and known gaps are recorded.
- Existing projection fixtures/results can be used as a before/after parity baseline.
- No code changes yet.

### Phase 1 — v2 visual reference (approval gate)

**Tasks**
1. Preserve the v1 SVG and manifest byte-for-byte; verify the existing checksum.
2. Create a separate v2 artifact and manifest. Label it clearly as a proposal until approval.
3. Show the three layers: day/week period overview, chronological shift/event sequence, progressive event/shift details.
4. Show the compact default state and how details open/close without losing selected period or sequence position.
5. Show Monday–Sunday week selection, direct date jump, Today, and day selection from the week.
6. Include the existing fixed four-destination navigation and maintain the product's no-map direction.
7. Use only source-supported fields and truthful pending/unavailable states; do not fill source gaps with illustrative invented business values.
8. Include the relevant mobile viewport(s) and any wider viewport adaptation needed to communicate behavior; identify exact artboard/viewport assumptions in the manifest.
9. Record SHA-256, provenance, state coverage, viewport assumptions, and explicit approval status.
10. Present the v2 artifact to the user and wait for explicit approval.

**Exit gate**
- User explicitly approves v2.
- v1 remains unchanged.
- Visual-fidelity contract and README/manifest are reconciled to name v2 as current approved source while retaining v1 history.
- No visual implementation begins before this gate.

### Phase 2 — Component contracts and architecture enforcement (before screen rewrite)

**Tasks**
1. Map the existing Timeline feature context to one thin feature composition adapter.
2. Define plain typed presentation models and narrow callback contracts for:
   - screen shell;
   - period navigation;
   - week/day overview;
   - chronological day sequence;
   - logical-shift section;
   - individual event renderer;
   - pickup connector;
   - event detail;
   - shift summary/detail;
   - loading/refresh/stale/empty/error/integrity surfaces.
3. Use discriminated unions for event types and explicit value-status types; retain stable source IDs and timestamps.
4. Keep component props immutable. Use explicit callbacks with narrow arguments; no generic command bus.
5. Define a dependency rule and enforce it using the repository's existing architecture-check/CI mechanism.
6. Add contract tests proving leaf components render from fixtures without the full application runtime.
7. Add shell/leaf/adapter/style replacement tests or equivalent boundary tests that fail on forbidden imports or cross-component coupling.
8. Keep all new view state transient and owned by the screen-level presentation controller/shell; leaf renderers remain controlled.
9. Document any exception with owner, reason, narrow path and regression test. No silent exceptions.

**Exit gate**
- Dependency graph and interface inventory are reviewed.
- Architecture checks fail for prohibited imports and pass for the intended structure.
- The current screen still behaves as before; no broad visual rewrite yet.
- No business, persistence, query, or projection changes have slipped in.

### Phase 3 — Composition and shell replacement

**Tasks**
1. Add/replace the feature-owned Timeline shell behind the existing feature registration/context identity.
2. Keep feature registration and app composition wiring unchanged unless a concrete, reviewed contract requirement proves otherwise.
3. Make the composition adapter supply only the required typed view model and callbacks.
4. Keep shell layout, navigation presentation, sequence region and detail region separate.
5. Namespace Timeline styles; avoid global element selectors and global token changes.
6. Prove shell replacement using the same component contracts and fixture data.
7. Verify that mounting/unmounting Timeline does not alter other feature registrations or shared shell behavior.

**Exit gate**
- New shell mounts through the existing extension lifecycle.
- No shell-to-repository/service/native/network dependency.
- Other destinations remain unchanged.
- Shell contract tests and architecture checks pass.

### Phase 4 — Period navigation and layered review

**Tasks**
1. Implement current-day default and clear selected-date presentation.
2. Implement previous/next day and week navigation.
3. Implement Monday–Sunday week selection and one-tap day selection.
4. Implement direct date jump and Today shortcut.
5. Preserve the selected date when switching day/week modes.
6. Implement compact activity cues only from available projection data.
7. Render chronological events grouped by existing logical shift.
8. Render completed rides, pickup connectors and cancellations as distinct event types.
9. Render 04:00 system rotation as the existing neutral logical boundary; do not fabricate a physical shift or GPS event.
10. Implement progressive read-only event and shift details.
11. Restore selected period, scroll position and focus when closing details.
12. Implement loading, refreshing, stale, empty, read-error and integrity states without conflating them.

**Exit gate**
- All interactions are real and tested.
- Same source fixture produces the same event identities, ordering, values and statuses as the baseline projection.
- Month/year, Asia/Kolkata midnight and 04:00 boundary cases pass.

### Phase 5 — Data, lifecycle, offline and platform regression

**Tasks**
1. Verify no Timeline writes or mutations occur.
2. Verify source IDs, revisions, timestamps, GPS evidence and source records remain unchanged.
3. Verify unavailable/pending/invalid/not-applicable distinctions and no false zeros.
4. Verify pickup and ride duration semantics, cancellation semantics, shift summaries and logical-shift ownership.
5. Verify offline history and optional geocoding behavior with network disabled, consent disabled, provider unavailable and provider failure.
6. Verify cancellation/ignoring of obsolete reads and enrichment responses.
7. Verify a failed read does not replace the last good period with an empty success.
8. Verify app resume/reload reconstructs the presentation from authoritative sources.
9. Verify browser/Room business-result parity using existing platform test conventions.
10. Verify no new timer loops, map requests, background GPS, analytics beacons or provider dependencies.

**Exit gate**
- All data-integrity and lifecycle tests pass.
- No new persistent state or business logic is introduced.
- Platform parity is demonstrated by automated evidence, not assumed.

### Phase 6 — Visual, accessibility and responsive acceptance

**Tasks**
1. Render deterministic fixtures matching the approved v2 states.
2. Capture implementation at the same reference viewport and state.
3. Record side-by-side and overlay/difference review.
4. Correct unintended differences; do not mask layout/style changes through overbroad screenshot normalization.
5. Test narrow and wide supported PWA viewports without hiding required information or changing hierarchy.
6. Test semantic labels, keyboard operation, focus order/return, screen-reader announcements, text scaling, contrast and touch targets.
7. Verify details are discoverable without overwhelming the default sequence.

**Exit gate**
- Approved v2 fidelity review passes.
- Accessibility and responsive tests pass.
- Evidence includes exact commit, fixture, viewport and reference checksum.

### Phase 7 — Full CI, review and delivery

**Tasks**
1. Run the full required CI suite on the exact final PR head.
2. Inspect every required job; distinguish skipped/conditional jobs from passed jobs.
3. Fix failures rather than bypassing, weakening or ignoring tests.
4. Re-run CI after the final code change and verify exact SHA.
5. Review the final diff for out-of-scope files, accidental contract drift, global style changes, business/persistence changes and dependency leaks.
6. Update implementation status/evidence docs and contract index.
7. Report changed files, architecture boundaries, test evidence, CI run/job statuses, known limitations and physical-phone test status.
8. Keep PR draft/open/unmerged until the user explicitly authorizes merge.

**Exit gate**
- Exact final head SHA has green required CI.
- No known out-of-scope changes or unreported limitations.
- User receives a clear completion report.
- Physical-device testing is explicitly marked pending, not falsely passed.

## 4. Component contract checklist

Every presentation component must satisfy this checklist before it is accepted:

- [ ] Has one clearly stated responsibility.
- [ ] Has a narrow typed props interface.
- [ ] Receives only the fields it renders or the actions it invokes.
- [ ] Does not import repositories, query services, projection services, domain lifecycle logic, persistence, native or network modules.
- [ ] Does not read global runtime/context/service locator state.
- [ ] Does not mutate input props or durable data.
- [ ] Can be rendered from a deterministic fixture without mounting the full application.
- [ ] Has tests for its own rendering and interaction contract.
- [ ] Does not import sibling private implementation.
- [ ] Uses namespaced feature styles and does not leak global CSS.
- [ ] Preserves accessibility semantics and responsive behavior.
- [ ] Can be replaced by another implementation with the same public contract.

## 5. Dependency and ownership map

| Concern | Owner | Timeline's permitted relationship |
|---|---|---|
| Shift lifecycle / odometer | Work/Shift | Consume published read contract only |
| Operational transitions | Driver Workflow | Consume committed event/query contract only |
| Trip history / trip finance | Log Book/Trips and Finance | Consume published source contract when available |
| GPS evidence / timestamps | Source event + location/time contract | Display supplied evidence/status only |
| Local database | Existing PWA Dexie / Android Room owners | No direct presentation access |
| Timeline event grouping/projection | Existing Timeline domain/application projection | Reuse; no duplicate calculation in UI |
| Period selection | Timeline presentation transient state, with existing query policy | Own selected date/mode only |
| Location enrichment | Existing NetworkGateway/proxy/provider adapter | Render returned enrichment/fallback only |
| Visual tokens/styles | Timeline feature | Feature-scoped only |
| Global shell/navigation | Application shell | Use existing host; do not redesign |

## 6. Required test matrix

| Area | Minimum scenarios |
|---|---|
| Date navigation | Today, older date jump, previous/next day, previous/next week, month/year crossover |
| Calendar semantics | Asia/Kolkata midnight, Monday week start, Sunday week end |
| Logical shift | Before/at/after 04:00, cross-midnight shift, deferred active-trip rotation, recovery with effective boundary time |
| Event sequence | Shift start/end, pickup, completed ride, cancellation, multiple attempts, mixed event chronology |
| Detail behavior | Open/close event, open/close shift, retain period, scroll and focus restoration |
| Value states | Confirmed, pending, unavailable, invalid, not applicable, explicit zero |
| Query lifecycle | Loading, refresh, stale data, failed read, retry, out-of-order response, abort, unmount |
| Offline/enrichment | Offline core history, Internet Access off, Timeline consent off, no geocoder result, provider error |
| Data integrity | Stable IDs, timestamps/revisions/GPS evidence unchanged, no writes |
| Platform | PWA and Android/Room projection parity |
| Accessibility | Keyboard, focus, screen reader, text scaling, contrast, touch target |
| Responsive/visual | Approved reference viewport, narrow and wide viewports, deterministic screenshot comparison |
| Architecture | Forbidden import checks, no global runtime access, isolated fixture rendering, replacement contract tests |
| Regression | Work/Drive, Performance, Admin, global shell and Android overlay unaffected |

This matrix is a minimum. Existing owner-contract tests remain required; do not duplicate their implementation logic inside Timeline tests.

## 7. Scope-change protocol

If implementation reveals a requirement not covered by the approved contract:

1. Stop the affected slice before changing code outside its boundary.
2. Identify the owning contract/module and the exact missing capability.
3. Explain whether the issue is a presentation gap, a public contract gap, or an upstream source gap.
4. Propose the smallest change in the correct owner document/PR.
5. Record user approval where the change affects product behavior, visual direction, data semantics, ownership, persistence, privacy or platform behavior.
6. Resume only after the dependency is resolved or the unavailable state is explicitly accepted.

Never solve a Timeline display limitation by reaching into another feature's private storage or by calculating an authoritative value in a component.

## 8. Implementation evidence ledger

Maintain this ledger in the implementation PR description or a linked progress document. Fill it with actual evidence; do not mark an item complete based on intent.

| Gate | Evidence to attach | Status |
|---|---|---|
| Baseline audit | Base SHA, file map, source ownership map, current fixture outputs | Not started |
| v2 visual proposal | Artifact link, manifest, checksum, viewport/state inventory | Not started |
| User visual approval | Explicit approval reference/date | Blocked on user approval |
| Component contracts | Typed interface inventory and dependency graph | Not started |
| Architecture enforcement | Test names, command/job, exact forbidden edges checked | Not started |
| Shell/component isolation | Fixture and replacement contract test evidence | Not started |
| Navigation/layers | Behavior tests for all period and detail interactions | Not started |
| Data/lifecycle parity | Regression test reports and source parity evidence | Not started |
| Visual/accessibility | Screenshots, diff review, accessibility test report | Not started |
| Full CI | Run URL, exact head SHA, every required job outcome | Not started |
| Physical device | Owner-run acceptance record | Deferred by user |

## 9. Completion report format

The final implementation report must state:

1. PR link, state and exact head SHA.
2. What changed and what deliberately did not change.
3. The shell/component boundaries and the proof that they are independently replaceable.
4. Architecture checks and isolated component/contract tests run.
5. Behavior, data integrity, offline and platform parity results.
6. Visual reference checksum and comparison result.
7. Accessibility and responsive results.
8. Full CI run and each required job's actual status.
9. Remaining limitations or upstream source gaps.
10. Physical-phone testing status, clearly separate from automated CI.

Do not use "complete", "green", "parity", "isolated" or "approved" unless the corresponding evidence exists for the exact delivered commit.

## 10. Implementation completion record — 15 November 2026

**Implementation complete — CI green.**

- [x] Product and architecture contract approved.
- [x] Visual design ownership delegated to the assistant; no further visual approval checkpoint required.
- [x] v1 retained unchanged as the historical approved baseline; original v2 proposal and provenance preserved.
- [x] Day/Week period navigation, Monday–Sunday week overview, date jump, Today and Asia/Kolkata rollover implemented.
- [x] Chronological logical-shift sequence, event cards, pickup connector, cancellation/completion distinctions and 04:00 rotation status implemented.
- [x] Read-only event and shift detail layers implemented with keyboard focus handling and restoration.
- [x] Replaceable screen shell, navigation, shift section, event card, event detail, shift detail and scoped stylesheet isolated behind presentation contracts.
- [x] Existing feature registration, query/projection, business rules, source ownership, offline behavior and geocoding consent preserved.
- [x] No new persistence, cache, event store, projection engine, query framework, registry or unrelated feature changes.
- [x] Focused calendar, component/shell and 04:00 shift-status regression tests added.
- [x] Implementation PR opened: [PR #88 — Implement decoupled driver-first Timeline presentation](https://github.com/amtalwalkar-sudo/sam-travels/pull/88).
- [x] Exact implementation head: `9c54bd35795dfe57ae2545133c40384cf93103a1`.
- [x] Full CI run [#2391](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/43662127719) passed: architecture, 555 web tests, production build, browser acceptance, Android build/Room/workflow/backup reliability, and integrated regression gate.

Both PR #87 (documentation) and PR #88 (implementation) remain draft, open and unmerged. Physical phone testing remains deferred to the user's final acceptance stage. The implementation is complete from the repository and automated-verification perspective; user device acceptance and merge authorization remain outstanding.
