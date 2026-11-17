# Contract and Documentation Index

**Purpose:** Single navigation and authority map for Sam Travels documentation.  
**Repository-wide inventory and reconciliation record:** [Markdown Documentation Audit](MARKDOWN_DOCUMENTATION_AUDIT.md).  
**Authority rule:** Each document owns only the responsibility explicitly assigned below. Supporting documents link to the owner rather than redefining its rules.

## Six-area documentation navigation

The repository is organised into six logical areas. Existing contract paths remain stable; this is a navigation and authority structure, not a mass file move.

1. **Product and business rules** — approved user-visible behaviour and workflow rules.
2. **Calculation foundation** — calculation owners, inputs/outputs, effective dates, rounding and provenance.
3. **Application architecture** — domain/application boundaries, feature contracts, persistence, lifecycle, platform and recovery.
4. **UI/UX architecture** — shell, navigation, screens, forms, components and presentation boundaries.
5. **Quality and release** — CI, architecture enforcement, testing, backup/restore, Android builds and acceptance.
6. **Historical records and references** — audits, plans, completed phases, proposals and reference artifacts.

Start with the [Sam Travels System Blueprint](SAM_TRAVELS_SYSTEM_BLUEPRINT.md) for the end-to-end system map, then use the [Documentation Catalog](DOCUMENTATION_CATALOG.md) for the complete six-area inventory and each document's role. This index remains the authority map for normative owners; the catalog does not create or override authority.

## Conflict and precedence rules

1. Approved product specifications own user-facing product decisions within their scope.
2. Normative technical contracts own architecture, data, persistence, transaction, security, platform and acceptance safeguards.
3. Product specifications cannot waive technical safeguards. Resolve a conflict by updating the owning contract through review.
4. Implementation plans explain delivery. Audits and progress documents record evidence at a named baseline. Neither silently changes product or technical policy.
5. Historical records retain their original baseline and are not current implementation status.
6. Machine-readable versioned contracts are authoritative for the fields and rules they define; prose documents link to them rather than copy their values.

## Project entry points

- [Repository README](../README.md) — project overview and documentation entry point.
- [Sam Travels System Blueprint](SAM_TRAVELS_SYSTEM_BLUEPRINT.md) — end-to-end product, calculation, application, persistence and presentation map.
- [Documentation Catalog](DOCUMENTATION_CATALOG.md) — complete six-area Markdown inventory and document roles.
- [Architecture overview](../ARCHITECTURE.md) — high-level system map; detailed rules remain in the owner contracts below.
- [Development Plan](../DEVELOPMENT_PLAN.md) — staged delivery history and plan.

## Normative contracts and their scope

