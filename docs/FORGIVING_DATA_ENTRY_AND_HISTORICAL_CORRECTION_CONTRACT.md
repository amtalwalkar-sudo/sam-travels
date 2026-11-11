# Forgiving Data Entry and Historical Correction Contract

**Document ID:** ST-DATA-CORRECTION  
**Version:** 1.0  
**Status:** Owner-approved product principles and cross-cutting safeguards; implementation and role-specific permissions remain separately gated  
**Scope:** Business data capture, validation, correction, history, data quality, and downstream calculation eligibility across browser PWA, Capacitor Android WebView, and native Android overlay  
**Authority:** This contract owns the shared product/data-integrity policy for forgiving entry and post-submission correction. Feature contracts continue to own their business meanings, event types, calculations, and domain-specific reversal/closure rules.

## 1. Purpose

Sam Travels exists to capture a dependable account of what happened in the business and make that information safely available to operational workflows, reporting, deterministic calculations, and the future Intelligent Business Advisor.

The app must be forgiving to the people entering information while remaining strict about the integrity and explainability of submitted business history.

Drivers and admins will sometimes enter an incorrect amount, date, vehicle, trip association, classification, or other detail. They may also omit an event, submit twice, work offline, or discover an error later. These are expected operating conditions, not exceptional user failures.

The product must make prevention, detection, and recovery understandable and low-friction. It must never solve a user mistake by silently rewriting or erasing submitted history.

This contract records policy and design safeguards. It does not claim that the correction workflow or all required technical controls are implemented, and it does not by itself authorize runtime changes.

## 2. Product principles

1. **Forgiving capture:** make ordinary entry understandable, preserve work, explain validation, and help people recover from mistakes.
2. **Immutable submitted history:** a submitted historical business event is never silently edited or deleted.
3. **Explicit correction:** a post-submission correction is a new, attributable, reasoned, durable event linked to the original.
4. **One current business meaning:** corrected facts must feed the current business view without counting both the original and its correction as two business events.
5. **Historical explainability:** retain what was originally entered, what changed, who changed it, why, and when the correction was recorded.
6. **Calculation integrity:** affected derived results must be recalculated under their approved versioned rules, with their inputs and historical outputs explainable.
7. **Shared semantics:** PWA, Capacitor WebView, and native overlay are capture surfaces, not separate definitions of business truth.
8. **No fabricated certainty:** missing, pending, conflicting, invalid, estimated, and known-zero values remain distinguishable.
9. **Human accountability without blame:** validation should help the user correct an entry, not shame or unnecessarily obstruct them.

## 3. Purpose of the PWA and shared capture model

The PWA is a business-data capture and operating surface, not merely a form collection or dashboard. It must create dependable, durable, recoverable business records for the business's operational and financial history.

- Browser-only PWA uses the existing IndexedDB/Dexie authoritative store.
- Installed Android Capacitor WebView uses the existing Room-backed application/repository boundary.
- The native Android overlay is another Work/Trip capture surface over the same Android business authority; it is not a second business database.
- Shared business workflows, validation, event meaning, identity, correction semantics, and calculation eligibility must not vary by surface.
- Surface-specific controls and layouts may differ, but must submit equivalent typed commands and produce equivalent canonical business outcomes.
- Offline capture, durable acknowledgement, idempotent replay, and recovery continue to follow the existing Data, Local Persistence, Transaction and Recovery, PWA Lifecycle, Android Native, and Driver Overlay contracts.

An entry's source surface is useful provenance. It must not create a different business rule or make one platform's record inherently more authoritative than another's.

## 4. Human-error-tolerant entry and validation

### 4.1 Before submission

Forms and workflows should:

- Preserve in-progress values across supported navigation, interruption, restart, and recovery.
- Make draft versus submitted status unmistakable.
- Allow a user to review the material values and relationships before final submission.
- Explain what is wrong, why it matters, and how to fix it.
- Avoid discarding valid fields because one field failed validation.
- Use safe defaults only where the owning feature contract explicitly defines them; never turn an unknown value into zero or another apparently valid value.
- Allow historical/business dates wherever the owning feature permits them. Do not impose a blanket business-start-date restriction.
- Avoid unnecessary confirmation prompts and repeated data entry.

Drafts and working copies may be edited under the Form Architecture and Behaviour Contract. A draft is not a submitted business event.

### 4.2 Warnings versus blocking validation

Validation must be proportionate to the risk:

