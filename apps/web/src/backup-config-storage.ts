export type DropboxBrowserConfig = {
  clientId?: string;
  redirectUri?: string;
};

/**
 * Non-secret Dropbox setup convenience settings only. Keep Web Storage access
 * inside this adapter; never persist vault secrets, tokens, or business records
 * through this configuration store.
 */
const CONFIG_KEY = "sam-travels.dropbox-config";

export function readDropboxBrowserConfig(): DropboxBrowserConfig {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "{}");
    if (!value || typeof value !== "object") return {};
    const config = value as Record<string, unknown>;
    return {
      ...(typeof config.clientId === "string" ? { clientId: config.clientId } : {}),
      ...(typeof config.redirectUri === "string" ? { redirectUri: config.redirectUri } : {}),
    };
  } catch {
    return {};
  }
}

export function writeDropboxBrowserConfig(config: DropboxBrowserConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Optional convenience settings must never block backup or restore.
  }
}
