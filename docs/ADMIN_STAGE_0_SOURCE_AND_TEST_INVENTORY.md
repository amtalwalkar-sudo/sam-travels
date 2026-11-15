# Admin Stage 0 — Source, Test and Workflow Parity Inventory

**Status:** Repository-backed Stage 0 inventory and parity baseline.  
**Target:** Complete Admin presentation replacement under ADMIN_PRESENTATION_REPLACEMENT_CONTRACT.md.  
**Inspected branch:** main  
**Exact inspected source SHA:** 8d7564b93ff9518ef89e17fe5e1133c250c4eb16  
**Contract PR:** https://github.com/amtalwalkar-sudo/sam-travels/pull/89

## 1. Stage 0 outcome

The repository has a substantial Admin implementation and capability foundation. The six current visible groups are Business setup, Vehicle, Driver, Compliance, Finance, and Maintenance. The Finance group currently contains the Loan workflows plus Platform Fees and Miscellaneous Business Expenses. Traffic Challans are rendered under Compliance. Fuel entry remains a Work-owned driver workflow.

Admin itself is registered as a non-persistent presentation contribution. Business records remain owned by Business Settings, Vehicle, Driver Records/Assignments, Compliance, Finance, Business Expenses, and Maintenance. The replacement must preserve those owners and their existing command/query semantics.

The inventory is sufficient to define presentation adapters and a replacement shell, but **Stage 0 is not fully closed** until the known contract/test discrepancies and baseline Android CI failure in Section 9 are reconciled. Runtime replacement must not assume these gaps are already solved.

## 2. Application entry and current Admin composition

| Responsibility | Current source | Current responsibility / observation |
|---|---|---|
| Browser/native bootstrap | apps/web/src/main.tsx | Initializes runtime registry, platform repository, identity, Admin capability services, shared form runtime and submission dispatcher; supplies Admin dependencies to React |
| Global app shell | apps/web/src/ui/App.tsx; ApplicationShell.tsx | Owns four global destinations and Settings host; outside Admin replacement scope |
| Primary destination composition | apps/web/src/ui/PrimaryScreenComposition.tsx | Mounts AdminWorkspace through FeatureScreenHost using admin.workspace v1 context |
| Admin feature contribution | packages/features/admin/runtime.ts; index.ts; feature.manifest.json | admin.workspace.v1 at Admin mount point; non-persistent presentation/access surface |
| Admin workspace | apps/web/src/ui/AdminWorkspace.tsx | Six-section navigation, identity panel, section mounting, Finance vehicle context, loan/schedule loading and Finance composition |
| Admin service context | apps/web/src/ui/admin-services-context.tsx | Exposes the broad AdminPresentationServices object and an AtomicRecordBatchRepository identity-record dependency through React context |
| Admin service type | packages/application/src/admin-presentation-services.ts | Explicit typed service set supplied by composition root |
| Admin styles | apps/web/src/ui/AdminWorkspace.css | Shared styling dependency used by most current Admin sections/forms |
| Cross-cutting identity UI | apps/web/src/ui/PersonIdentityPanel.tsx | Person enrolment, Admin role/PIN activation and Driver/Admin role selection; mounted inside Admin workspace and must retain security/actor responsibilities |

The current Admin navigation is an expandable section list with one section open at a time. The approved Admin product specification also requires selected vehicle context to remain explicit in vehicle-specific work. Preserve those semantics while replacing the visual implementation. The global four-destination shell is not part of this project.

### Current section presentation files

| Visible group | Current presentation files | Current surfaces |
|---|---|---|
| Business setup | AdminBusinessVehicle.tsx; BusinessStartDateCostAllocationPanel.tsx | Business start-date form and read-only business-start-date cost-allocation report |
| Vehicle | AdminBusinessVehicle.tsx | Vehicle list, create/edit profile form and lifecycle state |
| Driver | AdminOperations.tsx | Driver profile form/list, selected-for-Work action, vehicle assign/reassign/unassign and assignment history |
| Compliance | AdminOperations.tsx; AdminComplianceOverview.tsx; BusinessExpenseAdminForms.tsx | Vehicle-scoped compliance create/renewal form and history; fleet overview, vehicle filter, gap/overlap review, daily cost breakdown; Traffic Challan entry |
| Finance | AdminWorkspace.tsx; LoanDetailsForm.tsx; LoanPaymentsPanel.tsx; useLoanFormDrafts.ts; BusinessExpenseAdminForms.tsx | Vehicle context, loan create/list/schedule/history, payment/reversal, prepayment and settlement; Platform Fee and Miscellaneous Business Expense forms |
| Maintenance | AdminOperations.tsx re-export; AdminMaintenance.tsx; MaintenanceExpenseCorrection.tsx | Vehicle context, visit/itemised expense form, general expense form, rate form/history, daily accruals, reminders, actual expense history and correction history |

