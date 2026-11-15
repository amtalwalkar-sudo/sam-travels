# Timeline Mockup Visual Fidelity Contract

**Status: v1 is the immutable historical approved reference; the layered v2 direction is selected for implementation under the user's delegated design authority.**  
**Target: Sam Travels PWA main application.**  
**Scope: Visual-reference governance and faithful implementation of the delegated driver-first Timeline direction. The assistant owns visual decisions within the product and architecture contracts; the user retains final acceptance and merge authority.**

## 1. Purpose and authority

The v1 artifact is the historical user-approved visual baseline, authored from the 5 November 2026 specification. It remains byte-for-byte immutable and preserves the original visual language. The layered v2 artifact was created as a proposal; following the user's explicit delegation of design decisions, it is the selected starting direction for implementation, not a claim of personal user approval.

The assistant owns the visual refinements needed to deliver the delegated driver-first day/week and progressive-detail experience. Refinements must remain within the written product intent, accessibility, responsive, privacy and architecture constraints. The assistant must document material design choices and compare implementation against the selected direction; it must not silently rewrite the historical v1 or original v2 proposal.

This contract applies to the PWA main app. Any other host or presentation surface must preserve the same Timeline visual identity and information hierarchy, subject only to platform constraints explicitly approved through change control.

## 2. Reference-artifact preservation

The approved mockup must be preserved in this repository as an immutable review artifact.

### Required reference location

Store the original approved mockup under:

`docs/reference/timeline-mockup/`

Keep its original filename and native format. Do not redraw, crop, recompress, annotate, retouch, recolour, resize, or otherwise modify the source artifact when adding it to the repository. If multiple approved screens or states form the mockup, preserve the complete set and document the intended order/state for each file.

Alongside the original, maintain a small reference manifest recording:
- Original filename and format.
- SHA-256 checksum of the exact committed bytes.
- Original pixel dimensions and, where known, intended viewport/device dimensions.
- The screen/state represented (for example, populated Timeline, empty state, active shift, completed shift).
- Approval provenance/date where available.
- Any additional approved viewport variants and their relationship to the primary reference.

The committed, approved versioned reference artifact is the comparison baseline. A later export, recreation, screenshot of an implementation, or edited copy must never silently replace it. A changed visual baseline requires explicit user approval, a new versioned reference artifact, an updated manifest, and a documented reason; retain the prior approved baseline for history.

### Historical approved baseline and selected implementation direction

The historical approved baseline is preserved as:

- `docs/reference/timeline-mockup/sam-travels-timeline-approved-direction-v1.svg`
- `docs/reference/timeline-mockup/manifest-v1.md`

The v1 manifest records its checksum, 390 × 2260 artboard and approval provenance. Preserve both files unchanged.

The initial layered implementation direction is recorded separately as:

- `docs/reference/timeline-mockup/sam-travels-timeline-proposed-direction-v2.svg`
- `docs/reference/timeline-mockup/manifest-v2-proposal.md`

The v2 file remains honestly labelled as a proposal artifact in its provenance. It is selected as the implementation starting direction under the user's delegated design authority; it is not represented as explicitly user-approved. If implementation materially refines the direction, record the decision and evidence in the implementation PR rather than overwriting either historical artifact.

The mockup contains two shift sections and their summaries. Shift 1 total fare is correctly represented as ₹1,120 (₹450 + ₹620 + ₹50 cancellation fee). Pickup and idle totals are marked for review because the supplied Shift 1 pickup/cancellation intervals do not establish a fully reconciled interval set. Shift 2 values reconcile to its supplied shift duration. Missing toll, parking and odometer data are not fabricated.

## 3. Fidelity requirements for the PWA main app

The PWA Timeline must match the approved mockup in all visual aspects that the mockup specifies, including:

- Overall screen composition, section order, grouping and alignment.
- Relative size, position, density and visual weight of every visible component.
- Typography: font family where identifiable, size, weight, line height, letter spacing, casing and text hierarchy.
- Spacing system: outer margins, internal padding, gaps, connector offsets and distances between events.
- Shapes and surfaces: borders, dividers, corner radii, card/container treatment, elevation and backgrounds.
- Colour palette and semantic use of colour, including neutral system events and restrained cancellation/warning treatment.
- Icons, arrows, connector geometry, labels, time/fare emphasis and location presentation.
- The event sequence and the visual relationship between shift sections, pickup connectors, ride/cancellation blocks and shift summaries.
- Density and information hierarchy: prominent, secondary and supporting details must retain the same relative emphasis.

Do not infer permission to change any of these from implementation convenience, CSS framework defaults, component-library defaults, design trends or a developer's aesthetic preference.

Where the mockup contains exact text, labels, symbols or ordering, preserve them unless a separate approved product rule requires dynamic data in that position. Dynamic values may change; their location, formatting hierarchy and visual treatment must remain faithful.

## 4. Responsive adaptation: constrained, not redesigned

Responsive behavior exists only to preserve the approved design on viewports that differ from the mockup's reference viewport.

Permitted adaptations are limited to those necessary to prevent clipping, overlap, unreadable text, inaccessible controls or horizontal overflow. Examples may include proportionally adjusting available widths, allowing text to wrap, and reducing non-semantic gaps within a documented tolerance.

Responsive adaptation must preserve:
- The same component order and event sequence.
- The same information hierarchy and relative visual emphasis.
- The same visual grouping and association between labels, values and events.
- The same connector-to-event relationships and shift boundaries.
- The same colours, typography roles, shapes and visual language.
- All required information and actions; content must not be silently hidden or discarded to fit.

