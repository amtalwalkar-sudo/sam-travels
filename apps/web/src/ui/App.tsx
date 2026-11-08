import { useState } from "react";
import { nativeOverlayAvailable } from "../driver-workflow";
import { BackupPanel } from "./BackupPanel";
import { useDriverWorkspace } from "./use-driver-workspace";
import { FeatureScreenHost } from "./FeatureScreenHost";
import { AdminWorkspace } from "./AdminWorkspace";
import { ApplicationShell, NavigationIcon, primaryShellDefinition, type PrimaryScreen } from "./ApplicationShell";

type Screen = PrimaryScreen;
const shellDefinition = primaryShellDefinition;
const navigation = shellDefinition.navigation;

function ComingSoon({ screen }: { screen: Exclude<Screen, "Drive"> }) {
  const descriptions: Record<Exclude<Screen, "Drive">, string> = {
    Timeline: "Your trip and work activity will appear here.",
    Performance: "Your driving and business performance will appear here.",
    Admin: "Workspace administration will appear here.",
  };

  return (
    <section className="empty-screen" aria-labelledby="screen-title">
      <div className="empty-screen-icon"><NavigationIcon name={navigation.find((item) => item.screen === screen)!.icon} /></div>
      <p>{descriptions[screen]}</p>
      <span>This section will be developed in a later phase.</span>
    </section>
  );
}

export function App() {
  const [activeScreen, setActiveScreen] = useState<Screen>(shellDefinition.initialScreen);
  const workspace = useDriverWorkspace();
  const {
    repo, enabled, error, ready, driver, pending, pendingBlocksWorkflow, driverBusy,
    overlayMessage, driverMessage, shiftOn, tripOn, localClock, elapsed, driverChoices, selectedDriverId,
  } = workspace;
  const { enableOverlay, disableOverlay, retry, toggleNetwork, dispatch, selectDriver } = workspace.actions;

  return (
    <ApplicationShell activeScreen={activeScreen} onNavigate={setActiveScreen}
      settingsContent={<>
        <button className={enabled ? "network enabled" : "network"} onClick={toggleNetwork} disabled={!repo} aria-pressed={enabled}>
          <i />Internet {enabled ? "On" : "Off"}
        </button>
        <p>Connection is optional. Your workspace remains local-first.</p>
      </>}>
        <div hidden={activeScreen !== "Drive"}>
            <section className="screen-heading">
              <small>YOUR WORKSPACE</small>
              <h1>Drive</h1>
              <p>Manage your shift and trips.</p>
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
              {!shiftOn && <label className="driver-selection">Work Driver
                <select value={selectedDriverId} onChange={(event) => void selectDriver(event.target.value)} disabled={driverBusy}>
                  <option value="">Select an active Driver</option>
                  {driverChoices.map((choice) => <option key={choice.driverId} value={choice.driverId}>{choice.name}</option>)}
                </select>
              </label>}
              <div className="driver-actions">
                {!shiftOn && <button className="primary-action" disabled={!driver || !selectedDriverId || driverBusy || pendingBlocksWorkflow} onClick={() => dispatch("shift_start")}>Start shift</button>}
                {shiftOn && !tripOn && <>
                  <button className="primary-action" disabled={!driver?.shiftContext || driverBusy || pendingBlocksWorkflow} onClick={() => dispatch("trip_create")}>Create trip</button>
                  <button className="secondary-action" disabled={driverBusy || pendingBlocksWorkflow} onClick={() => dispatch("shift_end")}>End shift</button>
                  {!driver?.shiftContext && <small className="driver-note">This shift uses legacy v1 history. End it and start a new shift to create v2 trips with a fixed Driver and Vehicle snapshot.</small>}
                </>}
                {driver?.state === "going_to_pickup" && <>
                  <button className="primary-action" disabled={driverBusy || pendingBlocksWorkflow} onClick={() => dispatch("start_ride")}>Start ride</button>
                  <button className="secondary-action" disabled={driverBusy || pendingBlocksWorkflow} onClick={() => dispatch("cancel_ride")}>Cancel ride</button>
                </>}
                {driver?.state === "trip_active" && <button className="primary-action" disabled={driverBusy || pendingBlocksWorkflow} onClick={() => dispatch("end_ride")}>End ride</button>}
              </div>
              {pending.length > 0 && <div className="pending-list">
                <strong>Pending recovery</strong>
                {pending.map((item) => <div className="pending-row" key={item.command.eventId}>
                  <span>{item.command.eventType.replaceAll("_", " ")} · {item.status.replaceAll("_", " ")}{item.reason === "gps_recovery_window_expired" ? " · GPS window expired" : ""}</span>
                  {item.reason === "gps_recovery_window_expired"
                    ? <small className="pending-expired">Reissue as a new action when ready</small>
                    : item.status === "pending_location"
                      ? <small>GPS check running in the background</small>
                      : <button disabled={driverBusy} onClick={() => retry(item.command.eventId)}>Retry GPS</button>}
                </div>)}
              </div>}
              {nativeOverlayAvailable() && <div className="overlay-control">
                <button className="secondary-action" onClick={enableOverlay}>Enable floating controls</button>
                <button className="secondary-action" onClick={disableOverlay}>Disable overlay</button>
                <span>{overlayMessage || "Optional · requires display-over-other-apps permission"}</span>
              </div>}
              <small className="driver-note">Each action is saved as a pending intent before one fresh GPS request. The state changes only after the location evidence and event are committed.</small>
              <small className="driver-note">Background limits: keep the browser PWA open and visible during GPS capture; screen-off browser capture is not guaranteed. On Android, the floating controls run as a location foreground service; without them, a Capacitor GPS request is short-lived and screen-off delivery is not guaranteed.</small>
            </section>

            <BackupPanel />
            <FeatureScreenHost mountPoint="Drive" context={{ activeScreen }} />
        </div>
        {activeScreen === "Timeline" && (
          <FeatureScreenHost mountPoint="Timeline" context={{ loadTimeline: workspace.loadTimeline }} />
        )}
        {activeScreen === "Performance" && (
          <section className="screen-heading"><small>YOUR WORKSPACE</small><h1>Performance</h1><ComingSoon screen="Performance" /><FeatureScreenHost mountPoint="Performance" context={{ activeScreen }} /></section>
        )}
        {activeScreen === "Admin" && <AdminWorkspace />}
    </ApplicationShell>
  );
}
