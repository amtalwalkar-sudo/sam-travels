# Security, Privacy, and Compatibility Contract

## Data minimization and local protection

- Collect and persist only data needed for the single-driver log book and business workflows.
- Protect local business data using platform-appropriate storage protections and Android database/file protections appropriate to the threat model. Do not claim encryption at rest unless it is implemented and verified.
- Store OAuth credentials and refresh tokens only in platform-appropriate secure credential storage; never in ordinary business tables, exports, source control, or logs.
- Exclude secrets, credentials, ephemeral caches, and unnecessary diagnostic data from backup packages.
- Redact access tokens, passwords, authentication headers, and sensitive personal/financial fields from logs and crash reports.
- Keep diagnostics useful but data-minimized; avoid collecting telemetry or sending diagnostics unless an explicitly enabled capability and purpose authorize it.

## Network and integration security

- All app-initiated network traffic passes through the user-controlled network capability gateway.
- The master Internet Access policy defaults to disabled. New integrations cannot enable it, bypass it, or broaden data scope silently.
- Use TLS for remote transport and validate service responses, redirects, and package metadata.
- Use OAuth with least-privilege scopes for Dropbox. Never request the user's Dropbox password.
- Send only the minimum data required for each capability. A reverse-geocoding request must not upload the full business database.
- Treat imported files, backup packages, remote responses, and external metadata as untrusted input.

## Import, backup, and restore validation

- Validate file size limits, manifest/schema versions, checksums, record IDs, relationships, attachment references, and supported application/data versions before import or restore.
- Reject malformed, truncated, unsupported, or integrity-failing packages without replacing live data.
- Stage restore into isolated temporary storage or an equivalent validated staging boundary; create the required internal recovery checkpoint before replacing live data.
- Restore only after user review and confirmation. Verify the restored dataset before allowing normal workflows.
- Keep the pre-restore checkpoint until the restored state is verified; failed/interrupted operations must preserve either the prior dataset or a recoverable checkpoint.
- Never include credentials or tokens in backups; never log their values.

## Permissions and platform boundaries

- Request only Android permissions required for the specific feature and explain their purpose.
- GPS is event-scoped and limited to shift start/end, trip start/end, and ride cancellation. No continuous tracking or background location listener is allowed between events.
- Overlay permission is separate from GPS and must not gate location capture.
- Do not promise execution that Android, browser lifecycle, OEM battery policy, or scheduler cannot guarantee. Preserve durable pending work and explain deferral.
- Do not put secrets in WebView-visible configuration or client bundles.

## Compatibility and data evolution

- Version application contracts, persisted schemas, backup manifests, bridge payloads, and feature module contracts.
- Maintain an explicit supported migration path from each supported prior schema version.
- Test migration success, interruption, retry, integrity failure, and recovery using representative prior datasets.
- Unknown future versions must fail safely with source preservation; never downgrade by silently dropping unknown data.
- Use explicit UTC instants and business timezone/date context; financial values use integer minor units and explicit currency.
- Any correction to historical business facts is an auditable correction/reversal, not silent mutation.

## Acceptance checks

- Static scans detect secrets in source, bundles, fixtures, and logs.
- Network gateway tests prove disabled policy produces no app-initiated requests.
- Import/restore tests cover malformed files, checksum failures, unsupported versions, interruption, and checkpoint recovery.
- Permission tests verify least privilege and separate overlay/GPS behavior.
- Logs and crash reports contain no tokens or unnecessary personal/financial information.
