import { useEffect, useState } from "react";
import {
  consumeNativeOAuthCallback,
  createAndUploadBackup,
  discardVerifiedRecoveryCheckpoint,
  listRecoveryCheckpoints,
  markRestoreVerified,
  restoreDropboxBackup,
  rollbackRecoveryCheckpoint,
} from "../backup-runtime";
import { createDropboxBackupSession, defaultDropboxRedirectUri, type DropboxBackupSession } from "../backup-service";

type BackupEntry = { name: string; path: string; serverModified: string; size: number };
type Checkpoint = { id: string; createdAt: string; status: string };

export function BackupPanel() {
  const [clientId, setClientId] = useState(() => {
    const fallback = import.meta.env.VITE_DROPBOX_CLIENT_ID ?? "";
    try { return JSON.parse(localStorage.getItem("sam-travels.dropbox-config") ?? "{}").clientId ?? fallback; } catch { return fallback; }
  });
  const [redirectUri, setRedirectUri] = useState(() => {
    const fallback = import.meta.env.VITE_DROPBOX_REDIRECT_URI ?? defaultDropboxRedirectUri();
    try { return JSON.parse(localStorage.getItem("sam-travels.dropbox-config") ?? "{}").redirectUri ?? fallback; } catch { return fallback; }
  });
  const [vaultPassphrase, setVaultPassphrase] = useState("");
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [restoreSecret, setRestoreSecret] = useState("");
  const [restoreSecretType, setRestoreSecretType] = useState<"passphrase" | "recoveryKey">("passphrase");
  const [session, setSession] = useState<DropboxBackupSession | null>(null);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const [retentionLimit, setRetentionLimit] = useState("7");
  const [callback, setCallback] = useState<{ code: string; state: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try { localStorage.setItem("sam-travels.dropbox-config", JSON.stringify({ clientId, redirectUri })); } catch { /* optional non-secret convenience only */ }
  }, [clientId, redirectUri]);

  useEffect(() => {
    const handleCallback = (url: string) => {
      const params = new URL(url).searchParams;
      const code = params.get("code");
      const state = params.get("state");
      if (code && state) {
        setCallback({ code, state });
        setMessage("Dropbox returned an authorization code. Unlock the vault and finish connecting.");
      } else if (params.get("error")) {
        setMessage("Dropbox authorization was not completed: " + (params.get("error_description") || params.get("error")));
      }
    };
    const params = new URLSearchParams(window.location.search);
    if (params.has("code") || params.has("error")) {
      handleCallback(window.location.href);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    void consumeNativeOAuthCallback().then(url => { if (url) handleCallback(url); })
      .catch(error => setMessage(error instanceof Error ? error.message : "Could not read native Dropbox callback"));
    void refreshCheckpoints();
  }, []);

  async function refreshCheckpoints() {
    try {
      setCheckpoints(await listRecoveryCheckpoints());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read recovery checkpoints");
    }
  }

  async function openSession(): Promise<DropboxBackupSession> {
    if (!clientId.trim() || !redirectUri.trim()) throw new Error("Enter the Dropbox app key and registered redirect URI first.");
    const next = await createDropboxBackupSession({
      clientId: clientId.trim(),
      redirectUri: redirectUri.trim(),
      browserVaultPassphrase: vaultPassphrase || undefined,
    });
    setSession(next);
    setVaultPassphrase("");
    return next;
  }

  async function connect() {
    setBusy(true);
    try {
      const next = await openSession();
      if (await next.client.isConnected()) {
        await refreshHistory(next);
        return;
      }
      const url = await next.client.beginAuthorization();
      window.location.assign(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start Dropbox authorization");
      setBusy(false);
    }
  }

  async function completeConnection() {
    if (!callback) return;
    setBusy(true);
    try {
      const next = await openSession();
      await next.client.completeAuthorization(callback.code, callback.state);
      setCallback(null);
      setMessage("Dropbox connected. Refresh the backup history to continue.");
      await refreshHistory(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Dropbox authorization failed");
    } finally {
      setBusy(false);
    }
  }

  async function refreshHistory(current = session) {
    if (!current) return;
    setBusy(true);
    try {
      const entries = await current.client.listBackups();
      setBackups(entries);
      setSelectedPath(entries[0]?.path ?? "");
      setMessage(entries.length ? "Backup history refreshed." : "Dropbox is connected; no backup files exist yet.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Dropbox backup history");
    } finally {
      setBusy(false);
    }
  }

  async function createBackup() {
    if (!session) return;
    setBusy(true);
    try {
      const result = await createAndUploadBackup({
        applicationVersion: "0.1.0",
        passphrase: backupPassphrase,
        recoveryKey: recoveryKey.trim() || undefined,
        dropbox: session.client,
      });
      setRecoveryKey(result.recoveryKey);
      setBackupPassphrase("");
      setMessage("Encrypted backup uploaded. Copy and save the recovery key somewhere outside this app.");
      await refreshHistory(session);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Backup upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function applyRetention() {
    if (!session) return;
    const limit = Number(retentionLimit);
    if (!Number.isSafeInteger(limit) || limit < 1) {
      setMessage("Keep at least one backup.");
      return;
    }
    setBusy(true);
    try {
      const deleted = await session.client.applyRetention(limit, selectedPath ? [selectedPath] : []);
      setMessage("Retention applied. " + deleted.length + " older backup(s) removed; the selected backup was protected.");
      await refreshHistory(session);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not apply backup retention");
    } finally {
      setBusy(false);
    }
  }

  async function restoreBackup() {
    if (!session || !selectedPath || !restoreConfirmed) return;
    setBusy(true);
    try {
      const secret = restoreSecretType === "passphrase"
        ? { passphrase: restoreSecret }
        : { recoveryKey: restoreSecret };
      const result = await restoreDropboxBackup({
        path: selectedPath,
        secret,
        confirmed: true,
        dropbox: session.client,
      });
      setMessage("Restore completed. Inspect the workspace, then verify recovery checkpoint " + result.checkpointId + " is retained until you verify the workspace.");
      setRestoreSecret("");
      setRestoreConfirmed(false);
      await refreshCheckpoints();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Restore failed");
      await refreshCheckpoints();
    } finally {
      setBusy(false);
    }
  }

  async function verifyAndDiscard(checkpointId: string) {
    setBusy(true);
    try {
      await markRestoreVerified(checkpointId);
      await discardVerifiedRecoveryCheckpoint(checkpointId);
      setMessage("Restore checkpoint marked verified and discarded.");
      await refreshCheckpoints();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkpoint verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function discardCheckpoint(checkpointId: string) {
    setBusy(true);
    try {
      await discardVerifiedRecoveryCheckpoint(checkpointId);
      setMessage("Verified recovery checkpoint discarded.");
      await refreshCheckpoints();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not discard checkpoint");
    } finally {
      setBusy(false);
    }
  }

  async function rollback(checkpointId: string) {
    setBusy(true);
    try {
      await rollbackRecoveryCheckpoint(checkpointId);
      setMessage("Previous local data restored from the recovery checkpoint.");
      await refreshCheckpoints();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkpoint rollback failed");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!session) return;
    setBusy(true);
    try {
      const result = await session.client.disconnect();
      session.lock();
      setSession(null);
      setVaultPassphrase("");
      setBackupPassphrase("");
      setBackups([]);
      setMessage(result.revoked
        ? "Dropbox disconnected and the remote token revoked."
        : "Local Dropbox credentials cleared. Remote revocation was unavailable while offline or disabled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not disconnect Dropbox");
    } finally {
      setBusy(false);
    }
  }

  function lockVault() {
    session?.lock();
    setSession(null);
    setVaultPassphrase("");
    setBackupPassphrase("");
    setBackups([]);
    setMessage("Credential vault locked. Unlock it again before Dropbox operations.");
  }

  return (
    <section className="backup-panel">
      <div className="backup-heading">
        <div><small>RECOVERY AND BACKUP</small><h2>Protect this workspace</h2></div>
        <span className={session ? "pill good" : "pill"}>{session ? "CONNECTED" : "NOT CONNECTED"}</span>
      </div>
      <p className="backup-intro">Backups are encrypted on this device before upload. Restore creates a local recovery checkpoint before replacing data.</p>

      <div className="backup-config">
        <label>Dropbox app key<input value={clientId} onChange={event => setClientId(event.target.value)} autoComplete="off" placeholder="Dropbox app key" /></label>
        <label>Registered redirect URI<input value={redirectUri} onChange={event => setRedirectUri(event.target.value)} autoComplete="url" placeholder="https://your-app.example/backup" /></label>
        <label>Browser vault passphrase (leave blank on Android)<input type="password" value={vaultPassphrase} onChange={event => setVaultPassphrase(event.target.value)} autoComplete="current-password" placeholder="At least 12 characters for browser vault" /></label>
      </div>

      {callback ? (
        <button className="backup-primary" disabled={busy} onClick={completeConnection}>Finish Dropbox connection</button>
      ) : !session ? (
        <button className="backup-primary" disabled={busy} onClick={connect}>Unlock / connect Dropbox</button>
      ) : (
        <div className="backup-actions">
          <button className="backup-secondary" disabled={busy} onClick={() => refreshHistory()}>Refresh history</button>
          {!session.native && <button className="backup-secondary" disabled={busy} onClick={lockVault}>Lock vault</button>}
          <button className="backup-secondary" disabled={busy} onClick={disconnect}>Disconnect</button>
        </div>
      )}

      {session && (
        <>
          <div className="backup-divider" />
          <h3>Create encrypted backup</h3>
          <div className="backup-config">
            <label>Backup passphrase<input type="password" value={backupPassphrase} onChange={event => setBackupPassphrase(event.target.value)} autoComplete="new-password" placeholder="At least 12 characters" /></label>
            <label>Existing recovery key (leave blank only for first backup)<input value={recoveryKey} onChange={event => setRecoveryKey(event.target.value)} autoComplete="off" placeholder="Paste the recovery key to reuse it" /></label>
          </div>
          <button className="backup-primary" disabled={busy || backupPassphrase.length < 12} onClick={createBackup}>Create and upload backup</button>
          {recoveryKey && <div className="backup-recovery-key"><strong>Save this recovery key outside the app</strong><textarea readOnly value={recoveryKey} rows={2} /><button className="backup-secondary" onClick={() => void navigator.clipboard.writeText(recoveryKey)}>Copy recovery key</button></div>}

          <div className="backup-divider" />
          <div className="backup-subheading"><h3>Dropbox backup history</h3><span>{backups.length} files</span></div>
          {backups.length === 0 ? <p className="backup-empty">No backup files found yet.</p> : (
            <select className="backup-select" value={selectedPath} onChange={event => setSelectedPath(event.target.value)}>
              {backups.map(item => <option key={item.path} value={item.path}>{item.name} · {new Date(item.serverModified).toLocaleString()}</option>)}
            </select>
          )}
          <div className="backup-retention">
            <label>Keep newest backups<input type="number" min="1" max="365" value={retentionLimit} onChange={event => setRetentionLimit(event.target.value)} /></label>
            <button className="backup-secondary" disabled={busy || backups.length === 0} onClick={applyRetention}>Apply retention</button>
          </div>
          <div className="backup-config">
            <label>Restore secret type<select value={restoreSecretType} onChange={event => setRestoreSecretType(event.target.value as "passphrase" | "recoveryKey")}><option value="passphrase">Backup passphrase</option><option value="recoveryKey">Recovery key</option></select></label>
            <label>Restore secret<input type="password" value={restoreSecret} onChange={event => setRestoreSecret(event.target.value)} autoComplete="off" placeholder="Enter passphrase or recovery key" /></label>
          </div>
          <label className="backup-confirm"><input type="checkbox" checked={restoreConfirmed} onChange={event => setRestoreConfirmed(event.target.checked)} /> I understand restore replaces the current local workspace after a recovery checkpoint is created.</label>
          <button className="backup-danger" disabled={busy || !selectedPath || !restoreSecret || !restoreConfirmed} onClick={restoreBackup}>Restore selected backup</button>
        </>
      )}

      <div className="backup-divider" />
      <div className="backup-subheading"><h3>Local recovery checkpoints</h3><button className="backup-secondary" disabled={busy} onClick={refreshCheckpoints}>Refresh</button></div>
      {checkpoints.length === 0 ? <p className="backup-empty">No pending recovery checkpoints.</p> : checkpoints.map(checkpoint => (
        <div className="backup-checkpoint" key={checkpoint.id}>
          <div><strong>{checkpoint.status.replaceAll("_", " ")}</strong><small>{new Date(checkpoint.createdAt).toLocaleString()}</small></div>
          {(checkpoint.status === "restored_unverified" || checkpoint.status === "checkpoint" || checkpoint.status === "rollback_complete" || checkpoint.status === "verified") && (
            <div className="backup-actions">
              {checkpoint.status === "restored_unverified" && <button className="backup-secondary" disabled={busy} onClick={() => verifyAndDiscard(checkpoint.id)}>Verify and discard checkpoint</button>}{checkpoint.status === "verified" && <button className="backup-secondary" disabled={busy} onClick={() => discardCheckpoint(checkpoint.id)}>Discard verified checkpoint</button>}
              {checkpoint.status !== "verified" && <button className="backup-secondary" disabled={busy} onClick={() => rollback(checkpoint.id)}>Roll back</button>}
            </div>
          )}
        </div>
      ))}
      <p className="backup-message" aria-live="polite">{message}</p>
    </section>
  );
}