- **Block** malformed identities, impossible values, missing required fields, invalid state transitions, broken required relationships, duplicate identity reuse with a different payload, and other conditions that would make the submitted event structurally unsafe or ambiguous.
- **Warn and allow an explicit continuation** for unusual but potentially legitimate amounts, dates, distances, or combinations, unless the owning domain contract defines a hard boundary.
- **Request clarification** when the user can resolve an ambiguity, such as choosing the correct trip or vehicle.
- **Preserve and explain** unresolved work rather than silently dropping it.

A warning is not proof that an entry is wrong. A value that is unusual for one business may be valid for another. Do not invent universal thresholds or silently auto-correct user-entered business facts.

### 4.3 After submission

A successful submission creates an immutable historical business event under the owning feature contract. There must be no ordinary edit or delete control that mutates or erases that event.

If a mistake is discovered after submission, use the correction policy in this contract and any stricter feature-specific contract. Do not re-open a submitted form and overwrite the historical payload.

## 5. Correction model

### 5.1 Append-only correction

A correction is a new immutable business-history event that references the exact original record/event. It does not update the original record in place.

A correction must carry, as applicable:

- Its own stable correction ID and schema/version identity.
- The target original record/event ID and owning feature/type.
- The correction actor's stable identity and authorised role, when authenticated actor identity is available.
- The source surface/channel and the relevant business context.
- The correction's recorded/created timestamp and the corrected business-effective date/value where applicable.
- The exact field or relationship being corrected, or the correction operation being applied.
- The prior value and corrected value, or a clearly defined additive/reversal amount where the domain requires it.
- A human-readable reason; a reason must be required for post-submission corrections.
- A stable command/idempotency identity and expected revision/target state needed for safe retry and conflict handling.
- A link to any earlier correction it supersedes or resolves, without removing that earlier correction.

The original payload, original actor/source, original event time, and original business date remain preserved. A correction cannot rewrite the original event timestamp to make the history appear as if the corrected value was entered originally.

If actor identity cannot be established, the system must not invent an actor or claim personal attribution. The capability must remain visibly attributable only to the level the authenticated system can prove, and actor-attribution gaps must be treated as an acceptance blocker for enabling correction permissions that require a named actor.

### 5.2 Current business view and correction chain

The current business view is a deterministic projection of the original event plus its valid correction chain.

- Apply a valid correction to the targeted fact or relationship.
- Do not count a superseded original value and its replacement as two separate business events.
- Keep all original and correction events available for audit, history, export, backup, and recovery.
- A later correction of an earlier correction is another append-only event; never edit or delete the earlier correction.
- Conflicting corrections, stale targets, invalid chains, or corrections whose target cannot be resolved must remain needs-attention and must not be silently selected by last-write-wins.
- Projection rebuild must be deterministic and produce the same current view on PWA and Android for the same canonical event history.

A correction to one field must not unintentionally change unrelated fields or historical snapshots.

### 5.3 Supported correction intentions

The shared model must be able to represent the following intentions, while each owning feature defines its permitted fields and business semantics:

| Situation | Intended treatment |
|---|---|
| Wrong amount or classification | Append a correction of the specific field; preserve original |
| Wrong business date | Correct the business-effective date while retaining original entry/recorded timestamps |
| Wrong vehicle, trip, loan, or other association | Append a relationship correction with explicit target and validation |
| Omitted legitimate event | Create a new event with its actual business date and later recorded timestamp; do not pretend it was captured earlier |
| Duplicate submission | Retain both submission attempts/evidence; mark the duplicate as duplicate/voided in an auditable way so it is not counted twice |
| Entirely invalid submitted event | Use a domain-approved void/reversal/cancellation event with reason; do not delete the source |
| Correcting an earlier correction | Append a new correction linked to the correction chain |

A missing event is not the same as a correction to an existing event. A duplicate is not the same as a reversal. A reversal of a real financial transaction is not the same as changing an incorrectly entered field.

### 5.4 Domain-specific financial treatment

The shared correction contract does not invent accounting rules.

- Finance-owned payments, reversals, prepayments, settlements, loan schedule effects, and other financial events must follow their Finance-owned contracts.
- Where the domain models a true additional or reversing transaction, retain that event as a separate append-only transaction rather than disguising it as a field replacement.
- Where a correction replaces a mistaken amount, the current business projection must use the corrected amount once; it must not sum the original and replacement as two independent amounts.
- Any correction affecting a balance, allocation, schedule, or closed financial state must be validated atomically by the owning Finance service and follow its approval/contract boundary.
- Do not enable generic correction paths that bypass domain-specific allocation, closure, or settlement safeguards.