Do not convert the screen into a different card system, table, dashboard, multi-column layout, tabbed design, carousel, or alternative navigation pattern merely because the viewport is wider or narrower. Do not introduce new breakpoints or alternate layouts without demonstrating they are strictly necessary to preserve usability and without recording the change for review.

The reference viewport is the exact viewport metadata recorded in the manifest when the original mockup is committed. Other target widths must be tested as responsive adaptations of that design, not treated as opportunities for a new design.

## 5. Source of visual values

The selected implementation direction and preserved v1 visual language guide visual values they make observable. Extract and document a traceable visual specification, including dimensions, spacing, typography, colours, borders, radii, icon sizes and alignment anchors where they can be reliably measured.

Do not invent exact pixel values, colour codes, font names or breakpoints before the source artifact is available. If a value cannot be reliably determined from the mockup, record it as an explicit unresolved measurement for review rather than silently guessing.

The implementation may express extracted values as reusable design tokens or CSS variables, but those tokens must be derived from the mockup. Tokenization is an implementation technique, not authority to change the reference.

## 6. Visual regression and comparison requirements

Before Timeline visual implementation can be accepted:

1. Confirm the currently approved versioned reference artifact is committed at the reference location and its SHA-256 manifest entry matches the committed bytes.
2. Record the reference viewport, device scale factor if known, browser rendering assumptions and any mockup state/data assumptions.
3. Capture the PWA implementation at the same viewport and equivalent content/state.
4. Compare reference and implementation using side-by-side review and an overlay/difference view. Evaluate layout anchors, typography, spacing, colour, borders, event order, component dimensions and information hierarchy.
5. Correct unintended deviations. A visual difference is not accepted merely because the implementation is functionally correct.
6. Test narrower and wider supported viewports to prove responsive adaptation preserves the reference design and does not clip, overlap, hide or reorder essential information.
7. Retain comparison screenshots/reports and identify the exact source commit, build, viewport and reference checksum used for each acceptance result.

Visual tests must use deterministic fixture content so different timestamps, fares, locations or event counts do not create misleading diffs. Dynamic content regions may be normalized only when their text/content is intentionally variable; normalization must not mask layout, typography, alignment, spacing or styling regressions.

A passing visual test does not replace behavioral, accessibility, data-integrity or cross-platform tests. Conversely, passing behavioral tests does not establish visual fidelity.

## 7. Conflict resolution and change control

- The mockup governs visual presentation; the Timeline Design Proposal and authoritative domain contracts govern behavior, ownership, calculations, time semantics and data states.
- If the mockup appears to conflict with an approved behavioral or accessibility requirement, do not silently violate either. Record the exact conflict and obtain an explicit decision before implementation or changing the reference.
- No developer or automated formatter may change the approved visual baseline.
- Any intentional deviation must have a written rationale, affected elements/viewports, before/after evidence and explicit user approval.
- Responsive necessity is not a blanket exemption from fidelity; only the smallest adaptation needed to preserve usability is permitted.
- A visual redesign is a new product-design decision, not an implementation detail.

## 8. Acceptance checklist

The visual-fidelity requirement is accepted only when all applicable items are evidenced:

- [ ] Current approved versioned reference committed with checksum and manifest; prior approved versions retained.
- [ ] Reference viewport and mockup state documented.
- [ ] PWA main app matches composition, ordering, hierarchy and alignment.
- [ ] Typography, spacing, colours, borders, radii, icons and connectors match the reference.
- [ ] Shift, pickup, ride, cancellation, boundary and summary presentation match the reference wherever shown.
- [ ] No new visual system, layout or interaction pattern has been introduced.
- [ ] Same-viewport side-by-side and overlay/difference review completed.
- [ ] Narrow/wide viewport adaptation preserves hierarchy and all required information.
- [ ] No clipping, overlap, accidental horizontal scrolling or hidden essential content.
- [ ] Visual regression evidence is tied to the exact implementation commit/build and reference checksum.
- [ ] Any unavoidable deviation has explicit user approval and is recorded.

The v1 reference is now committed. Visual fidelity of any future implementation still requires the full same-viewport and responsive evidence in this checklist; committing a mockup alone does not verify an implementation.

## 9. Implementation authorization and limits

This visual contract is binding for the authorized Timeline implementation in the PWA main application. The delegated design authorization recorded at the top of this document permits implementation and refinement of the selected layered Timeline direction within the scope and constraints of the governing Timeline Product Design, Feature Module and Extension Contract, Feature Extension Architecture, and Authority and Responsibility Allotment Map.

It does not authorize:
- A new or parallel feature-extension, registry, navigation, persistence, recovery, or platform architecture.
- Timeline ownership of Work/Shift lifecycle, Driver Workflow transitions, Log Book/Trips lifecycle or financial records, odometer records, or GPS evidence.
- Private-table or persistence-adapter access across feature boundaries, duplicate authoritative records, or a second event store.
- Automatic GPS collection, map tiles, reverse-geocoding activation, hosted-provider credentials, or recurring provider spend.
- Silent replacement of v1 or the original v2 proposal. Any materially new reference must be separately versioned and retain prior baselines.

The PWA main app is the named visual target. The assistant makes visual decisions under the user's delegation, while any change to product behavior, ownership, data semantics, privacy or platform scope remains subject to the owning contract and explicit user approval. Passing CI or committing a mockup does not by itself establish visual fidelity; comparison evidence tied to the selected direction and exact commit remains mandatory.