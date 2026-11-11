# Repository Markdown Documentation Audit and Reconciliation

**Status:** Phase 1 inventory and authority audit complete; Phase 2 reconciliation complete. The original Phase 1 baseline covered 63 Markdown files; the current repository contains 65, including this audit and the Contract Index.  
**Audit baseline:** PR #69 branch `reliability/stage-6-process-recovery-proof`, commit `1d4f5ddd08ad38591dba82b3537f353d8705ca30`.  
**Repository:** `amtalwalkar-sudo/sam-travels`  
**Phase 1 inventory:** 63 tracked Markdown files; the audit and Contract Index were added afterward, bringing the current total to 65.  
**CI evidence at baseline:** Sam Travels CI run #42979514553 completed successfully on the exact Phase 1 baseline SHA. The subsequent current-head verification is recorded below. CI is repository verification evidence, not proof of physical-device acceptance.

**Latest exact PR-head verification:** `fb68b569d5a40b409aba310077ede31711374d68`; CI run #42986058063 completed successfully. Architecture, web regression/build, Android reliability gate and integrated regression all passed. Production geocoder verification was skipped; merged-main APK publication was not run for this PR. Physical-device and live Dropbox acceptance remain separate.

## 1. Purpose and method

This audit covers every tracked `.md` file in the repository, including root-level files, implementation and historical records, reference assets, and service documentation. It is not limited to `docs/`.

The audit used the complete recursive Git tree at the baseline SHA, inspected the purpose, headings, status/authority statements and cross-references of all 63 files, and performed a closer authority/overlap review of the architecture, persistence, workflow, form, overlay, Finance, backup, platform and acceptance documents.

The audit distinguishes:
- **Normative contract:** owns a defined rule or behaviour.
- **Product specification:** records approved user-facing behaviour; does not replace technical safeguards.
- **Implementation guide/plan:** explains how approved requirements are delivered; does not redefine them.
- **Audit/evidence:** records what was inspected or verified at a particular baseline.
- **Historical record/reference:** retained for provenance or a specific artifact; not a current source of rules.

A green CI result does not automatically resolve documentation statements that still say implementation or acceptance is pending. Those statements must be reconciled against exact evidence in Phase 2.

## 2. Principal findings

### 2.1 Authority is present, but spread across too many coordination documents

The repository has several overlapping architecture-level documents:
- `ARCHITECTURE.md`
- `docs/PERMANENT_APPLICATION_ARCHITECTURE.md`
- `docs/ARCHITECTURE_FOUNDATION_CONTRACT.md`
- `docs/FEATURE_MODULE_CONTRACT.md`
- `docs/AUTHORITY_AND_RESPONSIBILITY_ALLOTMENT_MAP.md`
- `docs/SHARED_FOUNDATION_ENFORCEMENT_CONTRACT.md`
- `docs/ARCHITECTURE_ENFORCEMENT.md`
- `docs/ARCHITECTURE_HARDENING_IMPLEMENTATION_CONTRACT.md`

They contain useful and mostly compatible rules, but the reader must infer which document owns architecture scope, capability ownership, shared guarantees, implementation enforcement, and completion evidence. Phase 2 must make these boundaries explicit and replace repeated normative text with links to the owner contract.

### 2.2 Persistence, schema and recovery responsibilities overlap

`DATA_CONTRACT.md`, `LOCAL_PERSISTENCE_CONTRACT.md`, `PERSISTENCE_SCHEMA_CONTRACT.md`, `TRANSACTION_AND_RECOVERY_CONTRACT.md`, and sections of `ARCHITECTURE_FOUNDATION_CONTRACT.md` repeat parts of the authoritative-store, event, revision, migration, transaction and recovery rules.

The rules are not interchangeable:
- Runtime-wide store ownership belongs in the local persistence contract.
- Persisted envelope/schema/version compatibility belongs in the persistence schema contract.
- Durable intent, atomic completion, idempotency, outbox and recovery ordering belong in the transaction/recovery contract.
- Cross-domain data semantics and value/time meaning belong in the data contract.

The architecture foundation should state the shared requirement and link to those owners, not become a second detailed specification for every one of them.

### 2.3 Work/Trip and overlay rules need a clear owner hierarchy