AdminOperations.tsx currently contains both Driver and Compliance implementations. AdminWorkspace.tsx is both the shell and a Finance data coordinator. AdminMaintenance.tsx is close to the repository's 400-line source-file gate. These are replacement starting points, not structures that must be preserved.

## 3. Canonical Admin form inventory

packages/application/src/admin-form-definitions.ts currently declares **14 versioned Admin form definitions**. Shared mechanics are in shared-form-runtime.ts, form-submission-port.ts and record-form-working-copy-repository.ts.

| # | Form ID | Definition constant | Owner | Current rendered surface | Primary action |
|---:|---|---|---|---|---|
| 1 | admin.business-setup | BUSINESS_SETUP_FORM_V1 | business-settings | Business setup | Save |
| 2 | admin.vehicle | VEHICLE_FORM_V1 | vehicles | Vehicle | Save |
| 3 | admin.driver | DRIVER_FORM_V1 | driver-records | Driver | Save |
| 4 | admin.compliance | COMPLIANCE_FORM_V1 | compliance | Compliance create/renewal | Save |
| 5 | admin.maintenance-visit | MAINTENANCE_VISIT_FORM_V1 | maintenance | Maintenance visit with itemised rows | Save |
| 6 | admin.maintenance-expense | MAINTENANCE_EXPENSE_FORM_V1 | maintenance | General maintenance expense | Save |
| 7 | admin.maintenance-rate | MAINTENANCE_RATE_FORM_V1 | maintenance | Per-vehicle rate history | Save |
| 8 | admin.loan-details | LOAN_DETAILS_FORM_V1 | finance-loans | New immutable loan details | Save |
| 9 | admin.loan-payment | LOAN_PAYMENT_FORM_V1 | finance-loans | EMI payment | Save |
| 10 | admin.loan-prepayment | LOAN_PREPAYMENT_FORM_V1 | finance-loans | Prepayment preview and confirmation | Submit |
| 11 | admin.loan-settlement | LOAN_SETTLEMENT_FORM_V1 | finance-loans | Settlement preview and confirmation | Submit |
| 12 | admin.platform-fee | PLATFORM_FEE_FORM_V1 | business-expenses | Finance → Platform Fees | Save |
| 13 | admin.misc-business-expense | MISC_BUSINESS_EXPENSE_FORM_V1 | business-expenses | Finance → Miscellaneous Business Expenses | Save |
| 14 | admin.traffic-challan | TRAFFIC_CHALLAN_FORM_V1 | business-expenses | Compliance → Traffic Challans | Save |

### Additional command surfaces that are not canonical form definitions

These still belong in the workflow parity matrix and must remain independently replaceable:
- Driver assignment, reassignment and unassignment; direct DriverAssignmentService commands with append-only assignment history.
- Driver selection for Work; updates Driver Records state through its owning service.
- Compliance overlap confirmation/rejection; each decision requires a reason and records actor/source provenance through ComplianceAnalysisService.
- Finance payment reversal; reasoned, append-only Finance service operation.
- Maintenance expense correction; current bespoke correction form, not one of the 14 shared form definitions.
- Person enrolment and role/PIN activation in PersonIdentityPanel; identity/security workflows, not Admin business forms.
- Business start date allocation report; read/query surface, not a form.

Fuel Entry has its own Work-owned form definition and submission path. It is deliberately excluded from this Admin form inventory and must remain in Work.

## 4. Workflow-to-owner and persistence parity matrix

The matrix maps each current Admin workflow to the capability boundary that must remain authoritative. The platformRepository in web composition is the runtime-selected repository boundary: browser-only PWA uses IndexedDB/Dexie; installed Android/WebView uses the Room-backed native repository. Admin does not get its own business store.