| Responsibility | Authoritative owner | Scope boundary |
|---|---|---|
| Approved architecture scope and non-goals | [Permanent Application Architecture](PERMANENT_APPLICATION_ARCHITECTURE.md) | Frozen scope; not implementation proof |
| Shared architecture foundation and composition | [Architecture Foundation](ARCHITECTURE_FOUNDATION_CONTRACT.md) | Capability boundaries, application composition and shared guarantees |
| Shared feature inheritance checklist | [Shared Foundation Enforcement](SHARED_FOUNDATION_ENFORCEMENT_CONTRACT.md) | Feature-onboarding checklist derived from Architecture Foundation; detailed rules defer to their owner contracts |
| Capability ownership and cross-feature responsibility | [Authority and Responsibility Map](AUTHORITY_AND_RESPONSIBILITY_ALLOTMENT_MAP.md) | Ownership, dependencies and conflict precedence |
| Feature module and extension boundaries | [Feature Module](FEATURE_MODULE_CONTRACT.md) | Feature APIs, ownership and isolation |
| Feature lifecycle and compatibility | [Feature Extension Lifecycle](FEATURE_EXTENSION_LIFECYCLE_CONTRACT.md) | Enable/disable/retire and upgrade compatibility |
| Data meaning, time, money, units and value states | [Data Contract](../DATA_CONTRACT.md) | Shared data semantics; not platform store selection |
| Forgiving entry, immutable history, append-only correction, data quality and calculation restatement | [Forgiving Data Entry and Historical Correction](FORGIVING_DATA_ENTRY_AND_HISTORICAL_CORRECTION_CONTRACT.md) | Cross-feature correction policy and safeguards; feature contracts retain domain semantics and implementation remains separately gated |
| Runtime authoritative store ownership | [Local Persistence](LOCAL_PERSISTENCE_CONTRACT.md) | IndexedDB versus Room ownership and repository boundaries |
| Record/schema/backup format versioning | [Persistence Schema](PERSISTENCE_SCHEMA_CONTRACT.md) | Envelopes, schema versions, migrations and serialized formats |
| Atomic commands, idempotency, outbox and recovery | [Transaction and Recovery](TRANSACTION_AND_RECOVERY_CONTRACT.md) | Durable intent, completion, replay and restore ordering |
| Shared form mechanics and behaviour | [Form Architecture and Behaviour](FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md) | Form definition, lifecycle, validation boundary and presentation mechanics |
| Admin presentation replacement | [Admin Presentation Replacement](ADMIN_PRESENTATION_REPLACEMENT_CONTRACT.md) | Replaceable Admin shell, six sections, every Admin form and component-level isolation; business rules remain with capability owners |
| Work/Shift and Trip business rules | [Driver Workflow](DRIVER_WORKFLOW_CONTRACT.md) | Authoritative driver state machine and business workflow |
| Work/Trip cross-feature snapshots | [Work Driver Trip Snapshot Integration](WORK_DRIVER_TRIP_SNAPSHOT_INTEGRATION_CONTRACT.md) | Immutable operational context and integration transaction |
| Native overlay behaviour | [Driver Overlay](DRIVER_OVERLAY_CONTRACT.md) | Overlay lifecycle, supported actions, minimize/restore and surface acceptance |
| Native Android platform responsibilities | [Android Native](ANDROID_NATIVE_CONTRACT.md) | Kotlin/OS capabilities; overlay details defer to Driver Overlay |
| PWA browser lifecycle | [PWA Lifecycle](PWA_LIFECYCLE_CONTRACT.md) | Service worker, browser storage and browser lifecycle |
| Shared startup/resume/shutdown | [Application Lifecycle](APPLICATION_LIFECYCLE_CONTRACT.md) | Cross-runtime lifecycle orchestration |
| Runtime capabilities and native bridge | [Runtime Capability and Bridge](RUNTIME_CAPABILITY_AND_BRIDGE_CONTRACT.md) | Runtime identification, capability registry and bridge compatibility |
| GPS evidence and state timing | [Location and State Timing](LOCATION_AND_STATE_TIMING_CONTRACT.md) | Event-scoped location evidence and time semantics |
| User-controlled network access | [Network Access](NETWORK_ACCESS_CONTRACT.md) | Network policy gateway and offline behaviour |
| Shared security and compatibility | [Security and Compatibility](SECURITY_AND_COMPATIBILITY_CONTRACT.md) | Cross-cutting privacy, security and data compatibility |
| WebView-specific security/release compatibility | [WebView Security and Release Compatibility](WEBVIEW_SECURITY_AND_RELEASE_COMPATIBILITY_CONTRACT.md) | WebView/native trust boundary and version compatibility |
| Backup, restore and reset behaviour | [Dropbox Backup](DROPBOX_BACKUP_CONTRACT.md) | User-facing backup destinations, package and restore/reset safeguards |
| Finance loan calculation | [Loan Calculation](FINANCE_LOAN_CALCULATION_CONTRACT.md) | EMI and amortization mathematics |
| Business Start Date cost allocation | [Business Start Date Cost Allocation](BUSINESS_START_DATE_COST_ALLOCATION_CONTRACT.md) | Downstream aggregate pre-business cost pool, 18 equal monthly recovery instalments and daily Full Cost Breakeven distribution; source records and source-owned allocation history remain unchanged |
| Fuel Entry and business expense sources | [Fuel Entry and Business Expense Calculation](FUEL_ENTRY_AND_BUSINESS_EXPENSE_CALCULATION_CONTRACT.md) | Fuel purchase checkpoints/intervals, paid platform fees and challans, miscellaneous expense source dates, and no-double-counting boundaries |
| Work/Shift odometer and daily business kilometres | [Work/Shift Odometer and Daily Business-Kilometre](WORK_SHIFT_ODOMETER_AND_DAILY_DISTANCE_CONTRACT.md) | Confirmed shift odometer facts, 04:00 rotation, fully allocated daily business distance, and explicit legacy/pending states |
| Finance loan payment policy | [Loan Payment Workflow](FINANCE_LOAN_PAYMENT_WORKFLOW_CONTRACT.md) | Proposal only until formally ratified; implementation does not approve this draft |
| Finance loan prepayment | [Loan Prepayment](FINANCE_LOAN_PREPAYMENT_CONTRACT.md) | Prepayment eligibility, schedule effects and validation |
| Finance settlement and closure | [Loan Settlement and Closure](FINANCE_LOAN_SETTLEMENT_AND_CLOSURE_CONTRACT.md) | Approved-for-implementation settlement/closure rules; implementation evidence is separate |
| Performance calculation approval | [Finance and Performance Approval](FINANCE_PERFORMANCE_CALCULATION_APPROVAL.md) | Approval boundary; no unapproved metric/accounting policy |
| Breakeven and Driver Target product rules | [Breakeven and Driver Target Calculation Contract](BREAKEVEN_AND_DRIVER_TARGET_CALCULATION_CONTRACT.md) | v2.0 owner contract for full-cost breakeven and fixed monthly Driver Target; only the first Business-Start-Date month is prorated (Addendum J); runtime calculation, cumulative Passbook and active-driving-day distance summaries are implemented and verified on merged PR #97; production-data reconciliation, physical-device acceptance and final visual approval remain separate gates |
| Admin product behaviour | [Admin Functional Specification](ADMIN_FUNCTIONAL_SPECIFICATION.md) | Approved six-section Admin product behaviour |
| Admin capability technical design | [Admin Capability Contracts](ADMIN_CAPABILITY_CONTRACTS.md) | Historical Slice 1 design; product and shared technical owners prevail |
| Presentation architecture and shell | [UI/UX Shell Foundation](UI_UX_SHELL_FOUNDATION_CONTRACT.md) | Replaceable presentation and interaction architecture |
| Timeline product behaviour | [Timeline Design](TIMELINE_DESIGN_PROPOSAL.md) | Approved Timeline product design; technical safeguards remain with owner contracts |
| Timeline visual artifact fidelity | [Timeline Mockup Fidelity](TIMELINE_MOCKUP_VISUAL_FIDELITY_CONTRACT.md) | Versioned visual reference governance |
| Timeline presentation replacement | [Timeline Presentation Replacement Implementation](TIMELINE_PRESENTATION_REPLACEMENT_IMPLEMENTATION_CONTRACT.md) | Driver-first layered day/week review and decoupled presentation replacement; design decisions delegated to the assistant under the approved product and architecture constraints |
| Timeline replacement execution plan | [Timeline Presentation Replacement Implementation Plan](TIMELINE_PRESENTATION_REPLACEMENT_IMPLEMENTATION_PLAN.md) | Phased delivery, component-isolation checklist, dependency map, test matrix, scope-change protocol and evidence ledger; follows the normative replacement contract |
| Architecture CI checks and limits | [Architecture Enforcement](ARCHITECTURE_ENFORCEMENT.md) | Automated architecture checks and their limits |
| Cross-platform/device acceptance | [Platform Acceptance](PLATFORM_ACCEPTANCE_CONTRACT.md) | Verification layers, release gate and physical-device distinction |
| Android device readiness | [Android Device Readiness](ANDROID_DEVICE_READINESS_CONTRACT.md) | Launch/resume readiness prerequisites |
| Android signing and distribution | [Android Signed Release](ANDROID_SIGNED_RELEASE_CONTRACT.md) | Application identity and signing-key handling |
| Diagnostics and change-impact | [Stage 5 Diagnostics](STAGE_5_DIAGNOSTICS_AND_CHANGE_IMPACT.md) | Bounded local diagnostics and safe change-impact preflight |