The current owner split is substantially established:
- `DRIVER_WORKFLOW_CONTRACT.md` owns Work/Shift and Trip business workflow rules.
- `WORK_DRIVER_TRIP_SNAPSHOT_INTEGRATION_CONTRACT.md` owns the driver/trip snapshot integration details.
- `DRIVER_OVERLAY_CONTRACT.md` owns native overlay visibility, presentation, supported actions and overlay-specific interaction.
- `TRANSACTION_AND_RECOVERY_CONTRACT.md` owns durable command and recovery guarantees shared by surfaces.
- `ANDROID_NATIVE_CONTRACT.md` owns native platform responsibilities and must defer overlay-specific behaviour to the overlay contract.

`AUTHORITATIVE_WORKFLOW_V2_MIGRATION_AND_INTEGRATION.md` already says it is a retained product/migration reference and that current owner contracts prevail. That distinction should be reflected consistently in the index and document labels.

### 2.4 Form contract and form audit are correctly different document types, but audit evidence is stale

`FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md` is the normative form contract. `FORM_CONFORMANCE_AUDIT.md` is an evidence register, not a second form specification.

The audit contains valuable detailed implementation evidence, but its top-level latest-SHA evidence predates the current baseline. It must be reconciled against the exact PR #69 head and current CI in Phase 2. The contract should remain stable; the audit should carry the changing implementation/acceptance status.

### 2.5 Admin documents mix product authority, technical contracts, plans and old baseline evidence

The intended separation is:
- `ADMIN_FUNCTIONAL_SPECIFICATION.md`: approved product behaviour.
- `ADMIN_CAPABILITY_CONTRACTS.md`: capability-level technical contracts and persistence/backup obligations.
- `ADMIN_IMPLEMENTATION_PLAN.md`: delivery sequence and implementation gates.
- `ADMIN_BASELINE_AUDIT.md`: historical starting-point audit.

The current status statements are inconsistent with later implementation evidence: the baseline audit says runtime implementation had not started; capability contracts still describe a proposal and pre-write gate; the functional specification reports only partial implementation; the implementation plan does not reflect the later form migrations. Phase 2 must preserve the original audit as historical evidence, update current status only where exact implementation evidence supports it, and ensure product requirements are not weakened.

### 2.6 Finance contracts contain stale lifecycle labels

The calculation contract is approved. The payment workflow remains an unratified proposal while the form conformance audit records migrated Loan payment UI and service-backed submission. The payment document's section heading “Approved allocation policy” contradicted its explicit unratified status; Phase 2 corrects the heading to “Proposed allocation policy (not ratified)”. Prepayment describes implemented behaviour; settlement remains approved for implementation. Implementation evidence must not be treated as retroactive product or policy approval.

### 2.7 Backup, lifecycle and platform acceptance are described in multiple places

The backup responsibilities are spread across:
- `DROPBOX_BACKUP_CONTRACT.md` — backup/restore product and safety behaviour.
- `TRANSACTION_AND_RECOVERY_CONTRACT.md` — transaction/checkpoint/recovery ordering.
- `PHASE_6_BACKGROUND_BACKUP_DESIGN.md` — implementation design/status.
- `PHASE_6_MANUAL_ACCEPTANCE.md` — owner-run real-account/device procedure.
- `DROPBOX_SETUP.md` — one-time integration setup.

Likewise, lifecycle and release acceptance are split among application lifecycle, PWA lifecycle, Android native, runtime bridge, WebView security/release compatibility, device readiness, signed release, and platform acceptance contracts. These should remain separate where their platform responsibilities differ, but each needs an explicit scope and a clear pointer to the shared owner contracts.

### 2.8 Historical audits and phase records are valuable, but must not look like live authority

The permanent-architecture Stage 0/2/4/5 audits, progress record, Phase 2/3/6 records, and reliability audit retain useful evidence. Their historical baselines and old PR/run references must not be rewritten as though they were performed on the current SHA. They should be labelled as historical snapshots and linked from a current status/evidence index.

### 2.9 Presentation and Timeline are distinct responsibilities