| Admin workflow / information | Current UI | Authoritative application owner and operations | Durable records / provenance | Backup / restore owner | Existing automated evidence |
|---|---|---|---|---|---|
| Business start date read/update | BusinessSetupSection | BusinessSettingsService: get, setBusinessStartDate through shared form submission | Business Settings record; revision/source metadata | PWA business-settings-backup.ts; Android NativeBusinessSettingsBackup | business-settings-service.test.ts, business-settings-records.test.ts, business-settings-runtime.test.ts, business-settings-backup.test.ts, Android NativeBusinessSettingsBackupTest |
| Business-start-date allocation report | BusinessStartDateCostAllocationPanel | BusinessStartDateCostAllocationService.getReport; consumes Compliance and Finance owner services | Derived report only; source records remain Compliance/Finance-owned | No separate Admin participant; underlying Compliance/Finance participants | business-start-date-cost-allocation-service.test.ts, business-start-date-cost-allocation.test.ts |
| Vehicle create/list/update and lifecycle context | VehicleSection | VehicleService: list, getById, getByRegistrationNumber, create, revision-checked update | Vehicle record with canonical registration identity and revision | PWA vehicle-backup.ts; Android NativeVehicleBackup | vehicle-service.test.ts, vehicle-records.test.ts, vehicle-backup.test.ts, Android NativeVehicleBackupTest |
| Driver profile create/edit/list | DriverSection | DriverRecordsService: list, create, revision-checked update | Driver record; selected-for-Work state remains Driver Records-owned | PWA driver-records-backup.ts; Android NativeDriverRecordsBackup | driver-records-service.test.ts, driver-records.test.ts, driver-form-definitions.test.ts, driver-records-backup.test.ts, Android NativeDriverRecordsBackupTest |
| Driver assignment, reassignment, unassignment and history | DriverSection | DriverAssignmentService: getHistory, assign, unassign; validates active Driver and Vehicle and one active assignment | Assignment history record; prior assignment closed, not overwritten | Driver Records participant on both platforms | driver-assignment-service.test.ts, driver-records-backup.test.ts, Android NativeDriverRecordsBackupTest; Work/Driver integration suites |
| Select/clear Driver for Work | DriverSection | DriverRecordsService update; Work consumes selected Driver and immutable trip-time context through its existing public workflow | Driver profile/selection plus immutable Work/Trip snapshots | Driver Records and Work/Log Book backup owners | driver-records-service.test.ts, driver-workflow-parity.test.ts, driver-workflow-v2.test.ts, driver-workflow.test.ts |
| Compliance create, list, immutable renewal/history | ComplianceSection | ComplianceService: list, create; renewal is a new linked record with actual dates | Compliance record and renewal linkage | PWA compliance-backup.ts; Android NativeComplianceBackup | compliance-service.test.ts, compliance-domain.test.ts, compliance-backup.test.ts, Android NativeComplianceBackupTest |
| Compliance fleet overview, vehicle filter, expiry, gaps and overlaps | AdminComplianceOverview | ComplianceAnalysisService: getOverview, getDailyCost; feature-owned analysis functions | Derived analysis; source Compliance records remain unchanged | Compliance records plus overlap-review events in Compliance participant | compliance-overlap-review.test.ts, compliance-analysis-correction-projection.test.ts, compliance-backup.test.ts; scripts/compliance-overview-browser-acceptance.mjs |
| Compliance overlap confirm/reject | AdminComplianceOverview | ComplianceAnalysisService: recordReview; explicit actor, reason and exact source revision scope | Append-only review event; stale review must be revisited after source correction | Compliance backup participant and restore validator | compliance-overlap-review.test.ts, compliance-backup.test.ts, rendered PWA Compliance browser acceptance |
| Compliance historical correction projection | No correction editor surfaced in inspected Admin UI; corrected values feed overview reads | Compliance historical-correction service/port and shared HistoricalCorrectionService | Append-only correction event and projection provenance; original record immutable | Compliance participant/restore validation | compliance-historical-correction.test.ts, compliance-analysis-correction-projection.test.ts, compliance-backup.test.ts |
| Traffic Challan entry | TrafficChallanSection under Compliance | handleBusinessExpenseFormSubmission → BusinessExpensesService.createExpenseEntry with sourceKind traffic_challan | Business Expense entry with vehicle/optional driver, payment state and source identity | PWA business-expenses-backup.ts; Android NativeBusinessExpensesBackup | business-expenses-service.test.ts, business-expenses-backup.test.ts; no dedicated rendered challan-form acceptance found |
| Loan create and immutable details/list | LoanDetailsForm, AdminWorkspace | FinanceLoanService: create, list, get; saved original details are immutable | Finance Loan record and original schedule/calculation provenance | PWA finance-backup.ts; Android NativeFinanceBackup | finance-loan-service.test.ts, loan-calculation.test.ts; Android Finance backup coverage |
| Loan active schedule, schedule history and repayment summary | AdminWorkspace | FinanceLoanService and FinanceLoanPrepaymentService: getScheduleHistory, schedule-version/row queries | Immutable schedule versions, prepayment revision history and calculation provenance | Finance loan + prepayment participants | finance-loan-service.test.ts, finance-loan-prepayment-service.test.ts, loan-prepayment-calculation.test.ts, loan-prepayment-records.test.ts |
| EMI payment, allocation and history | LoanPaymentsPanel, useLoanFormDrafts | FinanceLoanPaymentService: list, propose, record | Append-only payment ledger with stable operation identity, schedule version and allocations | Finance payment participant; PWA Finance participant; Android finance-payment-records | finance-loan-payment-service.test.ts; Android NativeFinancePaymentBackupTest |
| EMI payment reversal | LoanPaymentsPanel | FinanceLoanPaymentService.reverse with reason and stable command identity | Append-only reversal linked to original payment; original remains | Finance payment participant | finance-loan-payment-service.test.ts |
| Prepayment preview and commit | LoanPaymentsPanel, useLoanFormDrafts | FinanceLoanPrepaymentService: preview, commit; user-approved mode is reduce tenure, regular EMI remains unchanged | Prepayment state/revision and revised schedule; stable operation identity | Finance prepayment participant | finance-loan-prepayment-service.test.ts, loan-prepayment-calculation.test.ts, loan-prepayment-records.test.ts; Android Finance backup coverage |
| Final settlement preview and commit / Loan closure | LoanPaymentsPanel | FinanceLoanSettlementService: preview, commit; payment-ledger and loan/schedule revisions revalidated | Settlement entry in Finance payment ledger; Loan closed atomically | Finance payment participant; settlement consistency validated by NativeFinanceSettlementBackup | Settlement cases in finance-loan-payment-service.test.ts; Android Finance backup validator |
| Platform Fee entry | PlatformFeeSection under Finance | handleBusinessExpenseFormSubmission → BusinessExpensesService.createExpenseEntry with sourceKind platform_fee | Actual fee, source reference and already-netted flag; no inferred percentage | PWA Business Expenses participant; Android business-expenses-records | business-expenses-service.test.ts; no dedicated form-mapping or rendered form test found |
| Miscellaneous Business Expense entry | MiscBusinessExpenseSection under Finance | handleBusinessExpenseFormSubmission → BusinessExpensesService.createExpenseEntry with sourceKind miscellaneous | Explicit category/date/amount and optional vehicle/driver attribution | PWA Business Expenses participant; Android business-expenses-records | business-expenses-service.test.ts; no dedicated form-mapping or rendered form test found |
| Maintenance visit and itemised actual costs | MaintenanceSection | MaintenanceService: createVisit, listVehicleRecords; visit total calculator | Immutable visit record with item rows and derived total | PWA maintenance-backup.ts; Android NativeMaintenanceBackup | maintenance-service.test.ts, maintenance-domain.test.ts, maintenance-backup.test.ts, Android NativeMaintenanceBackupRoomTest |
| General Maintenance expense and history | MaintenanceSection | MaintenanceService: createExpense, listVehicleRecords, getActualExpenseTotal | Immutable actual expense record; separate from daily accrual | Maintenance participant | maintenance-service.test.ts, maintenance-backup.test.ts, maintenance-correction-indexeddb.test.ts, rendered PWA Maintenance correction acceptance |
| Maintenance expense correction/history | MaintenanceExpenseCorrection | Currently constructs HistoricalCorrectionService in UI module using raw repository and global identity runtime; target owner must be an explicit application correction adapter | Append-only correction event/chain; original expense unchanged | Maintenance backup participant and native restore validation | maintenance-correction-indexeddb.test.ts, scripts/maintenance-correction-browser-acceptance.mjs, Android NativeMaintenanceBackupRoomTest, MaintenanceCorrectionCapacitorAcceptanceTest |
| Maintenance per-vehicle rate and history | MaintenanceSection | MaintenanceService: getRateHistory, setRate | Effective-dated rate history; historical daily accrual snapshots immutable | Maintenance participant | maintenance-service.test.ts, maintenance-backup.test.ts, Android NativeMaintenanceBackupRoomTest |
| Daily Maintenance accruals | MaintenanceSection read-only history | MaintenanceService: accrueDailyBusinessKilometres, listVehicleRecords; consumes authoritative fully allocated daily business-km source | Immutable idempotent accrual with operational date, rate snapshot, business/personal split | Maintenance participant | maintenance-service.test.ts covers fully allocated km, effective rate, completed 04:00 day and deferred boundary cases; Maintenance backup tests |
| Service reminders | MaintenanceSection | MaintenanceService: getServiceReminderStates, getDateReminders; uses recorded odometer/date only | Derived reminder state; no invented odometer fact | Underlying Maintenance records | maintenance-service.test.ts |
| Person enrolment, role/PIN activation and actor selection | PersonIdentityPanel | Current UI calls PersonIdentityService/platform identity adapters and passes repository; security/identity owner remains authoritative | Identity/person records, credential state, role activation and actor attribution; not Admin-owned business records | Platform/identity backup and security owner, not Admin participant | person-identity-service.test.ts, person-identity-adapters.test.ts, identity/authorization integration in correction acceptance; no dedicated full Admin identity-panel acceptance suite found |

