# Temporary Full-Cost Breakeven Sanity Check

**Status:** Temporary validation surface; calculation and source services are permanent.

The temporary surface is registered in the existing Performance entry point by the single constant `ENABLE_TEMPORARY_BREAKEVEN_SANITY_CHECK` in `apps/web/src/main.tsx`. It is deliberately separate from the domain calculation, application source adapter, source records, provenance and tests.

## Safe removal command

After the full-cost calculation and wiring have passed validation, run:

```sh
npm run remove:breakeven-sanity-check
```

The command changes only the registration constant from `true` to `false` in `apps/web/src/main.tsx`. It does not delete files, calculation code, source adapters, source records, persisted provenance, audit detail, or regression tests. It is deterministic and safe to repeat; a second invocation reports that the surface is already disabled.

Rebuild and verify the app after running the command. The Performance entry point and any registered feature screens remain available for the separately directed Performance redesign. Do not run this command before calculation validation is accepted.