`UI_UX_SHELL_FOUNDATION_CONTRACT.md` governs presentation architecture and interaction boundaries; it explicitly says some earlier shell prescriptions are superseded by the clean-slate Stage 4 decision. Timeline's product design and approved SVG visual reference have their own product and visual-fidelity documents. Overlay presentation has its own owner contract and versioned presentation JSON contract.

Phase 2 should avoid collapsing these into one generic UI document. It should state the boundaries and cross-platform reuse rules while preserving platform-specific presentation.

## 3. Proposed authoritative contract map

This is the target ownership map for Phase 2. Existing documents should be reused and clarified wherever possible; new contracts should be created only when an existing owner cannot reasonably carry the responsibility.

| Responsibility | Authoritative owner after reconciliation | Supporting documents must do |
|---|---|---|
| Product/architecture scope and non-goals | `PERMANENT_APPLICATION_ARCHITECTURE.md` | Summarise scope and link; do not restate implementation mechanics |
| Architecture capability boundaries and application composition | `ARCHITECTURE_FOUNDATION_CONTRACT.md` | Other architecture docs defer to this shared foundation |
| Feature ownership, extension and lifecycle | `FEATURE_MODULE_CONTRACT.md` plus `FEATURE_EXTENSION_LIFECYCLE_CONTRACT.md` for lifecycle/version compatibility | Guides explain onboarding; enforcement docs specify checks |
| Capability responsibility and cross-feature ownership | `AUTHORITY_AND_RESPONSIBILITY_ALLOTMENT_MAP.md` | Product/feature documents link to owner; no conflicting owner tables |
| Data meaning, timestamps, money, units and unavailable/zero semantics | `DATA_CONTRACT.md` | Feature contracts add domain-specific rules only |
| Runtime authoritative database ownership | `LOCAL_PERSISTENCE_CONTRACT.md` | Architecture and data docs link to it |
| Persisted record/schema/migration/backup format versions | `PERSISTENCE_SCHEMA_CONTRACT.md` | Runbooks explain execution, not alternate schema policy |
| Durable commands, atomicity, idempotency, outbox and recovery | `TRANSACTION_AND_RECOVERY_CONTRACT.md` | Lifecycle/platform docs define platform triggers and link to this owner |
| Shared forms and form lifecycle/presentation mechanics | `FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md` | Feature forms declare their business-specific rules; audit records conformance |
| Work/Shift and Trip business workflow | `DRIVER_WORKFLOW_CONTRACT.md` | Overlay and integration docs consume the workflow contract |
| Work/Trip cross-feature snapshots | `WORK_DRIVER_TRIP_SNAPSHOT_INTEGRATION_CONTRACT.md` | Migration reference points to this current owner |
| Native overlay behaviour | `DRIVER_OVERLAY_CONTRACT.md` | Android native contract links to it; versioned JSON defines machine-readable presentation tokens |
| Shared presentation/shell architecture | `UI_UX_SHELL_FOUNDATION_CONTRACT.md` | Feature/overlay/Timeline docs define scoped presentation only |
| Timeline product behaviour | `TIMELINE_DESIGN_PROPOSAL.md` | Visual reference contract governs fidelity to the approved artifact |
| GPS evidence and time integrity | `LOCATION_AND_STATE_TIMING_CONTRACT.md` | Workflow and platform docs link to the event-evidence owner |
| User-controlled network policy | `NETWORK_ACCESS_CONTRACT.md` | Dropbox/geocoder setup docs describe integrations under this policy |
| Backup/restore/reset behaviour and safety | `DROPBOX_BACKUP_CONTRACT.md` | Setup/manual docs provide operational steps; transaction contract owns atomic recovery ordering |
| Finance loan calculations | `FINANCE_LOAN_CALCULATION_CONTRACT.md` | Loan transaction contracts must not redefine EMI mathematics |
| Finance loan payments | `FINANCE_LOAN_PAYMENT_WORKFLOW_CONTRACT.md` | Implementation status must reflect service and form evidence |
| Finance prepayments | `FINANCE_LOAN_PREPAYMENT_CONTRACT.md` | Calculation/service implementation remains Finance-owned |
| Finance settlement/closure | `FINANCE_LOAN_SETTLEMENT_AND_CLOSURE_CONTRACT.md` | Must defer to approved loan calculation and payment policy |
| Performance calculation approvals | `FINANCE_PERFORMANCE_CALCULATION_APPROVAL.md` | No unapproved metrics or accounting rules |
| Admin product behaviour | `ADMIN_FUNCTIONAL_SPECIFICATION.md` | Technical and implementation documents do not override product approval |
| Admin capability persistence/ownership | `ADMIN_CAPABILITY_CONTRACTS.md` after status and authority reconciliation | Baseline audit becomes historical; implementation plan tracks slices |
| Platform-specific lifecycle and security | `APPLICATION_LIFECYCLE_CONTRACT.md`, `PWA_LIFECYCLE_CONTRACT.md`, `ANDROID_NATIVE_CONTRACT.md`, `RUNTIME_CAPABILITY_AND_BRIDGE_CONTRACT.md`, `WEBVIEW_SECURITY_AND_RELEASE_COMPATIBILITY_CONTRACT.md` | Each owns only its named platform boundary and references shared persistence/recovery/security owners |
| Release and device acceptance | `PLATFORM_ACCEPTANCE_CONTRACT.md`, `ANDROID_DEVICE_READINESS_CONTRACT.md`, `ANDROID_SIGNED_RELEASE_CONTRACT.md` | Setup/runbooks describe operational procedure; no CI-only claim of physical-device acceptance |
| Architecture checks and CI evidence requirements | `ARCHITECTURE_ENFORCEMENT.md` and `PLATFORM_ACCEPTANCE_CONTRACT.md` | Implementation hardening plan records staged delivery, not a second permanent policy |
| Diagnostics and change-impact | `STAGE_5_DIAGNOSTICS_AND_CHANGE_IMPACT.md` | Historical Stage 5 audit/progress docs retain proof snapshots |