## 5. Shared form lifecycle and submission routing

### Existing runtime path

1. apps/web/src/main.tsx creates RecordFormWorkingCopyRepository over the platform-selected repository and supplies it to SharedFormRuntime.
2. Admin presentation uses the shared runtime for form open/update/save/submit and definition-scoped draft discovery where implemented.
3. The application composition dispatches commands by stable formId to the owning application service. Business expense forms are routed through apps/web/src/business-expense-form-submission.ts; other Admin form IDs are dispatched in main.tsx.
4. Business acceptance, validation, identity attribution, atomic writes and durable state remain in owning application/domain services and repository transaction boundaries.
5. Browser-only PWA uses Dexie/IndexedDB. Installed Android/WebView uses the Room-backed repository through the native bridge. There must be no second Android IndexedDB business history.

### Current draft and form evidence

- tests/shared-form-runtime.test.ts covers shared form definition/lifecycle mechanics, incomplete drafts, Save/Submit distinction, stale working-copy revisions and durable success before submitted status.
- tests/record-form-working-copy.test.ts covers repository-backed draft persistence, discovery, revision checks and isolated removal.
- Form Conformance Audit records migration of Business Setup, Vehicle, Driver, Compliance, Maintenance and Loan forms to versioned definitions/shared runtime, and rendered PWA/Android correction pilot.
- tests/business-expense-form-submission.test.ts currently tests Fuel Entry GPS capture behaviour; it does not test Platform Fee, Miscellaneous Expense or Traffic Challan form-to-service mapping.

