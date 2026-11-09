import { useEffect, useState } from "react";
import {
  consumeNativeOAuthCallback,
  configureNativeBackgroundBackup,
  createAndUploadBackup,
  discardVerifiedRecoveryCheckpoint,
  listRecoveryCheckpoints,
  markRestoreVerified,
  restoreDropboxBackup,
  rollbackRecoveryCheckpoint,
  getSavedRecoveryKey,
} from "../backup-runtime";
import { createDropboxBackupSession, DROPBOX_CLIENT_ID, type DropboxBackupSession } from "../backup-service";
import { generateBackupRecoveryKey } from "../../../../packages/features/backup";

type BackupEntry = { name: string; path: string; serverModified: string; size: number };
type Checkpoint = { id: string; createdAt: string; status: string };

export function BackupPanel() {
  const [restoreSecret, setRestoreSecret] = useState("");
  const [portableRecoveryKey, setPortableRecoveryKey] = useState("");
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
    const handleCallback = (url: string) => {
      const params = new URL(url).searchParams;
      const code = params.get("code");
      const state = params.get("state");
      if (code && state) {
        setCallback({ code, state });
        setMessage("Dropbox authorization received. Finishing connection…");
      } else if (params.get("error")) {
        setMessage("Dropbox authorization was not completed: " + (params.get("error_description") || params.get("error")));
      }
    };
    const params = new URLSearchParams(window.location.search);
    if (params.has("code") || params.has("error")) {
      handleCallback(window.location.href);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    const consumeNativeCallback = () => {
      void consumeNativeOAuthCallback().then(url => { if (url) handleCallback(url); })
        .catch(error => setMessage(error instanceof Error ? error.message : "Could not read native Dropbox callback"));
    };
    const onVisibilityChange = () => { if (document.visibilityState === "visible") consumeNativeCallback(); };
    window.addEventListener("focus", consumeNativeCallback);
    document.addEventListener("visibilitychange", onVisibilityChange);
    consumeNativeCallback();
    void refreshCheckpoints();
    return () => {
      window.removeEventListener("focus", consumeNativeCallback);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  async function refreshCheckpoints() {
    try {
      setCheckpoints(await listRecoveryCheckpoints());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read recovery checkpoints");
    }
  }

  async function openSession(): Promise<DropboxBackupSession> {
    const next = await createDropboxBackupSession();
    setSession(next);
    if (next.native) await configureNativeBackgroundBackup(DROPBOX_CLIENT_ID, "samtravels://oauth");
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
      setMessage("Dropbox connected.");
      await refreshHistory(next);
    } catch (error) {
      setCallback(null);
      setMessage(error instanceof Error ? error.message : "Dropbox authorization failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (callback) void completeConnection();
    // completeConnection is stable for this callback state; callback changes drive this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callback]);

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
      const savedKey = session.native ? await getSavedRecoveryKey() : await session.vault.get("sam-travels.backup.recovery-key.v1");
      const key = savedKey || generateBackupRecoveryKey();
      if (!session.native) await session.vault.set("sam-travels.backup.recovery-key.v1", key);
      await createAndUploadBackup({
        applicationVersion: "0.1.0",
        recoveryKey: key,
        dropbox: session.client,
      });
      setMessage("Encrypted backup uploaded. This device securely retains its recovery key.");
      await refreshHistory(session);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Backup upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function revealRecoveryKey() {
    if (!session) return;
    try {
      const key = session.native ? await getSavedRecoveryKey() : await session.vault.get("sam-travels.backup.recovery-key.v1");
      if (!key) throw new Error("Create the first backup before exporting its recovery key.");
      setPortableRecoveryKey(key);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not read the saved recovery key");
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
      const localKey = session.native ? await getSavedRecoveryKey() : await session.vault.get("sam-travels.backup.recovery-key.v1");
      const chosenKey = restoreSecret.trim() || localKey;
      if (!chosenKey) throw new Error("A recovery key from the device that created this backup is required.");
      const secret = { recoveryKey: chosenKey };
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

  return (
    <section className="backup-panel">
      <div className="backup-heading">
        <div><small>RECOVERY AND BACKUP</small><h2>Protect this workspace</h2></div>
        <span className={session ? "pill good" : "pill"}>{session ? "CONNECTED" : "NOT CONNECTED"}</span>
      </div>
      <p className="backup-intro">Connect Dropbox once. Sam Travels handles secure sign-in and encrypted backups. Restore creates a local recovery checkpoint before replacing data.</p>
      <p className="backup-empty">Android uses best-effort daily background backup when Internet Access is enabled, Dropbox is connected, and a recovery key has been saved by the first successful backup. Android may defer work because of battery, connectivity, or device policy. In the PWA, create backups while the app is open; browser background scheduling is not reliable.</p>


      {callback ? (
        <p className="backup-empty">Completing Dropbox connection…</p>
      ) : !session ? (
        <button className="backup-primary" disabled={busy} onClick={connect}>Connect Dropbox</button>
      ) : (
        <div className="backup-actions">
          <button className="backup-secondary" disabled={busy} onClick={() => refreshHistory()}>Refresh history</button>
          <button className="backup-secondary" disabled={busy} onClick={disconnect}>Disconnect</button>
        </div>
      )}

      {session && (
        <>
          <div className="backup-divider" />
          <h3>Back up your workspace</h3>
          <p className="backup-empty">Your backup is encrypted before upload. This device keeps its recovery key in secure local storage. To restore on another device, enter the recovery key from the original device.</p>
          <button className="backup-primary" disabled={busy} onClick={createBackup}>Back up now</button>
          <button className="backup-secondary" disabled={busy} onClick={revealRecoveryKey}>Show recovery key for another device</button>
          {portableRecoveryKey && <div className="backup-recovery-key"><strong>Keep this key somewhere safe. Anyone with it can decrypt your backups.</strong><textarea readOnly value={portableRecoveryKey} rows={2} /><button className="backup-secondary" onClick={() => void navigator.clipboard.writeText(portableRecoveryKey)}>Copy recovery key</button></div>}

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
            <label>Recovery key (only needed when restoring on another device)<input type="password" value={restoreSecret} onChange={event => setRestoreSecret(event.target.value)} autoComplete="off" placeholder="Leave blank to use this device’s saved key" /></label>
          </div>
          <label className="backup-confirm"><input type="checkbox" checked={restoreConfirmed} onChange={event => setRestoreConfirmed(event.target.checked)} /> I understand restore replaces the current local workspace after a recovery checkpoint is created.</label>
          <button className="backup-danger" disabled={busy || !selectedPath || !restoreConfirmed} onClick={restoreBackup}>Restore selected backup</button>
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