## 4. Full Phase 1 63-file inventory and Phase 2 treatment

“Keep” means retain as an owner/supporting document with scope clarified. “Reconcile” means update duplicated rules, authority wording, links or stale status. “Historical” means preserve the evidence and label it as a dated snapshot; do not rewrite its original baseline as current.

| # | Markdown file | Classification | Phase 2 treatment |
|---:|---|---|---|
| 1 | `ARCHITECTURE.md` | Root architecture overview | Reconcile as concise entry/overview; defer detailed policy to named contracts |
| 2 | `DATA_CONTRACT.md` | Normative data semantics | Keep as owner; remove persistence/recovery duplication |
| 3 | `DEVELOPMENT_PLAN.md` | Delivery plan | Reconcile stale phase/status and link to current contracts |
| 4 | `README.md` | Project entry point | Update documentation navigation and current status |
| 5 | `docs/ADMIN_BASELINE_AUDIT.md` | Historical baseline audit | Preserve; mark clearly as pre-implementation snapshot |
| 6 | `docs/ADMIN_CAPABILITY_CONTRACTS.md` | Admin technical contracts | Reconcile proposal/pre-write status with implementation evidence |
| 7 | `docs/ADMIN_FUNCTIONAL_SPECIFICATION.md` | Approved Admin product specification | Keep product authority; update status only, not product rules |
| 8 | `docs/ADMIN_IMPLEMENTATION_PLAN.md` | Admin implementation plan | Reconcile completed slices and remaining acceptance gates |
| 9 | `docs/ANDROID_DEVICE_READINESS_CONTRACT.md` | Android device readiness | Keep scoped; link to platform acceptance |
| 10 | `docs/ANDROID_NATIVE_CONTRACT.md` | Android platform contract | Keep; defer overlay and shared recovery rules to their owners |
| 11 | `docs/ANDROID_SIGNED_RELEASE_CONTRACT.md` | Release signing policy | Keep scoped; link from release index |
| 12 | `docs/APPLICATION_LIFECYCLE_CONTRACT.md` | Cross-runtime lifecycle | Keep startup/resume/shutdown ownership; link platform lifecycle contracts |
| 13 | `docs/ARCHITECTURE_ENFORCEMENT.md` | Architecture CI enforcement | Keep as owner for automated architecture proof and its limits |
| 14 | `docs/ARCHITECTURE_FOUNDATION_CONTRACT.md` | Shared architecture foundation | Keep; trim duplicate detailed policies and refresh evidence status |
| 15 | `docs/ARCHITECTURE_HARDENING_IMPLEMENTATION_CONTRACT.md` | Historical/staged implementation plan | Label as implementation-stage record; do not treat as current permanent authority |
| 16 | `docs/AUTHORITATIVE_WORKFLOW_V2_MIGRATION_AND_INTEGRATION.md` | Retained workflow migration reference | Preserve as reference; point to current workflow and snapshot owners |
| 17 | `docs/AUTHORITY_AND_RESPONSIBILITY_ALLOTMENT_MAP.md` | Capability authority map | Keep as ownership/precedence map; remove duplicated detailed implementation rules |
| 18 | `docs/DRIVER_LOCATION_RELIABILITY_IMPLEMENTATION.md` | Implementation plan/evidence | Label baseline and completion accurately; defer GPS policy to location contract |
| 19 | `docs/DRIVER_OVERLAY_CONTRACT.md` | Overlay product/platform contract | Keep as sole overlay behaviour owner |
| 20 | `docs/DRIVER_WORKFLOW_CONTRACT.md` | Driver workflow contract | Keep as sole Work/Shift and Trip business workflow owner |
| 21 | `docs/DROPBOX_BACKUP_CONTRACT.md` | Backup/restore/reset contract | Keep as backup behaviour and safety owner |
| 22 | `docs/DROPBOX_SETUP.md` | Integration setup guide | Keep as setup instructions; defer policy to backup/network/security contracts |
| 23 | `docs/FEATURE_EXTENSION_ARCHITECTURE.md` | Feature extension implementation guide | Keep as guide; link to feature module/lifecycle owners |
| 24 | `docs/FEATURE_EXTENSION_LIFECYCLE_CONTRACT.md` | Feature lifecycle contract | Keep; reconcile stale verification status |
| 25 | `docs/FEATURE_MODULE_CONTRACT.md` | Feature module/extension contract | Keep as module boundary owner; clarify relationship to architecture foundation |
| 26 | `docs/FINANCE_LOAN_CALCULATION_CONTRACT.md` | Loan calculation contract | Keep as calculation owner |
| 27 | `docs/FINANCE_LOAN_PAYMENT_WORKFLOW_CONTRACT.md` | Unratified Loan payment policy proposal | Keep proposal status explicit; section headings must not imply approval; implementation evidence remains separate |
| 28 | `docs/FINANCE_LOAN_PREPAYMENT_CONTRACT.md` | Loan prepayment contract | Keep; validate status/evidence link |
| 29 | `docs/FINANCE_LOAN_SETTLEMENT_AND_CLOSURE_CONTRACT.md` | Loan settlement/closure contract | Reconcile implementation and acceptance status |
| 30 | `docs/FINANCE_PERFORMANCE_CALCULATION_APPROVAL.md` | Calculation approval record | Keep as approval boundary; link from calculation owners |
| 31 | `docs/FORM_ARCHITECTURE_AND_BEHAVIOUR_CONTRACT.md` | Shared form contract | Keep as sole shared form authority |
| 32 | `docs/FORM_CONFORMANCE_AUDIT.md` | Form conformance evidence | Refresh exact-SHA evidence and remaining gaps; do not duplicate form rules |
| 33 | `docs/LOCAL_PERSISTENCE_CONTRACT.md` | Runtime persistence ownership | Keep as sole runtime store ownership contract |
| 34 | `docs/LOCATION_AND_STATE_TIMING_CONTRACT.md` | GPS/time evidence contract | Keep as sole event evidence and timing policy owner |
| 35 | `docs/NETWORK_ACCESS_CONTRACT.md` | Network policy contract | Keep as user-controlled network policy owner |
| 36 | `docs/PERMANENT_APPLICATION_ARCHITECTURE.md` | Approved architecture scope | Keep as frozen scope and non-goals owner |
| 37 | `docs/PERMANENT_APPLICATION_ARCHITECTURE_AUDIT.md` | Historical Stage 0 audit | Preserve as dated baseline; do not present as current gap matrix |
| 38 | `docs/PERMANENT_APPLICATION_ARCHITECTURE_PROGRESS.md` | Historical/staged progress register | Reconcile current summary; retain stage evidence as historical |
| 39 | `docs/PERMANENT_APPLICATION_ARCHITECTURE_STAGE_2_AUDIT.md` | Historical Stage 2 audit | Preserve as dated snapshot |
| 40 | `docs/PERMANENT_APPLICATION_ARCHITECTURE_STAGE_4_AUDIT.md` | Historical Stage 4 audit | Preserve as dated acceptance evidence |
| 41 | `docs/PERMANENT_APPLICATION_ARCHITECTURE_STAGE_5_AUDIT.md` | Historical Stage 5 audit | Preserve as dated acceptance evidence |
| 42 | `docs/PERSISTENCE_SCHEMA_CONTRACT.md` | Persistence schema/version contract | Keep as schema and migration format owner; link from data/persistence contracts |
| 43 | `docs/PHASE_2_FOUNDATION.md` | Historical phase delivery record | Preserve as historical implementation evidence |
| 44 | `docs/PHASE_3_WORKFLOW.md` | Historical phase delivery record | Preserve; reconcile summary pointers only if needed |
| 45 | `docs/PHASE_6_BACKGROUND_BACKUP_DESIGN.md` | Backup implementation design/status | Keep as implementation record; defer behaviour to backup contract |
| 46 | `docs/PHASE_6_MANUAL_ACCEPTANCE.md` | Owner-run manual acceptance guide | Keep; clearly separate CI evidence from live account/device acceptance |
| 47 | `docs/PLATFORM_ACCEPTANCE_CONTRACT.md` | Platform verification/release gate | Keep as cross-platform acceptance owner |
| 48 | `docs/PWA_LIFECYCLE_CONTRACT.md` | Browser PWA lifecycle | Keep browser-specific scope and shared-contract references |
| 49 | `docs/RELIABILITY_AUDIT.md` | Historical reliability audit | Preserve as dated audit; do not present as current acceptance status |
| 50 | `docs/ROOM_MIGRATION_RUNBOOK.md` | Operational migration runbook | Keep procedure; defer schema policy to persistence schema contract |
| 51 | `docs/RUNTIME_CAPABILITY_AND_BRIDGE_CONTRACT.md` | Runtime capability/bridge contract | Keep as bridge/capability owner; clarify native/platform links |
| 52 | `docs/SECURITY_AND_COMPATIBILITY_CONTRACT.md` | Shared security/compatibility policy | Keep as shared policy owner; platform documents add scoped rules |
| 53 | `docs/SHARED_FOUNDATION_ENFORCEMENT_CONTRACT.md` | Shared foundation requirement | Reconcile into architecture foundation/enforcement references; avoid a second copy of guarantees |
| 54 | `docs/STAGE_5_DIAGNOSTICS_AND_CHANGE_IMPACT.md` | Diagnostics/change-impact contract | Keep as Stage 5 operational reference; link to architecture foundation |
| 55 | `docs/TIMELINE_DESIGN_PROPOSAL.md` | Approved Timeline product design | Keep as product owner; ensure normative technical policies are references, not duplicated |
| 56 | `docs/TIMELINE_MOCKUP_VISUAL_FIDELITY_CONTRACT.md` | Approved visual reference/fidelity contract | Keep as visual artifact owner |
| 57 | `docs/TRANSACTION_AND_RECOVERY_CONTRACT.md` | Transaction/recovery contract | Keep as sole shared durable operation/recovery owner |
| 58 | `docs/UI_UX_SHELL_FOUNDATION_CONTRACT.md` | Presentation architecture contract | Keep as presentation boundary owner; preserve explicit supersession notes |
| 59 | `docs/WEBVIEW_SECURITY_AND_RELEASE_COMPATIBILITY_CONTRACT.md` | WebView security/release compatibility | Keep platform-specific scope; defer shared policy to security contract |
| 60 | `docs/WORK_DRIVER_TRIP_SNAPSHOT_INTEGRATION_CONTRACT.md` | Work/Trip snapshot integration | Keep as current integration owner |
| 61 | `docs/reference/timeline-mockup/README.md` | Reference artifact navigation | Keep as artifact provenance/navigation |
| 62 | `docs/reference/timeline-mockup/manifest-v1.md` | Immutable visual artifact manifest | Keep unchanged except correcting broken references; v1 remains immutable |
| 63 | `services/geocoder/README.md` | Service setup/endpoint guide | Keep service-specific setup; link to network/privacy/Timeline owner contracts |