Shared form mechanics are a foundation to retain, not a requirement to retain current React form renderers. Each new form renderer must consume a narrow feature-owned form contract and dispatch through the same application path.

## 6. Persistence and backup/restore inventory

### Browser-only PWA participants

apps/web/src/register-browser-backup-participants.ts registers:
- business-settings-backup.ts
- vehicle-backup.ts
- driver-records-backup.ts
- compliance-backup.ts
- maintenance-backup.ts
- finance-backup.ts
- business-expenses-backup.ts

Relevant tests include business-settings-backup.test.ts, vehicle-backup.test.ts, driver-records-backup.test.ts, compliance-backup.test.ts, maintenance-backup.test.ts, business-expenses-backup.test.ts and the generic backup-snapshot.test.ts suite.

### Installed Android participants

The inspected native participant implementation includes:
- Business Settings: NativeBusinessSettingsBackup
- Vehicle: NativeVehicleBackup
- Driver Records: NativeDriverRecordsBackup
- Compliance: NativeComplianceBackup
- Maintenance: NativeMaintenanceBackup
- Finance loans and payment ledger: NativeFinanceBackup
- Finance prepayment schedule history: NativeFinancePrepaymentBackup
- Business Expenses (including Fuel source records): NativeBusinessExpensesBackup

Finance settlement is stored as a Finance payment-ledger entry and validated against Loan closed/active lifecycle by NativeFinanceSettlementBackup; it is not a separate Admin participant. Shared native feature participant/manifest validation is in NativeFeatureBackupParticipants.kt and NativeBackupCoverage.kt.