## Product specifications and implementation guides

| Document | Role and boundary |
|---|---|
| [Intelligent Business Advisor Vision](INTELLIGENT_BUSINESS_ADVISOR_VISION.md) | Living product vision and future Performance workstream hand-off; proposals remain distinct from approved contracts and implementation authorization |
| [Admin Functional Specification](ADMIN_FUNCTIONAL_SPECIFICATION.md) | Approved product rules; does not prove implementation |
| [Admin Implementation Plan](ADMIN_IMPLEMENTATION_PLAN.md) | Delivery slices and completion definition; follows product and technical owners |
| [Consolidated Product Foundation Implementation Control](CONSOLIDATED_PRODUCT_FOUNDATION_IMPLEMENTATION_CONTROL.md) | Execution contract for PR #97: scope, internal stages, no-drift guardrails, evidence ledger and definition of done; does not override normative owner contracts |
| [Feature Extension Architecture](FEATURE_EXTENSION_ARCHITECTURE.md) | Developer guide for adding features/calculations; not a replacement contract |
| [Dropbox Setup](DROPBOX_SETUP.md) | One-time OAuth and integration setup |
| [Room Migration Runbook](ROOM_MIGRATION_RUNBOOK.md) | Operational procedure; schema policy remains in Persistence Schema |
| [Phase 6 Background Backup Design](PHASE_6_BACKGROUND_BACKUP_DESIGN.md) | Backup implementation design/status; behaviour remains in Dropbox Backup |
| [Phase 6 Manual Acceptance](PHASE_6_MANUAL_ACCEPTANCE.md) | Owner-run Dropbox/device acceptance; not CI evidence |
| [Driver Location Reliability Implementation](DRIVER_LOCATION_RELIABILITY_IMPLEMENTATION.md) | Implementation workstream; GPS policy remains in Location and State Timing |
| [Development Plan](../DEVELOPMENT_PLAN.md) | Staged delivery plan; current PR and exact-SHA evidence govern current status |

