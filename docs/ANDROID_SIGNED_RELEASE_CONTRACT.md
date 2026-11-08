# Android signed release and update contract

## Release identity

- Android application ID is permanently `in.samtravels.app`. Changing it creates a different Android app and prevents in-place updates.
- Every distributed APK must be signed with the same long-lived release keystore and key alias.
- The release keystore is owner-controlled and must never be committed to the repository, uploaded as an artifact, or pasted into chat.
- GitHub Actions stores the keystore and passwords as Actions secrets. The workflow writes the keystore only to the ephemeral runner's temporary directory.
- The first signed distribution starts at versionCode 2 and versionName 0.2.0. Every subsequent distributed build must use a strictly greater versionCode. Never reuse or decrease a distributed versionCode.
- Keep at least two secure offline backups of the keystore and its passwords. Loss of the signing key can permanently prevent updates to already-installed copies.

## One-time owner setup

Generate a private release key on a trusted computer. Do not generate it on a CI runner:

```bash
keytool -genkeypair -v -keystore sam-travels-release.jks -alias sam-travels -keyalg RSA -keysize 2048 -validity 10000
```

Use a strong unique keystore password and key password. Keep the keystore and both passwords in secure offline backups.

Encode the keystore as one base64 line:

- macOS: `base64 < sam-travels-release.jks | tr -d '\\n' > sam-travels-release.jks.base64`
- Linux: `base64 -w 0 sam-travels-release.jks > sam-travels-release.jks.base64`

In GitHub repository Settings → Secrets and variables → Actions, create these **repository secrets**:

| Secret | Value |
|---|---|
| `ANDROID_RELEASE_KEYSTORE_BASE64` | Complete contents of the base64 file |
| `ANDROID_RELEASE_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_RELEASE_KEY_ALIAS` | `sam-travels` |
| `ANDROID_RELEASE_KEY_PASSWORD` | Key password |

Never put these values in workflow YAML, repository variables, issues, pull requests, or chat. Delete the temporary base64 file after the secrets have been saved, once offline backups are confirmed.

## Building a release

After the four secrets are configured:

1. Open Actions → Signed Android release → Run workflow.
2. Use versionCode `2` and versionName `0.2.0` for the first distribution.
3. Download the `sam-travels-signed-release-...` artifact.
4. Install the APK normally. Future releases use the same signing key and a higher versionCode, allowing Android to update the app in place while retaining app data.

The workflow verifies the APK signature, application ID, versionCode, and versionName before publishing the artifact. A green build does not replace real-device installation/update testing.

## CI behavior

The regular pull-request and main CI workflow remains independent of release secrets. It may build an unsigned release variant for compilation checks, but that artifact is not for installation. Only the dedicated signed-release workflow publishes the installable release APK.