Named Android tests found include NativeBusinessSettingsBackupTest, NativeVehicleBackupTest, NativeDriverRecordsBackupTest, NativeComplianceBackupTest (local unit-test source set), NativeFinancePaymentBackupTest and NativeMaintenanceBackupRoomTest, plus generic NativeBackupCoverageTest. MaintenanceCorrectionCapacitorAcceptanceTest exercises the live Room-backed WebView correction path. No dedicated NativeBusinessExpensesBackupTest file was found in the inspected tree; keep its participant validation and test coverage explicit during later acceptance.

There is no Admin-specific persistence participant. Do not create one.

## 7. Current automated test and acceptance inventory

| Test layer | Existing evidence | What it proves | What it does not prove |
|---|---|---|---|
| Domain/application service tests | Business Settings, Vehicle, Driver Records/Assignments, Compliance, Finance Loan/payment/prepayment/settlement, Business Expenses, Maintenance suites listed in Section 4 | Capability rules, validation, idempotency, immutable history, schedule and allocation behaviour | Rendered Admin component behaviour or all UI-to-service mappings |
| Shared form tests | shared-form-runtime.test.ts, record-form-working-copy.test.ts | Common definition validation and working-copy lifecycle | Every Admin definition is covered, every rendered form uses it correctly, or every Admin screen is independently replaceable |
| Browser PWA Admin acceptance | scripts/compliance-overview-browser-acceptance.mjs; scripts/maintenance-correction-browser-acceptance.mjs | Rendered Compliance overview/review and Maintenance correction flows | Complete acceptance for all six sections and all 14 forms |
| Android/Admin acceptance | MaintenanceCorrectionCapacitorAcceptanceTest | Actual Capacitor WebView/React Maintenance correction, actor permissions and Room-backed correction persistence | Other Admin forms/sections on Android or physical-device acceptance |
| Android backup/instrumentation | Named feature backup tests and generic backup coverage tests | Selected feature participant/restore relationships and Room backup behaviour | Every Admin form's UI workflow |
| Presentation/feature-host tests | feature-presentation.test.ts, feature-screen-host.test.tsx, presentation-shell-contracts.test.ts, presentation-accessibility-responsive.test.tsx | Generic feature presentation host, shell contracts and responsive/accessibility primitives | Admin-specific component isolation and end-to-end acceptance for every Admin section |
| Architecture CI | Existing architecture import/policy checks | Existing declared source/import policies | Full desired Admin shell/section/leaf replacement contract; this needs explicit Admin fixtures and boundaries |

### Relevant existing test paths

- Business Settings: business-settings-records.test.ts, business-settings-runtime.test.ts, business-settings-service.test.ts, business-settings-backup.test.ts.
- Vehicle: vehicle-records.test.ts, vehicle-service.test.ts, vehicle-backup.test.ts.
- Driver: driver-form-definitions.test.ts, driver-records.test.ts, driver-records-service.test.ts, driver-assignment-service.test.ts, driver-records-backup.test.ts, driver-workflow-parity.test.ts, driver-workflow-v2.test.ts, driver-workflow.test.ts.
- Compliance: compliance-domain.test.ts, compliance-service.test.ts, compliance-overlap-review.test.ts, compliance-historical-correction.test.ts, compliance-analysis-correction-projection.test.ts, compliance-backup.test.ts.
- Finance: loan-calculation.test.ts, finance-loan-service.test.ts, finance-loan-payment-service.test.ts (includes settlement cases), finance-loan-prepayment-service.test.ts, loan-prepayment-calculation.test.ts, loan-prepayment-records.test.ts.
- Business Expenses: business-expenses-calculations.test.ts, business-expenses-service.test.ts, business-expenses-backup.test.ts, business-expense-form-submission.test.ts.
- Maintenance: maintenance-domain.test.ts, maintenance-service.test.ts, maintenance-backup.test.ts, maintenance-correction-indexeddb.test.ts.
- Shared forms/correction: shared-form-runtime.test.ts, record-form-working-copy.test.ts, historical-correction.test.ts.
- Generic feature/presentation: feature-presentation.test.ts, feature-screen-host.test.tsx, presentation-shell-contracts.test.ts, presentation-accessibility-responsive.test.tsx, architecture-import-policy.test.ts.

## 8. Architecture and presentation boundary findings

