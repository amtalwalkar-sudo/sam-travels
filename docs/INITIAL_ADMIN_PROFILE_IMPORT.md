# Initial Admin profile import

The web application applies `apps/web/src/data/initial-admin-profile-v1.json` during bootstrap through the normal Vehicle, Driver, Compliance, and Finance services.

This is a data-only, versioned first-run profile, not business logic or a hard-coded calculation. Each entity has a stable record identity. Bootstrap creates a record only when that identity is absent; it never overwrites an existing Admin record. If bootstrap stops part-way through, the next launch safely retries the records that are still missing.

The profile contains the user-confirmed Vehicle, Driver, five Compliance coverage records, and original vehicle-loan terms. The loan schedule retains the actual month-end EMI dates (30 September, then the last calendar day of each month).

Intentionally not populated because the values were not supplied or verified:

- Business start date.
- Starting odometer reading.
- Driver licence number and expiry date.
- Actual EMI payment ledger entries. Two instalments were reported paid, but the exact paid amounts and payment method/reference were not confirmed; the importer does not manufacture payment transactions from a calculated EMI estimate.
- Maintenance rate, fuel purchases, platform fees, challans, and other expense records.

The vehicle type is stored as `Car` to satisfy the existing required Admin field. Admin can edit ordinary record values later; the bootstrap will not restore the seed over those edits.