## Audits, progress and historical records

These records are evidence snapshots, not live policy. Their recorded base SHA, PR and CI run remain historical.

- [Repository-wide Markdown Documentation Audit](MARKDOWN_DOCUMENTATION_AUDIT.md) — original Phase 1/Phase 2 baseline and subsequent documentation reconciliation history; see the current six-area inventory in the Documentation Catalog.
- [Form Conformance Audit](FORM_CONFORMANCE_AUDIT.md) — form implementation evidence and remaining gaps.
- [Business-Event Reliability Audit](BUSINESS_EVENT_RELIABILITY_AUDIT.md) — current baseline and in-progress audit of PWA/Capacitor capture reliability, evidence provenance, corroboration, and intelligence eligibility; historical reliability audits remain historical.
- [Breakeven Source Reconciliation Audit](BREAKEVEN_SOURCE_RECONCILIATION_AUDIT.md) — source-owner reconciliation and correction/effective-date provenance evidence for Compliance, EMI/prepayment/closure, trip and expense attribution, fuel intervals, and daily business kilometres; see the current PR #97 evidence section for implementation status and the remaining production-data boundary.
- [Calculation Authority and Application Wiring Audit v1](CALCULATION_AUTHORITY_AND_APPLICATION_WIRING_AUDIT_V1.md) — PR #96 baseline audit of calculation ownership, source-to-consumer wiring, fixed-cost allocation authority, snapshot consistency, policy conflicts, UI/UX shell and screen independence, and consolidated correction priorities.
- [Repository-Wide Architecture Foundation Gap Register](REPOSITORY_WIDE_ARCHITECTURE_FOUNDATION_GAP_REGISTER.md) — current-main reconciliation and cross-layer gap register at commit `a99ea6f48b05d3df1e35a72266acdaa127c010d7`; in-progress evidence, not a completion certificate.

