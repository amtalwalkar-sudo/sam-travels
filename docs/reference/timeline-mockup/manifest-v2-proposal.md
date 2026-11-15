# Timeline visual reference manifest — v2 proposal

- **Artifact:** `sam-travels-timeline-proposed-direction-v2.svg`
- **Format:** SVG (UTF-8 vector)
- **SHA-256:** `302278efb953aeedb7eb4d0410081e3da5bf49f603993b6560380827463af514`
- **Artboard:** 1230 × 970 SVG units; three 390 × 844 mobile viewport frames with proposal labels and review margin
- **Target:** Sam Travels PWA main application; mobile-first reference proposal
- **Reference viewport:** Each phone frame is 390 CSS px wide by 844 CSS px high. Device pixel ratio, browser chrome and physical-device viewport are not specified or validated.
- **Represented states:** (1) day overview with day/week/date navigation, chronological event sequence, compact shift summary and continuation cue; (2) Monday–Sunday week overview with one selected day; (3) read-only completed-ride detail with close/back affordance.
- **Approval status:** **PROPOSAL ARTIFACT — NOT PERSONALLY USER-APPROVED.** The user has since delegated design decisions to the assistant; this v2 artifact is selected as the initial implementation direction under that delegation. It is not represented as an explicit user approval.
- **Proposal provenance:** Created 15 November 2026 to satisfy the layered day/week review and progressive detail requirements in the user-approved Timeline Presentation Replacement Implementation Contract.
- **Visual continuity:** Retains v1's dark navy surfaces, restrained blue accents, green completed/online states, amber cancellation/review treatment, individually bounded ride cards, pickup connectors outside ride cards, stronger shift boundaries and fixed navigation labels exactly `Drive · Timeline · Performance · Admin`.
- **New information hierarchy:** Period navigation and day/week selection precede the chronological day sequence. Week view exposes seven Monday–Sunday dates and a direct day-selection affordance. Event detail is a separate read-only layer with a return path to the selected day.
- **Data integrity:** Uses only values already present in the v1 sample for 5 November 2026. The week sample marks the other six dates as “Not represented in sample”; it does not imply those dates had no activity. Shift 1 pickup/idle remain “Review”. Unprovided trip finance, GPS, odometer and other evidence are not invented. Day sequence indicates that Shift 2 continues below the initial viewport.
- **Interaction note:** The SVG illustrates intended states and affordances, not executable interactions or a claim about runtime behavior.
- **Responsive scope:** This proposal defines the mobile information hierarchy only. Wider viewports must adapt this same hierarchy and must not introduce an alternate dashboard, multi-column information model or new navigation system without approval.
- **Relationship to v1:** v1 remains the approved historical visual baseline and must remain byte-for-byte unchanged. v2 becomes authoritative only after explicit user approval and the corresponding update to the visual-fidelity contract.
- **Version policy:** Keep this proposal as v2 even if rejected; a materially revised proposal must be separately versioned rather than silently replacing these bytes.
