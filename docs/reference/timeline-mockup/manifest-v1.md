# Timeline mockup reference manifest — v1

- **Artifact:** `sam-travels-timeline-approved-direction-v1.svg`
- **Format:** SVG (UTF-8 vector)
- **SHA-256:** `550ca12860ffae8425658791871933f1629fe376b528834fe5cfc8cfe04e9dc1`
- **Artboard:** 390 × 2260 SVG units (mobile portrait)
- **Target:** Sam Travels PWA main application, mobile-only reference direction
- **Reference viewport:** 390 CSS px wide artboard; device pixel ratio and physical device viewport were not specified or validated
- **Represented state:** Populated Timeline for 5 November; two ended logical shifts; completed rides; one cancelled attempt; shift-summary panels; Today filter selected; fixed bottom navigation
- **Approval provenance:** User explicitly approved the visual direction, including shift-summary panels, in the conversation on 5 November 2026 and requested preservation in PR #11
- **Artifact provenance:** Authored SVG derived from the user's textual mockup and the approved in-chat review wireframe. It is not an uploaded historical screenshot or recovered pre-existing image.
- **Visual rules:** Individually bounded ride containers; pickup connectors outside ride cards; restrained cancellation block; stronger shift boundaries; extensible summary panel; fixed navigation labels exactly `Drive · Timeline · Performance · Admin`.
- **Data integrity notes:** Shift 1 total fare is ₹1,120 (₹450 + ₹620 + ₹50 cancellation fee). Shift 1 pickup/idle metrics are marked for review because the supplied event durations do not establish an unambiguous reconciled interval set. Shift 2 time metrics reconcile to 03:25:00. Toll, parking and odometer values were not supplied and are not fabricated.
- **Version policy:** v1 is immutable. Any later approved visual revision must be a new versioned artifact with its own checksum and provenance; retain v1 and all earlier baselines.
- **Implementation status:** Documentation/reference only. No PWA or Android UI/runtime implementation is authorized by this approval.
