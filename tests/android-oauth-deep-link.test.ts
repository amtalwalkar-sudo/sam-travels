import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("native Dropbox OAuth callback registration", () => {
  it("registers the exact samtravels://oauth redirect as a browsable activity intent", () => {
    const manifest = readFileSync(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8");
    expect(manifest).toContain('android:scheme="samtravels"');
    expect(manifest).toContain('android:host="oauth"');
    expect(manifest).toContain('android:name="android.intent.action.VIEW"');
    expect(manifest).toContain('android:name="android.intent.category.BROWSABLE"');
  });

  it("persists callbacks on cold and warm activity launches and exposes one-time consumption", () => {
    const activity = readFileSync(new URL("../android/app/src/main/java/in/samtravels/app/MainActivity.kt", import.meta.url), "utf8");
    const plugin = readFileSync(new URL("../android/app/src/main/java/in/samtravels/app/BackupPlugin.kt", import.meta.url), "utf8");
    expect(activity).toContain("persistDropboxCallback(intent)");
    expect(activity).toContain("override fun onNewIntent(intent: Intent)");
    expect(activity).toContain('putString("pending_callback_url", uri.toString())');
    expect(plugin).toContain("fun consumeOAuthCallback(call: PluginCall)");
    expect(plugin).toContain('remove("pending_callback_url")');
  });
});
