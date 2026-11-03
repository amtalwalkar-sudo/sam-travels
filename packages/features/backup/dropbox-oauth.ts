import type { CredentialVault } from "../../core/src/credentials";
import type { PolicyRepository } from "../../core/src/repositories";
import { NetworkGateway } from "../../core/src/network";
import type { BackupPackage } from "./crypto";

const TOKEN_ENDPOINT = "https://api.dropboxapi.com/oauth2/token";
const API_ENDPOINT = "https://api.dropboxapi.com/2";
const CONTENT_ENDPOINT = "https://content.dropboxapi.com/2";
const TOKEN_KEY = "dropbox.oauth.tokens.v1";
const PENDING_KEY = "dropbox.oauth.pending.v1";
const SCOPES = ["files.metadata.read", "files.content.read", "files.content.write"];

type TokenSet = { accessToken: string; refreshToken: string; expiresAt: number };
type PendingAuthorization = { state: string; verifier: string };
type DropboxTokenResponse = { access_token: string; refresh_token?: string; expires_in: number; token_type: string };
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function base64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function randomToken(length = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}
async function challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}
async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error("dropbox_http_" + response.status);
  return response.json() as Promise<T>;
}

/**
 * Dropbox OAuth PKCE + encrypted-backup transport. All HTTP requests are
 * enclosed by NetworkGateway. The app key and redirect URI are runtime config,
 * never embedded credentials; Dropbox refresh/access tokens stay in CredentialVault.
 */
export class DropboxBackupClient {
  private readonly gateway: NetworkGateway;
  constructor(
    policy: PolicyRepository,
    private readonly vault: CredentialVault,
    private readonly clientId: string,
    private readonly redirectUri: string,
    private readonly fetcher: Fetcher = fetch,
  ) {
    this.gateway = new NetworkGateway(policy);
    if (!clientId.trim() || !redirectUri.trim()) throw new Error("dropbox_oauth_configuration_required");
  }

  async beginAuthorization(): Promise<string> {
    return this.gateway.run(async () => {
      const state = randomToken();
      const verifier = randomToken(48);
      await this.vault.set(PENDING_KEY, JSON.stringify({ state, verifier } satisfies PendingAuthorization));
      const url = new URL("https://www.dropbox.com/oauth2/authorize");
      url.searchParams.set("client_id", this.clientId);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("token_access_type", "offline");
      url.searchParams.set("code_challenge", await challenge(verifier));
      url.searchParams.set("code_challenge_method", "S256");
      url.searchParams.set("redirect_uri", this.redirectUri);
      url.searchParams.set("state", state);
      url.searchParams.set("scope", SCOPES.join(" "));
      return url.toString();
    });
  }