## 5. Phase 2 execution rules

1. Keep all work on PR #69's existing branch. Do not create a competing PR or branch.
2. Preserve the frozen product decisions and technical safeguards. Documentation consistency is not permission to change product behaviour.
3. One rule has one owner. Supporting documents state their scope and link to the owner; they do not copy the full rule.
4. Keep product approval, technical contract, implementation status, automated evidence and physical-device acceptance distinct.
5. Historical audit baselines and commit/run references remain historically accurate. Add a current status pointer rather than rewriting history.
6. Update status claims only against code and tests at an exact SHA. Green CI does not prove live Dropbox/account or physical-device acceptance.
7. Prefer editing and clarifying existing contracts over creating a large new contract catalogue. Create a new file only for a genuinely unowned responsibility.
8. Do not alter application source, schemas, migrations or runtime behaviour as part of this documentation task.
9. Do not merge PR #69, publish an APK, or perform phone testing.

## 6. Phase 1 exit and Phase 2 completion criteria

Phase 1 is complete when this inventory, findings and owner map are committed on the PR branch.

Phase 2 is complete when:
- A central contract/documentation index identifies the owner, scope and status of every normative contract and points to plans, audits, historical records and operational guides.
- Root README and architecture overview route readers to that index.
- All 65 tracked Markdown files at the reconciliation head (the 63-file Phase 1 inventory plus this audit and the Contract Index) are either authoritative, supporting, operational, historical or reference material with an explicit role.
- Duplicated normative passages are replaced by concise statements and links to the owner.
- Contradictory or stale status/authority wording is reconciled without falsifying historical evidence.
- All internal Markdown links resolve.
- Documentation consistency checks and the repository's relevant architecture/web/Android/integrated CI gates pass on the exact final SHA.
- PR #69 remains open and unmerged; no APK is released and no phone testing is performed.