- [Admin Baseline Audit](ADMIN_BASELINE_AUDIT.md) — pre-implementation Admin starting point.
- [Admin Stage 0 Source and Test Inventory](ADMIN_STAGE_0_SOURCE_AND_TEST_INVENTORY.md) — exact-main source inventory, workflow-to-owner parity matrix, test/backup coverage and confirmed replacement gates.
- [Permanent Architecture Audit](PERMANENT_APPLICATION_ARCHITECTURE_AUDIT.md) — original Stage 0 baseline.
- [Permanent Architecture Progress](PERMANENT_APPLICATION_ARCHITECTURE_PROGRESS.md) — staged implementation history.
- [Stage 2 Audit](PERMANENT_APPLICATION_ARCHITECTURE_STAGE_2_AUDIT.md), [Stage 4 Audit](PERMANENT_APPLICATION_ARCHITECTURE_STAGE_4_AUDIT.md), [Stage 5 Audit](PERMANENT_APPLICATION_ARCHITECTURE_STAGE_5_AUDIT.md) — stage-specific evidence.
- [Architecture Hardening Implementation Contract](ARCHITECTURE_HARDENING_IMPLEMENTATION_CONTRACT.md) and [Reliability Audit](RELIABILITY_AUDIT.md) — historical implementation/reliability records.
- [Authoritative Workflow v2 Migration and Integration](AUTHORITATIVE_WORKFLOW_V2_MIGRATION_AND_INTEGRATION.md) — retained migration/product decision reference; current implementation semantics are owned by Driver Workflow and Work/Trip Snapshot Integration.
- [Phase 2 Foundation](PHASE_2_FOUNDATION.md) and [Phase 3 Workflow](PHASE_3_WORKFLOW.md) — completed phase records.

## Machine-readable contracts and reference artifacts

- `contracts/driver-swipe-presentation-v1.json` — versioned interaction policy and action labels.
- `contracts/driver-presentation-v1.json` — versioned shared presentation tokens, states and motion.
- [Timeline mockup reference README](reference/timeline-mockup/README.md) and [manifest](reference/timeline-mockup/manifest-v1.md) — approved immutable visual artifact.
- [Geocoder service guide](../services/geocoder/README.md) — proxy setup and endpoint; network/privacy policy remains in owner contracts.

## Current evidence discipline

- PR #69 is a historical merged integrated reliability and cross-platform workstream; its recorded head and CI run are evidence for that baseline, not a live open workstream.
- PR #97 is the merged architecture/performance implementation. Exact head `ffb26044fd9d9e4c2989f904eddecfed632122d0` passed Architecture, Web, Android and Integrated regression in [workflow run #44101565896](https://github.com/amtalwalkar-sudo/sam-travels/actions/runs/44101565896). Production geocoder verification was skipped; physical-phone acceptance remains deferred.
- For current Performance status, use the post-PR #93 [Performance End-to-End Conformance Audit](PERFORMANCE_END_TO_END_IMPLEMENTATION_CONFORMANCE_AUDIT.md); for cross-domain calculation ownership and wiring, use the [Calculation Authority and Application Wiring Audit v1](CALCULATION_AUTHORITY_AND_APPLICATION_WIRING_AUDIT_V1.md).
- Green CI proves only the jobs and tests it ran. It does not prove physical-device acceptance, OS/OEM force-stop behaviour or live Dropbox account acceptance.
- The [Form Conformance Audit](FORM_CONFORMANCE_AUDIT.md) records form-specific evidence. It does not certify every possible form/surface/lifecycle combination.
- Historical audit documents must not be rewritten to appear as if they were performed on the current commit.
