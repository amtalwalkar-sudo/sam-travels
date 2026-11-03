import { nativeOverlayAvailable } from "../driver-workflow";
import { BackupPanel } from "./BackupPanel";
import { useDriverWorkspace } from "./use-driver-workspace";

export function App() {
  const workspace = useDriverWorkspace();
  const {
    repo, enabled, error, ready, driver, pending, driverBusy,
    overlayMessage, driverMessage, shiftOn, tripOn, localClock, elapsed,
  } = workspace;
  const { enableOverlay, disableOverlay, retry, toggleNetwork, dispatch } = workspace.actions;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">ST</div>
          <div><strong>Sam Travels</strong><span>Driver workspace</span></div>
        </div>
        <button className={enabled ? "network enabled" : "network"} onClick={toggleNetwork} disabled={!repo} aria-pressed={enabled}>
          <i />Internet {enabled ? "On" : "Off"}
        </button>
      </header>

      <section className="welcome">
        <small>SINGLE-DRIVER WORKSPACE</small>
        <h1>Your workday,<br /><em>clearly organised.</em></h1>
        <p>A dependable home for your shift, trips and driver activity.</p>
      </section>

      <section className="status-card">
        <div className="status-heading">
          <div><small>FOUNDATION STATUS</small><h2>{ready ? "Local workspace ready" : "Opening local workspace…"}</h2></div>
          <span className={ready && !error ? "pill good" : "pill"}>{ready && !error ? "LOCAL" : "STARTING"}</span>
        </div>
        <p>{error || "Your records stay on this device. Internet access is optional and starts disabled."}</p>
        <div className="status-foot">
          <span>● Offline-first storage</span><span>{repo ? "Persistence connected" : "Connecting storage"}</span>
        </div>
      </section>

      <section className="driver-card">
        <div className="driver-head">
          <div><small>LIVE DRIVER WORKFLOW</small><h2>{!driver ? "Restoring state" : driver.state.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</h2></div>
          <span className={driver ? "pill good" : "pill"}>{driver ? "REV " + driver.revision : "LOADING"}</span>
        </div>
        <div className="driver-timers">
          <div><small>INDIA TIME</small><strong>{localClock}</strong></div>
          <div><small>SHIFT ELAPSED</small><strong>{elapsed(driver?.shiftStartedAt)}</strong></div>
          <div><small>TRIP ELAPSED</small><strong>{elapsed(driver?.tripStartedAt)}</strong></div>
        </div>
        <p className="driver-message" aria-live="polite">{driverMessage}</p>
        <div className="driver-actions">
          {!shiftOn && <button className="primary-action" disabled={!driver || driverBusy || pending.length > 0} onClick={() => dispatch("shift_start")}>Start shift</button>}
          {shiftOn && !tripOn && <>
            <button className="primary-action" disabled={driverBusy || pending.length > 0} onClick={() => dispatch("trip_start")}>Start trip</button>
            <button className="secondary-action" disabled={driverBusy || pending.length > 0} onClick={() => dispatch("shift_end")}>End shift</button>
          </>}
          {tripOn && <>
            <button className="primary-action" disabled={driverBusy || pending.length > 0} onClick={() => dispatch("trip_end")}>End trip</button>
            <button className="secondary-action" disabled={driverBusy || pending.length > 0} onClick={() => dispatch("ride_cancel")}>Cancel trip</button>
          </>}
        </div>
        {pending.length > 0 && <div className="pending-list">
          <strong>Pending recovery</strong>
          {pending.map((item) => <div className="pending-row" key={item.command.eventId}>
            <span>{item.command.eventType.replaceAll("_", " ")} · {item.status.replaceAll("_", " ")}</span>
            <button disabled={driverBusy} onClick={() => retry(item.command.eventId)}>Retry GPS</button>
          </div>)}
        </div>}
        {nativeOverlayAvailable() && <div className="overlay-control">
          <button className="secondary-action" onClick={enableOverlay}>Enable floating controls</button>
          <button className="secondary-action" onClick={disableOverlay}>Disable overlay</button>
          <span>{overlayMessage || "Optional · requires display-over-other-apps permission"}</span>
        </div>}
        <small className="driver-note">Each action is saved as a pending intent before one fresh GPS request. The state changes only after the location evidence and event are committed.</small>
      </section>

      <BackupPanel />

      <section className="section-title">
        <div><small>CORE FOUNDATION</small><h2>Built to grow</h2></div>
        <span>Driver-first · Offline-first</span>
      </section>
      <p className="foundation-note">The driver workflow, native overlay, persistence and recovery are the current priority. Business features will be added incrementally after this foundation is validated.</p>
      <footer>Sam Travels · Local-first by design</footer>
    </main>
  );
}
