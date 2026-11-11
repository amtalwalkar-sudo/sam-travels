# Intelligent Business Advisor — Product Vision and Evolution Blueprint

**Document ID:** ST-INTELLIGENCE-VISION  
**Version:** 1.1  
**Status:** Living product vision; architecture direction under discussion  
**Owner:** Product owner  
**Last updated:** 2026-11-11  
**Implementation authorization:** Not granted by this document  
**Primary future workstream:** Performance capability and its presentation surface

## 1. Purpose and intended use

This document preserves the product vision and architectural direction for evolving Sam Travels into an intelligent business-performance and decision-support system.

It is deliberately a **living document**. The product owner and engineering work may add detail, revise proposals, record decisions, and split approved technical requirements into focused contracts as understanding develops.

The document is intended to be the durable starting point for a future, separately authorized Performance-screen workstream. When that work resumes, begin by reviewing this document together with the current repository contracts and implementation evidence. Do not assume that this document alone authorizes changes to the Performance screen, calculations, data model, or application runtime.

This is a product vision and architecture-planning document, not a replacement for normative contracts, a calculation approval, an implementation plan, or proof that a capability exists.

## 2. Product vision

The ultimate expectation is an **intelligent business advisor**.

Sam Travels should grow beyond transaction capture and retrospective reporting. It should help the owner understand the business's financial and operational position, explain meaningful changes, identify risks and opportunities, evaluate possible decisions, and make evidence-based recommendations.

The intended progression is:

1. **Reporting:** explain what happened.
2. **Business intelligence:** explain patterns, relationships, and why results changed.
3. **Advisory intelligence:** evaluate possible actions, estimate likely consequences, and recommend what deserves attention.

The architecture should be capable of supporting the advisory ambition from the outset, while implementation remains incremental and evidence-led.

## 3. Current decision status

### 3.1 Agreed product objective

- The long-term product objective is an intelligent business advisor, not merely a dashboard or accounting screen.
- Data reliability and consistent business meaning must precede sophisticated intelligence.
- Advice and calculations must be explainable and traceable to underlying business records.
- The Performance presentation must remain separate from the calculation and intelligence capabilities.
- Future work should extend the existing Sam Travels architecture rather than redesign stable foundations without evidence.
- This document must remain open to deliberate expansion as discussions progress.

### 3.2 Proposed architecture direction

The eight-layer model in Section 4 is the working architecture proposal. It is a design direction to refine against the repository's existing contracts, not a claim that all eight layers are implemented or fully specified.

### 3.3 Open product decisions

The following are not yet approved decisions:

- Whether the advisor is reactive, proactive, or combines both behaviours.
- Whether advanced analysis is entirely local, uses optional cloud services, or uses a hybrid model.
- Which forecasting horizons and confidence methods are appropriate.
- How business-health indicators and recommendation priorities are defined.
- Which alerts are important enough to interrupt the owner.
- The detailed canonical business model and the authoritative source for each future metric.
- How much historical business context should be retained as explicit "business memory".

Ideas in this document must retain their proposed/open status until explicitly approved.

## 4. Proposed eight-layer architecture

The working model separates business capture, trusted data, deterministic calculations, intelligence, advice, and presentation.

### Layer 1 — Business data capture

PWA and native Android overlay remain different user interfaces to shared business workflows and contracts.

The advisor should consume business records and validated projections, not depend on which interface created them.

The capture architecture must preserve the repository's existing authority boundaries, offline-first operation, durable acknowledgements, stable identity, and recovery semantics. This document does not redefine those technical guarantees.

### Layer 2 — Canonical business data

Business concepts need one consistent meaning across interfaces and features.

Examples of distinctions that must remain explicit:

- Revenue earned versus money collected.
- Expense incurred versus money paid.
- Receivable versus payable.
- Operating profitability versus cash position.
- Loan principal outstanding versus total future repayment obligation.
- Trip income versus cancellation fee, refund, adjustment, or transfer.

A business event must retain one stable identity through retries, synchronization, recovery, and presentation. Relationships to trips, shifts, vehicles, loans, and other records must be explicit where applicable.

Detailed field definitions, time semantics, units, money semantics, value states, and persistence envelopes remain owned by the existing data and persistence contracts.

### Layer 3 — Data quality and reconciliation

Before a record contributes to a consequential business conclusion, the system should be able to assess whether it is usable for that purpose.

Potential checks include:

- Duplicate or conflicting events.
- Missing required values or classifications.
- Broken or ambiguous relationships.
- Invalid or implausible values.
- Unreconciled pending/offline work.
- Corrections, reversals, and changed source records.
- Incomplete periods or incomplete source coverage.

Future outputs may communicate completeness, reconciliation state, and confidence. A confidence score must not be invented or presented as statistically meaningful until its definition and validation are approved.

The advisor must disclose limitations and must not silently fill gaps with assumptions.

### Layer 4 — Business calculation engine

Business calculations should be deterministic, independently testable, versioned, and owned by the appropriate feature/domain boundary.

Candidate calculation areas include:

- Revenue and collections.
- Operating and non-operating expenses.
- Business profitability and contribution.
- Vehicle-level contribution.
- Fuel cost and efficiency.
- Maintenance cost and trends.
- Loan EMI, amortization, outstanding principal, and approved prepayment effects.
- Cash inflows, outflows, and future obligations.
- Historical and custom-period comparisons.

Each production metric requires an explicit contract covering its identity and version, formula, input meaning, units, period/timezone rules, inclusions and exclusions, missing-data policy, rounding, historical correction/recalculation policy, and expected-result fixtures.

The existing [Finance and Performance Calculation Approval Gate](FINANCE_PERFORMANCE_CALCULATION_APPROVAL.md) remains authoritative. This vision does not approve new accounting policies or production Performance metrics.

### Layer 5 — Business intelligence engine

Once the underlying calculations and source data are trustworthy, the system may identify relationships and patterns such as:

- Revenue and expense trends diverging.
- Fuel or maintenance costs changing unusually.
- Vehicle contribution deteriorating.
- Income increasing while available cash decreases.
- Financial obligations becoming harder to support.
- Period-to-period and vehicle-to-vehicle differences.

Insights must be derived from registered calculations and disclosed evidence. An observed correlation must not be presented as a proven cause.

### Layer 6 — Decision and recommendation engine

This layer may evaluate possible actions using explicit assumptions and scenarios.

Candidate examples:

- Reducing unproductive kilometres.
- Improving vehicle utilisation.
- Investigating unusual operating costs.
- Comparing vehicle repair, replacement, or purchase scenarios.
- Comparing loan repayment alternatives.
- Estimating the effect of a proposed business change on cash requirements or contribution.

Recommendations should explain the evidence, assumptions, estimated impact, uncertainty, and relevant trade-offs. Estimates must be distinguished from actual results.

The advisor may recommend; consequential business, financial, or record-changing actions remain subject to explicit owner approval.

### Layer 7 — Conversational intelligent advisor

The owner should eventually be able to ask business questions in ordinary language.

Examples:

- How is the business doing?
- Why did profitability change this month?
- Which vehicle contributed the most?
- What are the largest cost drivers?
- What upcoming obligations may pressure cash?
- What would happen under a proposed vehicle or loan scenario?

Answers must be grounded in Sam Travels records and registered calculation/analysis services. Language-model interpretation must not be the source of financial arithmetic or unsupported factual claims.

The advisor should explain its reasoning and provide a path from conclusions to contributing records and calculation definitions.

### Layer 8 — Business presentation

Performance is one presentation surface for validated business information; it is not the owner of business rules, calculations, or intelligence.

Potential future presentation areas include:

- Business overview and current position.
- Financial performance.
- Vehicle performance.
- Cash flow and obligations.
- Risks, alerts, and opportunities.
- Conversational advisor and evidence drill-down.

The presentation layer should be replaceable without changing stable capture, persistence, calculation, or intelligence contracts.

## 5. Candidate business knowledge and insight domains

The following are a capability catalogue for future discussion, not an approved metric list.

### 5.1 Business profitability

Potential questions and measures:

- What income was earned, and what cash was collected?
- What operating costs were incurred and paid?
- What is the contribution after fuel and other approved operating costs?
- How do cancellation fees contribute?
- How does profitability vary by vehicle and period?

### 5.2 Vehicle intelligence

Potential questions and measures:

- Income and contribution by vehicle.
- Fuel expenditure and efficiency.
- Cost per kilometre where a trustworthy driven-distance source exists.
- Maintenance cost and frequency.
- Utilisation and unproductive distance/time, where adequately captured.
- Vehicles with deteriorating or unusually low contribution.

GPS endpoint distance must not be represented as driven distance without an approved and validated distance source.

### 5.3 Financial position

Potential questions and measures:

- Cash inflows and outflows.
- Receivables and payables when supported by approved transaction records.
- Loan principal and repayment obligations.
- EMI schedule and approved prepayment impact.
- Actual cash position compared with operating profitability.

### 5.4 Trends, forecasts, and risk

Potential future capabilities:

- Daily, weekly, monthly, and owner-selected date-range comparisons.
- Expense and revenue trends.
- Forecasts with disclosed assumptions and uncertainty.
- Unusual-value and change detection.
- Upcoming obligation and liquidity-risk indicators.
- Vehicle or operating-pattern underperformance.

Forecasts are estimates, not actuals, and require sufficient history and validation before being relied upon.

## 6. Trust, evidence, and governance principles

The following principles are intended to guide all future advisor capabilities:

1. **Evidence before conclusions:** material statements must be traceable to source records or explicitly identified external assumptions.
2. **Deterministic calculations before interpretation:** financial and operational arithmetic belongs to tested calculation modules, not free-form AI responses.
3. **No silent gap-filling:** missing, conflicting, provisional, or estimated inputs must be disclosed.
4. **Purpose-specific data quality:** a record may be usable for one metric and insufficient for another; quality must be evaluated against the calculation's requirements.
5. **Historical reproducibility:** preserve the calculation/version and relevant input provenance needed to explain prior results.
6. **Correction transparency:** corrections and reversals must be represented through the approved data lifecycle, not hidden by overwriting history.
7. **Human control:** recommendations do not authorize automatic financial or operational actions.
8. **Privacy and security:** any new processing or integration must follow the repository's security, network-access, and data-minimization contracts.
9. **No false acceptance claims:** CI, emulator, physical-device, and real-world data acceptance are distinct evidence categories.

### 6.1 Business-event evidence and verification

A successful application write proves that a value was durably captured; it does not prove that the reported real-world event or amount is true. The advisor must preserve that distinction in its data model, analysis, and language.

Use the following evidence states as the approved product vocabulary:

- **Reported:** entered or asserted by an owner, driver, employee, or other identified source; sufficient corroboration has not been established.
- **Corroborated:** supported by one or more relevant, separately identified evidence sources. Multiple records copied from the same original assertion do not constitute independent corroboration.
- **Verified:** the event satisfies the explicit, event-type-specific verification requirements approved for that business event. A successful form submission, a valid database commit, or a GPS snapshot alone is not sufficient.
- **Conflicting:** available evidence materially disagrees and the discrepancy has not been resolved.
- **Unknown:** available evidence is insufficient to determine the event's status.

These states are not a universal linear progression. An event may remain reported, become corroborated, require review because evidence conflicts, or remain unknown. Do not automatically promote a state merely because time passed or a related record was created.

The evidence model must preserve, where applicable:

- Who or what supplied each assertion or observation, and when it was supplied/observed.
- The original event time separately from capture, receipt, persistence, and review times.
- Evidence type, source identity, provenance, integrity/reference, and the business event it supports.
- Whether sources are genuinely independent or derive from the same original input.
- The verification rule/version applied, decision time, reviewer/actor, and reason for any manual resolution.
- Corrections, reversals, conflicting claims, and unresolved limitations without erasing history.

Verification requirements are event-specific. GPS can corroborate a location/time observation but does not by itself prove that a trip was commercially completed, that a fare was agreed, or that cash was collected. A manually entered fare is a reported amount until the relevant collection evidence is available. Missing evidence does not prove that an event did not occur.

Every insight and calculation must declare the evidence states and source completeness it accepts. A record may be technically durable and usable for one operational purpose while remaining ineligible for a financial conclusion. If the evidence is insufficient, the advisor must say so and explain what is missing rather than inventing a confidence score or silently treating the record as verified.

This is a product-level requirement. The current implementation must be audited before defining storage fields, event-specific verification rules, or implementation scope. This section does not assert that evidence-state tracking or independent corroboration is already implemented.

## 7. Relationship to existing Sam Travels architecture and contracts

This document is subordinate to existing normative repository contracts. It adds product direction; it does not duplicate or supersede their detailed rules.

Relevant owners include:

- [Architecture overview](../ARCHITECTURE.md) — layers, dependency direction, persistence ownership, offline-first and feature boundaries.
- [Data Contract](../DATA_CONTRACT.md) — meaning of data, dates, money, units, and value states.
- [Architecture Foundation Contract](ARCHITECTURE_FOUNDATION_CONTRACT.md) — shared application and capability guarantees.
- [Feature Module Contract](FEATURE_MODULE_CONTRACT.md) — feature ownership, public APIs, calculations, and integrations.
- [Feature Extension Architecture](FEATURE_EXTENSION_ARCHITECTURE.md) — developer guidance for adding features and calculations.
- [Finance and Performance Calculation Approval Gate](FINANCE_PERFORMANCE_CALCULATION_APPROVAL.md) — current approval boundary for Finance and Performance calculations.
- [Persistence Schema Contract](PERSISTENCE_SCHEMA_CONTRACT.md), [Local Persistence Contract](LOCAL_PERSISTENCE_CONTRACT.md), and [Transaction and Recovery Contract](TRANSACTION_AND_RECOVERY_CONTRACT.md) — durable record, storage, idempotency, and recovery guarantees.
- [Security, Privacy, and Compatibility Contract](SECURITY_AND_COMPATIBILITY_CONTRACT.md) and [Network Access Contract](NETWORK_ACCESS_CONTRACT.md) — security and network boundaries.
- [UI/UX Shell Foundation Contract](UI_UX_SHELL_FOUNDATION_CONTRACT.md) — replaceable presentation and shell boundaries.

If this vision exposes a missing technical rule, update the appropriate owning contract through its normal review and index process. Do not copy a second, potentially conflicting version of that rule into this document.

## 8. Future Performance-screen workstream

The next time Performance work is resumed, use this document as the product-vision starting point and perform a fresh repository audit before implementation.

The future work should proceed in this order:

1. Re-read this vision and identify which product questions the Performance capability should answer first.
2. Inspect the current Performance implementation, feature manifest/extension registration, calculation registry, data sources, and tests at the exact target commit.
3. Reconcile the findings with the existing Performance calculation approval gate and all relevant data, feature, persistence, and presentation contracts.
4. Audit data availability, completeness, provenance, and PWA/Android parity for each candidate metric.
5. Agree metric definitions, source eligibility, period boundaries, missing-data behaviour, rounding, and expected-result fixtures before registering production calculations.
6. Keep calculation and intelligence outputs independent of the Performance screen.
7. Design the Performance presentation only around approved, validated outputs; support custom date selection where approved.
8. Add traceability from displayed results to calculation versions and contributing records.
9. Verify regressions and platform parity. Keep automated evidence distinct from physical-device and real-world acceptance.

The Performance screen must not become a second calculation engine. A new metric must not silently change existing metric outputs. Historical recalculation requires an explicit policy and review.

This section is a planning sequence only. It does not authorize implementation now.

## 9. Evolution and change-management policy

This document may be expanded as discussions progress.

For each material addition or change, record:

- Date and document version.
- Requirement or decision changed.
- Status: proposed, discussed, approved, superseded, or implemented.
- Rationale and expected business value.
- Affected product areas and owning contracts.
- Data dependencies and acceptance evidence required.
- Whether implementation has been separately authorized.

Do not silently convert a proposal into an approved requirement. Do not rewrite historical implementation evidence to imply that a proposed capability already exists.

When a detailed area becomes implementation-ready, create or update a focused product/technical contract and link it here. Keep this document as the high-level vision and navigation point rather than allowing it to become a copy of every detailed contract.

## 10. Initial discussion backlog

These subjects remain open for future product discussions:

1. Reactive, proactive, or combined advisor behaviour.
2. Local, cloud-assisted, or hybrid intelligence processing.
3. Business-health indicators and how they should be explained.
4. Forecast horizons, confidence, and minimum data sufficiency.
5. Recommendation ranking, expected impact, and trade-off presentation.
6. Alert thresholds, urgency, and notification preferences.
7. Canonical business entities and source-of-truth mapping for each candidate metric.
8. Business-history context and the scope of any business-memory capability.
9. Owner-facing evidence drill-down and correction workflows.
10. Privacy, retention, and processing boundaries for future intelligence services.
11. Event-type-specific evidence requirements and corroboration sources for Trips, fares, collections, expenses, fuel, maintenance, and financial obligations.

## 11. Version history

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-11 | Initial living vision, proposed eight-layer architecture, trust principles, and future Performance workstream hand-off. |
| 1.1 | 2026-11-11 | Approve the reported/corroborated/verified/conflicting/unknown evidence vocabulary and event-specific verification principle; link business-event reliability audit work. |

---

**Current status:** Vision recorded; business-event evidence vocabulary approved; event-specific verification rules and technical implementation remain to be audited and approved.  
**Implementation status:** No Performance-screen, calculation-engine, data-model, or runtime implementation is authorized by this document.
