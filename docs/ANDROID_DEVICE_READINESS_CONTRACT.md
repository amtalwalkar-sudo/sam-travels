# Android Device Readiness Contract

## Purpose
The installed Android app performs a compact readiness check at launch and resume. When an essential prerequisite is missing, one dismissible pop-up identifies it. Tapping a row opens the most specific Android settings destination supported by the current device; returning to the app triggers a fresh verification.

## Platform-independent design
- Use Android platform APIs and settings actions as the primary compatibility layer.
- Do not hard-code MIUI, HyperOS, Samsung One UI, or other manufacturer settings menu paths as the primary implementation.
- Check Android version and actual capabilities/permission state, not model names, to determine which checks apply.
- Detect manufacturer/model for support context only. OEM-specific battery/autostart settings are not consistently exposed through public Android APIs; never claim they were verified.
- If a preferred settings activity is unavailable, fall back to the app's Android application-details page, then the general Android Settings page.
- Treat successful navigation as an attempt only. Recheck the actual permission/state after the app resumes.

## Readiness items
Essential for event-based driver location:
- Device location services enabled.
- Fine/precise location permission granted.

Optional capabilities/reliability:
- Display-over-other-apps permission for optional floating driver controls. Overlay access must never gate normal GPS capture.
- Background location is shown only when the floating overlay has been enabled and the Android version requires it for supported recovery scenarios.
- Notification permission is shown on Android 13+ when the floating foreground service is enabled.
- Battery optimization status is advisory when the floating foreground service is enabled. Do not universally block the app or request exemption without user action.

## Interaction
- Check at Android app startup and on return/resume.
- Automatically open the pop-up only for missing essential prerequisites; optional settings remain reviewable in the same pop-up.
- Each missing row opens its corresponding Android settings destination with a safe fallback.
- Recheck after returning. Close the automatic setup pop-up when essential prerequisites are satisfied.
- The driver may dismiss the pop-up and continue in limited mode. Existing records and navigation remain accessible.
- Never interpret opening a settings page as proof that a setting was enabled.
- Do not introduce continuous GPS or request background location solely for startup readiness.

## Acceptance
- Android emulator CI verifies the native bridge compiles and the application builds.
- Instrumented tests cover readiness policy decisions and API-level applicability.
- Physical device acceptance remains a separate deferred gate across Xiaomi/Redmi, Samsung, Pixel, and other OEM/Android combinations. Emulator CI does not prove OEM settings navigation or battery behavior.
