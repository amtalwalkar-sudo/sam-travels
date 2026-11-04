import { useState } from "react";
import { nativeOverlayAvailable } from "../driver-workflow";
import { BackupPanel } from "./BackupPanel";
import { TripHistory } from "./TripHistory";
import { useDriverWorkspace } from "./use-driver-workspace";

type Screen = "Drive" | "Timeline" | "Performance" | "Admin";
type IconName = "drive" | "timeline" | "performance" | "admin";

const navigation: { label: Screen; icon: IconName }[] = [
  { label: "Drive", icon: "drive" },
  { label: "Timeline", icon: "timeline" },
  { label: "Performance", icon: "performance" },
  { label: "Admin", icon: "admin" },
];

function NavigationIcon({ name }: { name: IconName }) {
  const shared = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "drive":
      return <svg {...shared}><path d="M5 16.5 6.8 9h10.4l1.8 7.5" /><path d="M4 16.5h16v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" /><path d="m7 9 1.2-3h7.6L17 9" /><circle cx="7.5" cy="16.5" r="1" /><circle cx="16.5" cy="16.5" r="1" /></svg>;
    case "timeline":
      return <svg {...shared}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 9h16M8 13h2M8 16h5" /></svg>;
    case "performance":
      return <svg {...shared}><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 5-6" /><path d="M16 7h3v3" /></svg>;
    case "admin":
      return <svg {...shared}><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2A1.7 1.7 0 0 0 7.8 17l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 0 1 0-3.4h.2A1.7 1.7 0 0 0 5.4 6.8l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a1.7 1.7 0 0 1 3.4 0v.2A1.7 1.7 0 0 0 17 4.4l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 1.9Z" /></svg>;
  }
}

function ComingSoon({ screen }: { screen: Exclude<Screen, "Drive"> }) {
  const descriptions: Record<Exclude<Screen, "Drive">, string> = {
    Timeline: "Your trip and work activity will appear here.",
    Performance: "Your driving and business performance will appear here.",
    Admin: "Workspace settings and management will appear here.",
  };

  return (
    <section className="empty-screen" aria-labelledby="screen-title">
      <div className="empty-screen-icon"><NavigationIcon name={navigation.find((item) => item.label === screen)!.icon} /></div>
      <p>{descriptions[screen]}</p>
      <span>This section will be developed in a later phase.</span>
    </section>
  );
}

export function App() {
  const [activeScreen, setActiveScreen] = useState<Screen>("Drive");
  const workspace = useDriverWorkspace();
  const {
    repo, enabled, error, ready, driver, pending, pendingBlocksWorkflow, driverBusy,
    overlayMessage, driverMessage, shiftOn, tripOn, localClock, elapsed,
  } = workspace;
  const { enableOverlay, disableOverlay, retry, toggleNetwork, dispatch } = workspace.actions;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">ST</div>
          <div><strong>Sam Travels</strong><span>{activeScreen}</span></div>
        </div>
        <button className={enabled ? "network enabled" : "network"} onClick={toggleNetwork} disabled={!repo} aria-pressed={enabled}>
          <i />Internet {enabled ? "On" : "Off"}
        </button>
      </header>

      <div className="screen-scroll">
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
              <div className="driver-actions">
                {!shiftOn && <button className="primary-action" disabled={!driver || driverBusy || pendingBlocksWorkflow} onClick={() => dispatch("shift_start")}>Start shift</button>}
                {shiftOn && !tripOn && <>
                  <button className="primary-action" disabled={driverBusy || pendingBlocksWorkflow} onClick={() => dispatch("trip_start")}>Start trip</button>
                  <button className="secondary-action" disabled={driverBusy || pendingBlocksWorkflow} onClick={() => dispatch("shift_end")}>End shift</button>
                </>}
                {tripOn && <>
                  <button className="primary-action" disabled={driverBusy || pendingBlocksWorkflow} onClick={() => dispatch("trip_end")}>End trip</button>
                  <button className="secondary-action" disabled={driverBusy || pendingBlocksWorkflow} onClick={() => dispatch("ride_cancel")}>Cancel trip</button>
                </>}
              </div>
              {pending.length > 0 && <div className="pending-list">
                <strong>Pending recovery</strong>
                {pending.map((item) => <div className="pending-row" key={item.command.eventId}>
                  <span>{item.command.eventType.replaceAll("_", " ")} · {item.status.replaceAll("_", " ")}{item.reason === "gps_recovery_window_expired" ? " · GPS window expired" : ""}</span>
                  {item.reason === "gps_recovery_window_expired"
                    ? <small className="pending-expired">Reissue as a new action when ready</small>
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
        </div>
        {activeScreen === "Timeline" && (
          <section className="screen-heading"><small>YOUR WORKSPACE</small><h1>Timeline</h1><TripHistory /></section>
        )}
        {(activeScreen === "Performance" || activeScreen === "Admin") && (
          <section className="screen-heading"><small>YOUR WORKSPACE</small><h1>{activeScreen}</h1><ComingSoon screen={activeScreen} /></section>
        )}
      </div>

      <nav className="bottom-navigation" aria-label="Primary navigation">
        {navigation.map((item) => (
          <button
            key={item.label}
            className={activeScreen === item.label ? "bottom-navigation-item active" : "bottom-navigation-item"}
            onClick={() => setActiveScreen(item.label)}
            aria-current={activeScreen === item.label ? "page" : undefined}
          >
            <NavigationIcon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
