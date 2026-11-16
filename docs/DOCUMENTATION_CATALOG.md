# Documentation Catalog

**Purpose:** Repository-wide navigation and role inventory for Markdown documentation.  
**Structure:** Six primary navigation areas. Existing files remain at their current paths to preserve history and avoid needless link churn; this catalog provides logical organisation without flattening or deleting content.  
**Authority:** Use [Contract and Documentation Index](CONTRACT_INDEX.md) to identify normative owners. This catalog is not itself a source of business or technical policy.  
**System overview:** [Sam Travels System Blueprint](SAM_TRAVELS_SYSTEM_BLUEPRINT.md).

## How to read this catalog

- **Owner contract/specification:** normative within its explicitly stated scope.
- **Implementation plan/guide:** delivery or operating instructions; does not approve product rules.
- **Audit/evidence:** a snapshot tied to a named baseline; not a live policy source.
- **Historical/reference:** retained for provenance, proposals or artifacts; not current implementation status.
- A document can be useful to more than one area. It is listed once under its primary navigation purpose.

## 1. Product and business rules

| Document | Primary role |
|---|---|
| [Admin Functional Specification](ADMIN_FUNCTIONAL_SPECIFICATION.md) | Approved Admin product behaviour and bounded scope |
| [Finance Loan Payment Workflow Contract](FINANCE_LOAN_PAYMENT_WORKFLOW_CONTRACT.md) | Proposed payment workflow; not ratified product/accounting policy |
| [Driver Workflow Contract](DRIVER_WORKFLOW_CONTRACT.md) | Work/Shift and Trip business workflow rules |
| [Work/Shift Odometer and Daily Distance Contract](WORK_SHIFT_ODOMETER_AND_DAILY_DISTANCE_CONTRACT.md) | Odometer facts, operational date, shift rotation and distance allocation |
| [Work Driver Trip Snapshot Integration](WORK_DRIVER_TRIP_SNAPSHOT_INTEGRATION_CONTRACT.md) | Immutable Driver/Vehicle/assignment context across workflow boundaries |
| [Fuel Entry and Business Expense Contract](FUEL_ENTRY_AND_BUSINESS_EXPENSE_CALCULATION_CONTRACT.md) | Fuel purchase and business-expense source rules |
| [Finance Loan Prepayment Contract](FINANCE_LOAN_PREPAYMENT_CONTRACT.md) | Prepayment and schedule-shortening policy |
| [Finance Loan Settlement and Closure Contract](FINANCE_LOAN_SETTLEMENT_AND_CLOSURE_CONTRACT.md) | Loan settlement/closure behaviour |
| [Timeline Design Proposal](TIMELINE_DESIGN_PROPOSAL.md) | Frozen Timeline product design and approved presentation baseline |
| [Intelligent Business Advisor Vision](INTELLIGENT_BUSINESS_ADVISOR_VISION.md) | Product vision; not implementation authority |
| [Authoritative Workflow v2 Migration and Integration](AUTHORITATIVE_WORKFLOW_V2_MIGRATION_AND_INTEGRATION.md) | Retained migration/product decision history; current semantics defer to current owner contracts |

## 2. Calculation foundation