These are concrete observations from inspected source and are the first replacement refactoring targets. They do not justify changing any capability's business rules or persistence.

1. **Broad service context reaches section components.** admin-services-context.tsx exposes the complete AdminPresentationServices object. Current sections/forms call useAdminServices() directly. Replace this with outer section adapters and narrow view models/callback props; do not pass the full service set to visual leaves.
2. **Repository reaches Admin presentation.** The same context exposes AtomicRecordBatchRepository as identityRecords. AdminMaintenance uses it to construct a correction service; PersonIdentityPanel receives a repository. Move those operations behind explicit identity/correction application adapters.
3. **Maintenance correction owns service construction in UI.** MaintenanceExpenseCorrection.tsx imports core repository types, HistoricalCorrectionService, domain projection and global getPersonIdentityService; AdminMaintenance.tsx constructs that service from a repository. This is a direct persistence/service-locator dependency in the presentation tree. Preserve append-only correction behaviour, but move service construction and reads/writes to an explicit owner adapter before or during Maintenance presentation migration.
4. **Identity panel uses global platform/identity access.** PersonIdentityPanel.tsx imports getPlatformRecordSource and getPersonIdentityService, as well as identity adapters and a repository prop. Keep existing PIN/role/actor safeguards, but supply typed identity view data and commands through the authorized application composition boundary.
5. **Shell and section ownership are mixed.** AdminWorkspace.tsx owns section navigation and Finance query/schedule orchestration. AdminOperations.tsx contains both Driver and Compliance. Split shell, section adapters and section renderers so replacing one does not rewrite another.
6. **Styles are shared across unrelated Admin components.** Most current Admin presentation files import AdminWorkspace.css. New styles must be scoped to independently replaceable shell/section/leaf units; no global CSS dependency may become hidden coupling.
7. **Expense forms have a shared renderer but feature-specific meaning.** ExpenseEntryForm renders three distinct definitions. Preserve separate Platform Fee, Miscellaneous Expense and Traffic Challan definitions and owners; a common field renderer must not merge record semantics.
8. **Cross-cutting identity is inside Admin composition.** Preserve identity/security workflows and actor attribution. They are not a seventh business section and must not become Admin-owned business data.
9. **Vehicle context is distributed at section boundaries.** Finance, Compliance and Maintenance maintain their own vehicle selection/context; Driver manages assignment per driver. Replace visual selectors if desired, but every command must carry the authoritative vehicle ID and must never silently reassign historical records.

## 9. Confirmed gaps, discrepancies and baseline gates

### 9.1 Form-definition conformance coverage is incomplete

admin-form-definitions.ts declares 14 Admin forms. Current tests/shared-form-runtime.test.ts imports and validates the 11 Business Setup, Vehicle, Driver, Compliance, Maintenance and Loan definitions, but does **not** import/validate:
- PLATFORM_FEE_FORM_V1
- MISC_BUSINESS_EXPENSE_FORM_V1
- TRAFFIC_CHALLAN_FORM_V1

The shared form contract requires every registered/rendered form to be included automatically in conformance. There is no complete Admin form registry evidenced by the inspected tree. Add the three missing definitions to the automated validation/conformance path and make the inventory discoverable from canonical definitions, not a second hand-maintained list.

### 9.2 Business expense form mapping lacks focused tests

Service tests cover source-kind rules for platform fees, miscellaneous expenses and traffic challans. Current business-expense-form-submission.test.ts covers Fuel Entry GPS acquisition only. Add focused tests for each Admin definition's field-to-command mapping, date/amount conversion, attribution and validation errors. Do not change underlying BusinessExpensesService rules.

### 9.3 Admin rendered UI acceptance is partial

Only Compliance overview/review and Maintenance correction have dedicated browser-driven Admin acceptance scripts. Android's named rendered Admin acceptance is the Maintenance correction Capacitor test. No dedicated rendered section/form acceptance was found for Business Setup, Vehicle, Driver, Loan, Platform Fee, Miscellaneous Expense, Traffic Challan, or ordinary Maintenance visit/expense/rate forms. Generic feature-host/accessibility tests do not replace these tests.

The implementation plan must add section-by-section rendered PWA acceptance and corresponding Room-backed Android/WebView acceptance for workflows that run on Android. Keep physical-phone acceptance separate.

### 9.4 Maintenance correction boundary is not presentation-clean

