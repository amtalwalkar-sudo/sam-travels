import { describe, expect, it, vi } from "vitest";
import { DropboxBackupClient } from "../packages/features/backup";
import type { CredentialVault } from "../packages/core/src/credentials";
import type { PolicyRepository } from "../packages/core/src/repositories";

class MemoryVault implements CredentialVault {
  values = new Map<string, string>();
  async get(name: string) { return this.values.get(name); }
  async set(name: string, value: string) { this.values.set(name, value); }
  async remove(name: string) { this.values.delete(name); }
}
class MemoryPolicy implements PolicyRepository {
  enabled = false;
  async getNetworkEnabled() { return this.enabled; }
  async setNetworkEnabled(value: boolean) { this.enabled = value; }
}

describe("Dropbox OAuth gateway boundary", () => {
  it("does not initiate OAuth or make a request while Internet Access is disabled", async () => {
    const fetcher = vi.fn();
    const client = new DropboxBackupClient(new MemoryPolicy(), new MemoryVault(), "test-client", "samtravels://oauth", fetcher);
    await expect(client.beginAuthorization()).rejects.toThrow("Internet Access is disabled");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("creates a PKCE authorization request only after policy is enabled", async () => {
    const policy = new MemoryPolicy();
    policy.enabled = true;
    const client = new DropboxBackupClient(policy, new MemoryVault(), "test-client", "samtravels://oauth", vi.fn());
    const authorization = new URL(await client.beginAuthorization());
    expect(authorization.origin).toBe("https://www.dropbox.com");
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorization.searchParams.get("token_access_type")).toBe("offline");
    expect(authorization.searchParams.get("scope")).toContain("files.content.write");
  });
});