  async completeAuthorization(code: string, returnedState: string): Promise<void> {
    await this.gateway.run(async () => {
      const pendingText = await this.vault.get(PENDING_KEY);
      if (!pendingText) throw new Error("dropbox_oauth_state_missing");
      const pending = JSON.parse(pendingText) as PendingAuthorization;
      if (!returnedState || returnedState !== pending.state) throw new Error("dropbox_oauth_state_mismatch");
      const form = new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: this.clientId,
        redirect_uri: this.redirectUri,
        code_verifier: pending.verifier,
      });
      const response = await this.fetcher(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form,
      });
      const tokens = await responseJson<DropboxTokenResponse>(response);
      if (tokens.token_type.toLowerCase() !== "bearer" || !tokens.refresh_token || !tokens.access_token) {
        throw new Error("dropbox_oauth_invalid_token_response");
      }
      await this.saveTokens(tokens);
      await this.vault.remove(PENDING_KEY);
    });
  }

  private async saveTokens(tokens: DropboxTokenResponse, prior?: TokenSet): Promise<TokenSet> {
    const next: TokenSet = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? prior?.refreshToken ?? "",
      expiresAt: Date.now() + Math.max(0, tokens.expires_in) * 1000,
    };
    if (!next.refreshToken) throw new Error("dropbox_refresh_token_missing");
    await this.vault.set(TOKEN_KEY, JSON.stringify(next));
    return next;
  }

  private async accessToken(): Promise<string> {
    const stored = await this.vault.get(TOKEN_KEY);
    if (!stored) throw new Error("dropbox_authentication_required");
    const tokens = JSON.parse(stored) as TokenSet;
    if (tokens.accessToken && tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;
    if (!tokens.refreshToken) throw new Error("dropbox_reauthentication_required");
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken,
      client_id: this.clientId,
    });
    const response = await this.fetcher(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const refreshed = await responseJson<DropboxTokenResponse>(response);
    return (await this.saveTokens(refreshed, tokens)).accessToken;
  }

  async isConnected(): Promise<boolean> {
    return Boolean(await this.vault.get(TOKEN_KEY));
  }

  async disconnect(): Promise<{ revoked: boolean }> {
    // Always remove local credentials, even offline or while Internet Access is disabled.
    const stored = await this.vault.get(TOKEN_KEY);
    let revoked = false;
    if (stored) {
      try {
        await this.gateway.run(async () => {
          const token = await this.accessToken();
          const response = await this.fetcher(API_ENDPOINT + "/auth/token/revoke", {
            method: "POST",
            headers: { authorization: "Bearer " + token },
          });
          if (!response.ok) throw new Error("dropbox_revoke_http_" + response.status);
          revoked = true;
        });
      } catch {
        // Local sign-out still succeeds; the caller can report that remote revocation was deferred.
      }
    }
    await this.vault.remove(TOKEN_KEY);
    await this.vault.remove(PENDING_KEY);
    return { revoked };
  }

  private async ensureBackupFolder(token: string): Promise<void> {
    const response = await this.fetcher(API_ENDPOINT + "/files/create_folder_v2", {
      method: "POST",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ path: "/SamTravelsBackups", autorename: false }),
    });
    if (!response.ok && response.status !== 409) throw new Error("dropbox_folder_create_http_" + response.status);
  }

  async uploadEncryptedBackup(pkg: BackupPackage, filename: string): Promise<void> {
    if (!/^[A-Za-z0-9._-]{1,120}\.stbackup$/.test(filename)) throw new Error("dropbox_backup_filename_invalid");
    await this.gateway.run(async () => {
      const token = await this.accessToken();
      await this.ensureBackupFolder(token);
      const response = await this.fetcher(CONTENT_ENDPOINT + "/files/upload", {
        method: "POST",
        headers: {
          authorization: "Bearer " + token,
          "content-type": "application/octet-stream",
          "Dropbox-API-Arg": JSON.stringify({ path: "/SamTravelsBackups/" + filename, mode: "add", autorename: true, mute: true }),
        },
        body: JSON.stringify(pkg),
      });
      if (!response.ok) throw new Error("dropbox_upload_http_" + response.status);
    });
  }

  async downloadBackup(path: string): Promise<Uint8Array> {
    if (!path.startsWith("/SamTravelsBackups/") || path.includes("..")) throw new Error("dropbox_backup_path_invalid");
    return this.gateway.run(async () => {
      const token = await this.accessToken();
      const response = await this.fetcher(CONTENT_ENDPOINT + "/files/download", {
        method: "POST",
        headers: {
          authorization: "Bearer " + token,
          "Dropbox-API-Arg": JSON.stringify({ path }),
        },
      });
      if (!response.ok) throw new Error("dropbox_download_http_" + response.status);
      return new Uint8Array(await response.arrayBuffer());
    });
  }

  async listBackups(): Promise<Array<{ name: string; path: string; serverModified: string; size: number }>> {
    return this.gateway.run(async () => {
      const token = await this.accessToken();
      await this.ensureBackupFolder(token);
      let url = API_ENDPOINT + "/files/list_folder";
      let body: Record<string, unknown> = { path: "/SamTravelsBackups", recursive: false, include_deleted: false };
      const entries: Array<{ name: string; path_display: string; server_modified: string; size: number; ".tag": string }> = [];
      while (true) {
        const response = await this.fetcher(url, {
          method: "POST",
          headers: { authorization: "Bearer " + token, "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const page = await responseJson<{
          entries: Array<{ name: string; path_display: string; server_modified: string; size: number; ".tag": string }>;
          has_more: boolean;
          cursor: string;
        }>(response);
        entries.push(...page.entries);
        if (!page.has_more) break;
        url = API_ENDPOINT + "/files/list_folder/continue";
        body = { cursor: page.cursor };
      }
      return entries.filter(entry => entry[".tag"] === "file" && entry.name.endsWith(".stbackup"))
        .map(entry => ({ name: entry.name, path: entry.path_display, serverModified: entry.server_modified, size: entry.size }))
        .sort((left, right) => right.serverModified.localeCompare(left.serverModified));
    });
  }


  async applyRetention(maximumBackups: number, protectedPaths: string[] = []): Promise<string[]> {
    if (!Number.isSafeInteger(maximumBackups) || maximumBackups < 1) throw new Error("dropbox_retention_limit_invalid");
    const backups = await this.listBackups();
    const protectedSet = new Set(protectedPaths);
    const retained = new Set(backups.slice(0, maximumBackups).map(item => item.path));
    for (const path of protectedSet) retained.add(path);
    const deleted: string[] = [];
    for (const backup of backups) {
      if (!retained.has(backup.path)) {
        await this.deleteBackup(backup.path);
        deleted.push(backup.path);
      }
    }
    return deleted;
  }

  async deleteBackup(path: string): Promise<void> {
    if (!path.startsWith("/SamTravelsBackups/") || path.includes("..")) throw new Error("dropbox_backup_path_invalid");
    await this.gateway.run(async () => {
      const token = await this.accessToken();
      const response = await this.fetcher(API_ENDPOINT + "/files/delete_v2", {
        method: "POST",
        headers: { authorization: "Bearer " + token, "content-type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!response.ok) throw new Error("dropbox_delete_http_" + response.status);
    });
  }
}
