import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { browserDatabase } from "../packages/storage-browser/src/database";
import { BrowserCredentialVault } from "../apps/web/src/browser-secure-vault";

describe("browser credential vault", () => {
  beforeEach(async () => {
    await browserDatabase.delete();
    await browserDatabase.open();
  });

  it("encrypts credentials at rest and requires the vault passphrase after restart", async () => {
    const vault = new BrowserCredentialVault();
    await vault.unlock("correct horse battery");
    await vault.set("dropbox.oauth.tokens.v1", JSON.stringify({ refreshToken: "secret-refresh-token" }));
    const stored = await browserDatabase.table("credentialVault").get("dropbox.oauth.tokens.v1");
    expect(JSON.stringify(stored)).not.toContain("secret-refresh-token");
    vault.lock();
    await expect(vault.get("dropbox.oauth.tokens.v1")).rejects.toThrow("credential_vault_locked");

    const reopened = new BrowserCredentialVault();
    await expect(reopened.unlock("wrong passphrase")).rejects.toThrow("credential_vault_unlock_failed");
    await reopened.unlock("correct horse battery");
    expect(await reopened.get("dropbox.oauth.tokens.v1")).toContain("secret-refresh-token");
  });

  it("allows local credential removal while the vault is locked", async () => {
    const vault = new BrowserCredentialVault();
    await vault.unlock("correct horse battery");
    await vault.set("token", "sensitive");
    vault.lock();
    await vault.remove("token");
    expect(await browserDatabase.table("credentialVault").get("token")).toBeUndefined();
  });
});