## 6. Dates, time, and provenance

Keep these meanings separate wherever applicable:

- **Business-effective/occurred date and time:** when the business event actually belongs.
- **Original captured/received time:** when the app first received the original entry or command.
- **Durable commit time:** when the authoritative store committed it.
- **Correction recorded time:** when the correction was submitted and durably committed.
- **Corrected business-effective value:** the corrected date/time or other fact, if the correction changes it.

A backdated entry or correction must retain the real later capture/commit time. Never backdate the correction's audit timestamp to make it appear contemporaneous with the business event. Use the existing Asia/Kolkata business-date and UTC instant rules in the Data Contract.

Preserve source surface/channel and available actor attribution. GPS, receipt references, and external corroboration remain separate evidence types. Optional corroboration is not a prerequisite for an authorised driver/admin business entry under the approved business-entry policy.

## 7. Data quality and intelligence eligibility

Data quality is purpose-specific. A record may be suitable for one business question but insufficient for another. The advisor must not collapse all quality into a single unvalidated confidence score.

At minimum, downstream consumers must be able to distinguish:

- **Authoritative business record:** an authorised driver/admin entry accepted under the owner's operating policy.
- **Technically validated:** required fields, values, identity, relationships, duplicate/revision rules, and durable commit have passed the owning checks.
- **Corrected:** a valid append-only correction changes the current business interpretation; original and correction history remain available.
- **Pending/incomplete:** capture, durable commit, sync, reconciliation, or a required related event has not reached its defined terminal state.
- **Conflicting/needs attention:** multiple incompatible facts, unresolved correction chains, or broken relationships prevent a safe conclusion.
- **Invalid/voided/reversed:** the owning domain has explicitly excluded or reversed the event through its approved lifecycle.
- **Unknown/not captured:** the system lacks an authorised value or sufficient information.
- **Independently corroborated (optional):** a separate evidence source supports the entry; this is not required for business acceptance by default.

These are descriptive states, not a universal linear ranking. A corrected, technically valid driver-entered fare can be eligible for recorded-fare calculations without an external receipt. A pending or unresolved conflicting fare must not silently contribute as if it were final.

Every calculation/insight must define its own eligibility policy, source coverage, treatment of corrections/reversals, missing-input behaviour, and limitations. It must not infer a value from missing data or treat an invalid/unknown value as zero.

## 8. Historical calculations and reproducibility

A correction may change the business's current understanding of a historical period. The calculation system must support both historical explanation and a current restated view.

- Recalculate the affected current projections and outputs using the approved calculation version and corrected canonical inputs.
- Preserve enough calculation metadata to explain a prior result: calculation identity/version, evaluation time or as-of boundary, input record/correction IDs or stable input snapshot, relevant business period, and result/status.
- Distinguish **as originally known/calculated at that time** from **currently restated using later corrections**.
- Do not silently overwrite a previously published/saved calculation result or claim that a corrected result was what the app knew earlier.
- Do not freeze a known-wrong result as the only current truth: the current view should reflect valid corrections while retaining the earlier result as history.
- A correction must invalidate or refresh only the projections/calculations that depend on the changed fact, using explicit dependency ownership; it must not trigger unrelated recalculation or change unrelated historical results.
- If a metric's approved contract does not define correction/recalculation behaviour, that metric must not silently invent one. Keep the affected result flagged or defer it until the policy is approved.

This contract does not approve any new Performance metric, formula, accounting treatment, or forecast.

## 9. Identity, authority, and permissions

- A correction must be submitted through an authorised capability and validated by the owning domain/application service, not trusted because a UI exposes a button.
- Every correction must have a traceable actor identity/role and reason at the level required by the approved permission policy.
- Drivers and admins must not be given unrestricted mutation rights over submitted history.
- Driver self-correction, admin-initiated correction, admin approval of driver corrections, and correction windows/limits are distinct product permission choices. Their exact combination is **open for explicit owner decision** and must be settled before implementation.
- Admin-entered records require a safe correction path too; they must not be left permanently wrong merely because the existing explicit exception was first described for driver-entered mistakes.
- A permission to correct one feature/event type does not grant authority over another feature's records.
- Master-profile maintenance remains governed by the relevant feature contract and may not rewrite frozen driver/vehicle/assignment snapshots or submitted historical events.