The existing correction UI directly constructs and consumes a persistence-backed correction service. This is a concrete mismatch with the new presentation contract. Preserve current append-only, reasoned, idempotent and actor-attributed correction behaviour, but call it through a narrow Maintenance-owned application adapter. Do not weaken correction permissions or write a second correction implementation.

### 9.5 Compliance correction editor is not surfaced in current Admin composition

Compliance correction services/projection tests exist and corrected source values feed the overview, but no Admin correction form/action was found in inspected AdminOperations.tsx / AdminComplianceOverview.tsx presentation. Treat this as an existing capability/UI gap to reconcile against the Compliance product/correction owner contract before claiming full Compliance workflow parity. Do not invent a new correction policy in the UI.

### 9.6 Finance/Loan section label needs document reconciliation

The inspected Admin UI and previously established expense hierarchy use **Finance** as the visible group: Loan workflows, Platform Fees and Miscellaneous Business Expenses. The older Admin Functional Specification and Implementation Plan enumerate **Loan** as the visible section name. The intended hierarchy for this replacement is Finance as the visible group, with Loan as a Finance-owned workflow; Platform Fees and Miscellaneous Business Expenses remain distinct Finance forms, while Traffic Challans remain under Compliance. Reconcile the wording in normative Admin product/implementation documents before runtime replacement. This is a presentation grouping clarification only; it does not change Finance or Business Expenses capability ownership.

### 9.7 Existing Admin audit wording is stale in places

FORM_CONFORMANCE_AUDIT.md describes the current Loan details form as supporting create/edit. The inspected current LoanDetailsForm.tsx exposes only new-loan creation and resumable drafts; the Finance product rule says saved original Loan details are immutable. The replacement must preserve immutability and must not reintroduce an edit-saved-loan action. Treat the audit's create/edit wording as historical/stale, not as product authorization.

### 9.8 Exact-SHA baseline CI is not green

PR #89 documentation commit ec8ed26f5cabbcb77632d7ab1ebf45d373301cc7 triggered CI run #2394 (43664434223):
- Architecture job: passed.
- Web job: passed, including complete web regression/build and existing rendered PWA Maintenance/Compliance acceptance.
- Android job: failed in the required Room/workflow/backup reliability gate.
- Failing test: MaintenanceCorrectionCapacitorAcceptanceTest.adminMaintenanceCorrectionUsesLiveCapacitorRepositoryAndPreservesOriginal, assertion "Driver form" after switching the Admin actor to Driver in the Maintenance correction acceptance path.
- Integrated regression gate consequently failed because the Android required gate failed.
- The failure occurred on a documentation-only PR with no runtime changes; it is a baseline acceptance failure, not a regression introduced by the Admin contract document.

This must be diagnosed and made deterministic/green before final Admin acceptance. Do not dismiss it as a docs-only failure or claim CI green. Production geocoder verification was skipped as expected and is unrelated.

## 10. Stage 0 exit checklist and next implementation order

Stage 0 source inventory is complete at the recorded SHA. The following reconciliation gates remain:

1. Reconcile Finance/Loan visible section wording in the normative Admin product and implementation documents.
2. Close the three missing shared-form definition tests and add direct Business Expense form-mapping tests.
3. Move Maintenance correction and Person Identity service/repository access behind explicit owner adapters; retain existing behaviour and permissions.
4. Decide Compliance correction UI parity against the owning Compliance correction contract; do not silently omit an approved workflow.
5. Diagnose and green the exact failing Android acceptance test from CI #2394.
6. Add the section/form acceptance matrix to the runtime implementation plan before retiring any existing Admin UI.

After those gates, implement in this order:
- Define narrow Admin shell/section/leaf contracts and application-facing adapters.
- Replace Admin shell while existing sections still mount through compatibility adapters.
- Migrate Business Setup and Vehicle.
- Migrate Driver and its assignment/Work-selection surfaces.
- Migrate Compliance, including fleet analysis, review states and any approved correction path.
- Migrate Finance: Loan details, schedule/history, payments/reversal, prepayment, settlement, Platform Fees and Miscellaneous Business Expenses.
- Migrate Maintenance: visits, actual expenses, rate history, accruals, reminders and correction/history.
- Retire old Admin shell/components/styles only after workflow parity and cross-platform acceptance pass.

**No runtime implementation has been made by this Stage 0 inventory change.** The inventory is the checklist against which subsequent PRs must report exact workflow parity, tests, CI evidence and remaining owner acceptance.