| Document | Primary role |
|---|---|
| [Authority and Responsibility Allotment Map](AUTHORITY_AND_RESPONSIBILITY_ALLOTMENT_MAP.md) | Capability ownership and calculation responsibility map |
| [Business Start Date Cost Allocation Contract](BUSINESS_START_DATE_COST_ALLOCATION_CONTRACT.md) | Effective-date allocation for eligible pre-business costs |
| [Business Start Date Allocation Implementation Plan](BUSINESS_START_DATE_COST_ALLOCATION_IMPLEMENTATION_PLAN.md) | Delivery plan; not a second allocation policy |
| [Breakeven and Driver Target Calculation Contract](BREAKEVEN_AND_DRIVER_TARGET_CALCULATION_CONTRACT.md) | Breakeven and fixed-rupee driver target calculation semantics |
| [Finance Loan Calculation Contract](FINANCE_LOAN_CALCULATION_CONTRACT.md) | EMI/amortization calculation authority |
| [Finance and Performance Calculation Approval](FINANCE_PERFORMANCE_CALCULATION_APPROVAL.md) | Approved calculation decisions and scope |
| [Calculation Authority and Application Wiring Audit](CALCULATION_AUTHORITY_AND_APPLICATION_WIRING_AUDIT_V1.md) | Calculation owner/consumer audit, policy conflicts and wiring findings |
| [Breakeven Source Reconciliation Audit](BREAKEVEN_SOURCE_RECONCILIATION_AUDIT.md) | Historical source-contract/code comparison evidence |
| [Performance End-to-End Conformance Audit](PERFORMANCE_END_TO_END_IMPLEMENTATION_CONFORMANCE_AUDIT.md) | Performance implementation and acceptance evidence |
| [Temporary Breakeven Sanity Check](TEMPORARY_BREAKEVEN_SANITY_CHECK.md) | Temporary diagnostic/reference; not normative policy |

## 3. Application architecture

| Document | Primary role |
|---|---|
| [Architecture overview](../ARCHITECTURE.md) | High-level system architecture |
| [Shared Data Contract](../DATA_CONTRACT.md) | Shared data meaning, dates, units, values and record semantics |
| [Permanent Application Architecture](PERMANENT_APPLICATION_ARCHITECTURE.md) | Approved architecture scope and non-goals |
| [Architecture Foundation Contract](ARCHITECTURE_FOUNDATION_CONTRACT.md) | Shared application, capability and reliability guarantees |
| [Admin Capability Contracts](ADMIN_CAPABILITY_CONTRACTS.md) | Admin capability interfaces and technical obligations |
| [Forgiving Data Entry and Historical Correction](FORGIVING_DATA_ENTRY_AND_HISTORICAL_CORRECTION_CONTRACT.md) | Cross-feature correction, history and restatement safeguards |
| [Feature Module Contract](FEATURE_MODULE_CONTRACT.md) | Feature ownership, public interfaces and module boundaries |
| [Feature Extension Architecture](FEATURE_EXTENSION_ARCHITECTURE.md) | Developer guidance for feature contributions |
| [Feature Extension Lifecycle](FEATURE_EXTENSION_LIFECYCLE_CONTRACT.md) | Feature lifecycle and compatibility |
| [Shared Foundation Enforcement](SHARED_FOUNDATION_ENFORCEMENT_CONTRACT.md) | Feature-onboarding checklist derived from owner contracts |
| [Local Persistence Contract](LOCAL_PERSISTENCE_CONTRACT.md) | IndexedDB/Room authoritative-store ownership |
| [Persistence Schema Contract](PERSISTENCE_SCHEMA_CONTRACT.md) | Persisted formats, schema versions and migration compatibility |
| [Transaction and Recovery Contract](TRANSACTION_AND_RECOVERY_CONTRACT.md) | Atomicity, idempotency, outbox and recovery |
| [Application Lifecycle Contract](APPLICATION_LIFECYCLE_CONTRACT.md) | Startup, resume, shutdown and action gates |
| [PWA Lifecycle Contract](PWA_LIFECYCLE_CONTRACT.md) | Browser/PWA lifecycle responsibilities |
| [Runtime Capability and Bridge Contract](RUNTIME_CAPABILITY_AND_BRIDGE_CONTRACT.md) | Runtime selection and native bridge boundary |
| [Android Native Contract](ANDROID_NATIVE_CONTRACT.md) | Native Android platform responsibilities |
| [Location and State Timing Contract](LOCATION_AND_STATE_TIMING_CONTRACT.md) | GPS evidence and time integrity |
| [Network Access Contract](NETWORK_ACCESS_CONTRACT.md) | User-controlled network policy gateway |
| [Security and Compatibility Contract](SECURITY_AND_COMPATIBILITY_CONTRACT.md) | Cross-cutting security and compatibility |
| [WebView Security and Release Compatibility](WEBVIEW_SECURITY_AND_RELEASE_COMPATIBILITY_CONTRACT.md) | WebView/native trust and release compatibility |

