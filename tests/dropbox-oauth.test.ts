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

  it("allows local disconnect while offline without making an OAuth request", async () => {
    const vault = new MemoryVault();
    vault.values.set("dropbox.oauth.tokens.v1", JSON.stringify({ accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + 60_000 }));
    const fetcher = vi.fn();
    const client = new DropboxBackupClient(new MemoryPolicy(), vault, "test-client", "samtravels://oauth", fetcher);
    const result = await client.disconnect();
    expect(result.revoked).toBe(false);
    expect(await client.isConnected()).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("validates OAuth state and stores the refresh token in the secure vault", async () => {
    const policy = new MemoryPolicy();
    policy.enabled = true;
    const vault = new MemoryVault();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      access_token: "access",
      refresh_token: "refresh",
      expires_in: 3600,
      token_type: "bearer",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = new DropboxBackupClient(policy, vault, "test-client", "samtravels://oauth", fetcher);
    const authorization = new URL(await client.beginAuthorization());
    const state = authorization.searchParams.get("state")!;
    await expect(client.completeAuthorization("code", "wrong-state")).rejects.toThrow("dropbox_oauth_state_mismatch");
    expect(fetcher).not.toHaveBeenCalled();
    await client.completeAuthorization("code", state);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await client.isConnected()).toBe(true);
    expect(vault.values.has("dropbox.oauth.tokens.v1")).toBe(true);
    expect(vault.values.has("dropbox.oauth.pending.v1")).toBe(false);
  });

  it("refreshes expired access tokens before listing and paginates history", async () => {
    const policy = new MemoryPolicy();
    policy.enabled = true;
    const vault = new MemoryVault();
    vault.values.set("dropbox.oauth.tokens.v1", JSON.stringify({
      accessToken: "expired",
      refreshToken: "refresh",
      expiresAt: 0,
    }));
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "fresh", expires_in: 3600, token_type: "bearer" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ entries: [], has_more: true, cursor: "next" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ entries: [{ ".tag": "file", name: "backup.stbackup", path_display: "/SamTravelsBackups/backup.stbackup", server_modified: "2026-11-04T00:00:00Z", size: 100 }], has_more: false, cursor: "done" }), { status: 200 }));
    const client = new DropboxBackupClient(policy, vault, "test-client", "samtravels://oauth", fetcher);
    const backups = await client.listBackups();
    expect(backups).toHaveLength(1);
    expect(backups[0].name).toBe("backup.stbackup");
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.dropboxapi.com/oauth2/token");
    expect(vault.values.get("dropbox.oauth.tokens.v1")).toContain("fresh");
  });

  it("retries transient Dropbox failures and preserves the selected known-good backup during retention", async () => {
    const policy = new MemoryPolicy();
    policy.enabled = true;
    const vault = new MemoryVault();
    vault.values.set("dropbox.oauth.tokens.v1", JSON.stringify({
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: Date.now() + 3_600_000,
    }));
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("exists", { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        entries: [
          { ".tag": "file", name: "old.stbackup", path_display: "/SamTravelsBackups/old.stbackup", server_modified: "2026-11-01T00:00:00Z", size: 100 },
          { ".tag": "file", name: "keep.stbackup", path_display: "/SamTravelsBackups/keep.stbackup", server_modified: "2026-11-02T00:00:00Z", size: 100 },
          { ".tag": "file", name: "newest.stbackup", path_display: "/SamTravelsBackups/newest.stbackup", server_modified: "2026-11-03T00:00:00Z", size: 100 },
        ],
        has_more: false,
        cursor: "done",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const client = new DropboxBackupClient(policy, vault, "test-client", "samtravels://oauth", fetcher);
    const deleted = await client.applyRetention(1, ["/SamTravelsBackups/keep.stbackup"]);
    expect(deleted).toEqual(["/SamTravelsBackups/old.stbackup"]);
    expect(fetcher).toHaveBeenCalledTimes(4);
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