## 7. Phase 2 reconciliation results

**Core reconciliation commit:** `b4df668db3b937dacdc250bedfc9eb774cac3ae6`. Subsequent documentation-only commits completed the index coverage and clarified current-versus-historical verification wording. The final exact branch head and its CI result are recorded by PR #69.

Delivered in Phase 2:
- Added [Contract and Documentation Index](CONTRACT_INDEX.md) as the central navigation and authority map.
- Linked the root README and architecture overview to the index and clarified that the architecture file is an overview rather than a competing detailed contract.
- Narrowed the Data Contract to shared data semantics; runtime store ownership, schema/migration formats and transaction/recovery details point to their dedicated owners.
- Clarified the Shared Foundation Enforcement document as a feature-inheritance checklist subordinate to the Architecture Foundation and detailed owner contracts.
- Marked the Admin baseline audit and permanent-architecture progress register as historical snapshots.
- Reconciled the Admin Slice 1 capability proposal's old pre-write gate so it cannot be mistaken for a current instruction to disable existing writes.
- Clarified that the Finance loan payment workflow remains an unratified proposal even though payment UI/service implementation exists; implementation is not retroactive approval of the proposal.
- Updated the Form Conformance Audit with the latest verified code-baseline CI evidence while preserving its partial status and outstanding acceptance gaps.
- Corrected the stale claim that no integrated CI evidence existed, while retaining the specific architecture-foundation sub-gates as open until their own evidence is recorded.
- Updated the Admin implementation plan and historical architecture progress navigation.
- Removed the Finance Loan payment contract's contradictory “Approved allocation policy” heading; it now accurately identifies the section as proposed and not ratified. The implemented payment UI/service remains implementation evidence only.

**Repository-wide link validation:** All 65 tracked Markdown files at the reconciliation head were inspected for relative Markdown links. No broken internal Markdown links were found. The original 63-file Phase 1 inventory remains the baseline count; the two additional files are this audit and the contract index.

**Scope confirmation:** No application source, database schema, migration, runtime behavior, APK publication or phone testing was changed or performed in this documentation reconciliation.