## 4. UI/UX architecture

| Document | Primary role |
|---|---|
| [UI/UX Shell Foundation Contract](UI_UX_SHELL_FOUNDATION_CONTRACT.md) | Replaceable shell, screens and presentation boundaries |
| [Form Architecture and Behaviour Contract](FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md) | Shared form mechanics; feature contracts own business validation |
| [Admin Presentation Replacement Contract](ADMIN_PRESENTATION_REPLACEMENT_CONTRACT.md) | Replaceable Admin sections, forms and presentation |
| [Driver Overlay Contract](DRIVER_OVERLAY_CONTRACT.md) | Native overlay interaction and lifecycle |
| [Work Drive Mobile UX Implementation Contract](WORK_DRIVE_MOBILE_UX_IMPLEMENTATION_CONTRACT.md) | Work/Drive mobile presentation implementation |
| [Timeline Mockup Visual Fidelity Contract](TIMELINE_MOCKUP_VISUAL_FIDELITY_CONTRACT.md) | Reference visual fidelity and artifact constraints |
| [Timeline Presentation Replacement Contract](TIMELINE_PRESENTATION_REPLACEMENT_IMPLEMENTATION_CONTRACT.md) | Timeline presentation replacement boundary |
| [Timeline Presentation Replacement Plan](TIMELINE_PRESENTATION_REPLACEMENT_IMPLEMENTATION_PLAN.md) | Timeline presentation delivery plan |

## 5. Quality and release

| Document | Primary role |
|---|---|
| [Architecture Enforcement](ARCHITECTURE_ENFORCEMENT.md) | Executable source-boundary and architecture CI rules |
| [Admin Implementation Plan](ADMIN_IMPLEMENTATION_PLAN.md) | Admin delivery plan and completion gates |
| [Platform Acceptance Contract](PLATFORM_ACCEPTANCE_CONTRACT.md) | Cross-platform acceptance gates |
| [Android Device Readiness Contract](ANDROID_DEVICE_READINESS_CONTRACT.md) | Android permissions, settings and device readiness |
| [Android Signed Release Contract](ANDROID_SIGNED_RELEASE_CONTRACT.md) | Signed APK/release requirements |
| [Dropbox Backup Contract](DROPBOX_BACKUP_CONTRACT.md) | Backup/restore lifecycle and compatibility |
| [Dropbox Setup](DROPBOX_SETUP.md) | Operator setup guide |
| [Room Migration Runbook](ROOM_MIGRATION_RUNBOOK.md) | Operational Room migration procedure |
| [Phase 6 Background Backup Design](PHASE_6_BACKGROUND_BACKUP_DESIGN.md) | Backup implementation design/status |
| [Phase 6 Manual Acceptance](PHASE_6_MANUAL_ACCEPTANCE.md) | Manual device/account acceptance checklist |
| [Form Conformance Audit](FORM_CONFORMANCE_AUDIT.md) | Form implementation and acceptance evidence |
| [Business Event Reliability Audit](BUSINESS_EVENT_RELIABILITY_AUDIT.md) | Event capture/reliability evidence |
| [Reliability Audit](RELIABILITY_AUDIT.md) | Reliability findings at its recorded baseline |
| [Driver Location Reliability Implementation](DRIVER_LOCATION_RELIABILITY_IMPLEMENTATION.md) | GPS reliability implementation record |
| [Stage 5 Diagnostics and Change Impact](STAGE_5_DIAGNOSTICS_AND_CHANGE_IMPACT.md) | Diagnostics/change-impact verification |
| [Development Plan](../DEVELOPMENT_PLAN.md) | Staged delivery and exit-gate history |