The current repository audit identifies generic Admin actor attribution as an unresolved implementation gap. Do not claim complete actor attribution until the authenticated actor context is carried through the command/service and retained in the durable history.

## 10. Duplicate prevention, offline operation, and recovery

Correction commands are business commands and follow the existing Transaction and Recovery Contract:

- Give each correction a stable command/correction ID and idempotency key.
- Replaying the same correction must resolve to the same durable outcome and must not apply it twice.
- Reuse of an identity with a different correction payload must be rejected.
- Validate the target record, current correction-chain revision, actor authority, and domain invariants at the authoritative transaction boundary.
- Commit the correction event, required current projection/revision changes, and durable outbox work atomically in the authoritative store.
- On Android, Room remains authoritative for WebView and native overlay. In browser-only PWA, IndexedDB remains authoritative.
- A failed/unknown commit must not be shown as a successful correction. Retain retryable intent where the transaction contract requires it.
- Recovery, backup, restore, migration, and replay must preserve original records and the complete correction chain.
- PWA, Capacitor WebView, and overlay acceptance must compare canonical outcomes and correction history, not just UI success messages.

## 11. User experience requirements

The experience should be calm, clear, and proportionate.

- Explain validation in plain language and identify the exact field or relationship that needs attention.
- Distinguish warnings from blocking errors and tell the user how to proceed.
- Before correction submission, show a concise before/after summary, the affected record, and the reason.
- Clearly label the correction as a new historical action; do not present it as editing the old record.
- After commit, show the corrected current value and make the original/correction history accessible.
- Prevent repeated taps from creating duplicate corrections.
- Preserve user input if correction submission is offline, interrupted, rejected, or pending.
- Do not require the user to re-enter unaffected fields.
- Do not expose internal technical vocabulary such as event journal, projection revision, or idempotency key as ordinary user-facing copy.

Presentation remains governed by the UI/UX Shell and Form Architecture contracts. The same business correction semantics must apply to every supported surface.

## 12. Implementation gates and staged delivery

No runtime correction capability is authorized solely by this document. Implementation must be incremental and contract-led.

1. **Inventory and ownership:** enumerate submitted business record types, authoritative services/stores, mutation and removal paths, current actor provenance, relationships, and existing domain-specific reversal/void rules.
2. **Resolve policy:** approve driver/admin correction permissions, approval/intervention paths, correction windows if any, reason requirements, and treatment of financially closed records.
3. **Define canonical correction contract:** specify versioned correction event shape, chain resolution, field/relationship semantics, conflict handling, projection rebuild, and migration/backup participation.
4. **Implement shared foundation:** establish actor attribution, correction command identity, domain validation, atomic persistence, idempotency, recovery, and audit-history reads without adding broad edit/delete controls.
5. **Pilot one bounded event type:** choose a low-risk, representative record type and implement both capture and history paths with tests before expanding.
6. **Expand by feature:** implement driver and admin record types through their owning capabilities, including Finance-specific rules where applicable.
7. **Verify parity and recovery:** run equivalent browser PWA, Capacitor Room-backed WebView, and native overlay tests where the event is supported; include duplicate/replay, offline, process interruption, restore, migration, and correction-chain cases.
8. **Verify calculation effects:** test current restatement, historical as-known outputs, input traceability, and no double counting for every affected approved calculation.
9. **Update evidence:** reconcile the Business-Event Reliability Audit and Form Conformance Audit against the exact verified commit. CI is not physical-device acceptance.

Do not combine the initial documentation contract with runtime implementation, broad UI redesign, new accounting features, or new Performance-screen work.

## 13. Explicit non-goals and compatibility

- This contract does not introduce a separate customer-collection feature or a Fuel capture feature; their absence remains intentional unless separately approved.
- It does not require independent third-party proof for authorised driver/admin entries.
- It does not authorise automatic GPS, receipt, or external-source inference to overwrite a user's business entry.
- It does not authorise generic deletion or unrestricted post-submit editing.
- It does not change approved Work/Trip, Maintenance, Compliance, Loan, payment, prepayment, settlement, backup, restore, or calculation semantics. Their owning contracts remain authoritative for domain-specific behaviour.
- It does not authorise the Performance menu/screen or any new metric.
- It does not claim current implementation completeness.

## 14. Change history

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-11 | Record owner-approved forgiving-entry and immutable-history philosophy; define append-only correction, data-quality and calculation-reproducibility safeguards, open permission decisions, and staged implementation gates. |
