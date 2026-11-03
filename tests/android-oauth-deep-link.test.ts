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
});