## 6. Historical records and references

These documents are retained for auditability. Their original baseline, scope and conclusions must not be rewritten to imply a later inspection.

| Document | Historical/reference role |
|---|---|
| [Markdown Documentation Audit](MARKDOWN_DOCUMENTATION_AUDIT.md) | Repository-wide documentation audit and reconciliation history |
| [Documentation Catalog](DOCUMENTATION_CATALOG.md) | Six-area navigation and complete Markdown role inventory |
| [Permanent Architecture Audit](PERMANENT_APPLICATION_ARCHITECTURE_AUDIT.md) | Original Stage 0 architecture baseline |
| [Permanent Architecture Progress](PERMANENT_APPLICATION_ARCHITECTURE_PROGRESS.md) | Staged architecture implementation history |
| [Permanent Architecture Stage 2 Audit](PERMANENT_APPLICATION_ARCHITECTURE_STAGE_2_AUDIT.md) | Stage 2 evidence snapshot |
| [Permanent Architecture Stage 4 Audit](PERMANENT_APPLICATION_ARCHITECTURE_STAGE_4_AUDIT.md) | Stage 4 evidence snapshot |
| [Permanent Architecture Stage 5 Audit](PERMANENT_APPLICATION_ARCHITECTURE_STAGE_5_AUDIT.md) | Stage 5 evidence snapshot |
| [Permanent Architecture Stage 6 Audit](PERMANENT_APPLICATION_ARCHITECTURE_STAGE_6_AUDIT.md) | Stage 6 evidence snapshot |
| [Admin Baseline Audit](ADMIN_BASELINE_AUDIT.md) | Pre-implementation Admin baseline |
| [Admin Stage 0 Source and Test Inventory](ADMIN_STAGE_0_SOURCE_AND_TEST_INVENTORY.md) | Admin source/test inventory at its recorded SHA |
| [Phase 2 Foundation](PHASE_2_FOUNDATION.md) | Completed phase record |
| [Phase 3 Workflow](PHASE_3_WORKFLOW.md) | Completed phase record |
| [Architecture Hardening Implementation Contract](ARCHITECTURE_HARDENING_IMPLEMENTATION_CONTRACT.md) | Historical implementation workstream record |
| [Reference Timeline README](reference/timeline-mockup/README.md) | Reference artifact navigation and provenance |
| [Timeline manifest v1](reference/timeline-mockup/manifest-v1.md) | Immutable visual artifact manifest |
| [Timeline manifest v2 proposal](reference/timeline-mockup/manifest-v2-proposal.md) | Proposed reference evolution; not approval to alter v1 |
| [Geocoder service README](../services/geocoder/README.md) | Service-specific setup/endpoint guidance |

## Root-level documentation

- [README](../README.md) — product and developer entry point.

## Machine-readable and non-Markdown references

- `contracts/driver-swipe-presentation-v1.json` — versioned driver interaction policy.
- `contracts/driver-presentation-v1.json` — versioned presentation states/tokens/motion.
- The geocoder service setup is listed once under Historical Records and References.
- The Timeline reference directory contains immutable and proposed mockup manifests; see its README.

## Maintenance rules

1. Every normative rule has one owning contract/specification. Supporting documents link to it.
2. Each document declares its status and scope near the top. Use **approved**, **proposed**, **implemented**, **verified**, **accepted**, **historical**, and **superseded** precisely; these are not synonyms.
3. An implementation plan never approves a product rule. A test never silently changes one.
4. Audits identify the inspected commit and distinguish CI, emulator, physical-device and live-account evidence.
5. Do not delete historical records to make the index appear cleaner. Mark superseded material and link to the current owner.
6. Keep existing paths stable unless a deliberate move includes updating and validating every inbound relative link.
7. Update this catalog and the Contract Index when a document is added, moved, superseded or changes authority.
