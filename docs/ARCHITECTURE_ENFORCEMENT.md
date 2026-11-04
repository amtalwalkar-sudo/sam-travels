# Architecture Enforcement and Verification

## Purpose

This document defines what the automated architecture gate proves, what it cannot prove, and the evidence required before describing Sam Travels as architecture-complete. A documented rule is not considered enforced merely because it appears in a contract.

## Automated source checks

`npm run check:architecture` runs `scripts/check-architecture.mjs` and is a required pull-request CI job. It performs deterministic, dependency-free checks over tracked source trees (excluding generated/dependency directories):

1. **Source discipline:** TypeScript, JavaScript, Kotlin, and Java files stay within 400 lines and 24 KB.
2. **Layer direction:** core/domain/application cannot depend on UI, storage, or platform SDKs; application/domain code cannot reach concrete persistence adapters; presentation cannot import persistence adapters.
3. **Presentation isolation:** React presentation code cannot import Dexie or Capacitor directly. It must use application and platform contracts.
4. **Feature encapsulation:** a feature may use its own implementation, but another feature may depend on it only through that feature's public `packages/features/<id>/index.ts` entry point.
5. **Feature dependency cycles:** declared cross-feature public-entry imports are collected into a graph and cycles fail the gate.
6. **Contract presence:** the feature-module and architecture-foundation contracts must retain their required registration, lifecycle, backup/restore, and calculation sections.

Relative imports and TypeScript path aliases declared in `tsconfig.json` are resolved before applying package-boundary checks. This prevents a simple alias from bypassing a boundary rule.

## CI acceptance

The `architecture`, `web`, and `android` jobs are the automated merge evidence:
- `architecture`: static source boundaries and dependency-cycle checks.
- `web`: domain, repository, recovery, compatibility, regression tests, and production build.
- `android`: native build, unit tests, and emulator instrumentation.

A green workflow proves only the checks that ran on that commit. Repository rulesets/branch protection must separately require all three job checks; the workflow file cannot enforce GitHub repository settings by itself.

## Explicit limits of static enforcement

Static import analysis cannot prove:
- that a feature's runtime registration is complete or that startup rejects invalid registrations;
- that every business entity is automatically included in backup/restore;
- that a database transaction is atomic under every real failure;
- that a network request always passes through the policy gateway when URLs or clients are dynamically constructed;
- that permission, background scheduling, process death, reboot, OEM power management, or Dropbox OAuth work on a real device/account;
- that a feature can be removed or replaced without data loss.

These claims require runtime integration tests, migration and failure-injection tests, backup fixture coverage, and the separately recorded physical-device/Dropbox acceptance gates. Do not infer them from static CI.

## Completion evidence for a 10/10 architecture target

The architecture should not be scored 10/10 until all of the following are evidenced:

- Each persistent feature has one typed, versioned registration with schema/migration, dependency, lifecycle, and backup/restore participation metadata.
- Startup/build validation rejects duplicate IDs, missing required dependencies, incompatible contracts, missing migrations, and missing restore participants before writes are enabled.
- Backup and restore discover participants from the validated registry rather than a manually duplicated feature/table allowlist.
- Calculation contracts identify owner, version, inputs, rounding/units, effective-date semantics, and regression fixtures.
- Cross-feature integration is explicit and versioned; new data cannot silently change existing metrics.
- CI checks import boundaries, feature dependency cycles, schema/migration compatibility, backup participant completeness, and calculation regression suites.
- The required GitHub checks are enforced by repository rulesets/branch protection.
- Physical-device and live external-integration acceptance is recorded separately; user-deferred checks remain visibly pending rather than being represented as complete.

## Safe change policy

Do not weaken or suppress an architecture rule to make a build green. A justified exception must identify the affected path, reason, owner, expiry/removal condition, and a regression test. Prefer narrow adapter contracts and incremental migrations over a mass directory rewrite.
