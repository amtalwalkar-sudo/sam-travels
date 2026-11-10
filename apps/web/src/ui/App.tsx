import { useState, type ComponentType } from "react";
import type { AdminPresentationServices } from "../../../../packages/application/src";
import type { AtomicRecordRepository, RuntimeRegistry, PolicyRepository, RecordRepository } from "../../../../packages/core/src";
import { SwipeActionBar } from "./SwipeActionBar";
import { getDriverSwipeAction } from "../../../../packages/features/work-shift";
import { BackupPanel } from "./BackupPanel";
import { useDriverWorkspace } from "./use-driver-workspace";
import { FeatureScreenHost } from "./FeatureScreenHost";
import { AdminWorkspace } from "./AdminWorkspace";
import { AdminServicesProvider } from "./admin-services-context";
import { ApplicationShell, NavigationIcon, primaryShellDefinition, type ApplicationShellProps, type PrimaryScreen } from "./ApplicationShell";

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

export type AppProps = Readonly<{ ShellRenderer?: ComponentType<ApplicationShellProps>; adminServices: AdminPresentationServices; runtimeRegistry: RuntimeRegistry; platformRepository: RecordRepository & PolicyRepository & AtomicRecordRepository }>;

/** The shell renderer is replaceable without changing feature screens or application workflows. */
export function App({ ShellRenderer = ApplicationShell, adminServices, runtimeRegistry, platformRepository }: AppProps) {
  const [activeScreen, setActiveScreen] = useState<Screen>(shellDefinition.initialScreen);
  const workspace = useDriverWorkspace(runtimeRegistry, platformRepository);
  const {
    repo, enabled, error, ready, driver, pending, pendingBlocksWorkflow, driverBusy,
    driverMessage, shiftOn, localClock, elapsed, driverChoices, selectedDriverId,
    pendingCancellationFees, cancellationFeeDrafts, cancellationFeeBusy,
  } = workspace;
  const { retry, toggleNetwork, dispatch, selectDriver, updateCancellationFeeDraft, submitCancellationFee } = workspace.actions;
  const swipeAction = getDriverSwipeAction(driver?.state);

  return (
    <ShellRenderer shellDefinition={shellDefinition} activeScreen={activeScreen} onNavigate={setActiveScreen}
      settingsContent={<>
        <button className={enabled ? "network enabled" : "network"} onClick={toggleNetwork} disabled={!repo} aria-pressed={enabled}>
          <i />Internet {enabled ? "On" : "Off"}
        </button>
        <p>Connection is optional. Your workspace remains local-first.</p>
        <BackupPanel />
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
              <div className="driver-actions driver-actions-stateful">
                {!shiftOn && <button className="primary-action" disabled={!driver || !selectedDriverId || driverBusy || pendingBlocksWorkflow} onClick={() => dispatch("shift_start")}>Start shift</button>}
                {driver?.state === "shift_active" && <>
                  {swipeAction && <SwipeActionBar label={swipeAction.label} disabled={!driver?.shiftContext || driverBusy || pendingBlocksWorkflow} onConfirm={() => dispatch(swipeAction.eventType)} />}
                  <button className="secondary-action" disabled={driverBusy || pendingBlocksWorkflow} onClick={() => dispatch("shift_end")}>End shift</button>
                  {!driver?.shiftContext && <small className="driver-note">This shift uses legacy v1 history. End it and start a new shift to create v2 trips with a fixed Driver and Vehicle snapshot.</small>}
                </>}
                {driver?.state === "going_to_pickup" && <>
                  {swipeAction && <SwipeActionBar label={swipeAction.label} disabled={driverBusy || pendingBlocksWorkflow} onConfirm={() => dispatch(swipeAction.eventType)} />}
                  <button className="cancel-trip-action" disabled={driverBusy || pendingBlocksWorkflow} onClick={() => dispatch("cancel_ride")}>Cancel trip</button>
                </>}
                {driver?.state === "trip_active" && swipeAction && <SwipeActionBar label={swipeAction.label} disabled={driverBusy || pendingBlocksWorkflow} onConfirm={() => dispatch(swipeAction.eventType)} />}
              </div>
              {pendingCancellationFees.length > 0 && <div className="pending-list" aria-live="polite">
                <strong>Cancellation fee required</strong>
                <p>Save the fee for each cancelled trip before starting another Work action or ending the shift. Enter ₹0 when no fee applies.</p>
                {pendingCancellationFees.map(obligation => {
                  const tripId = obligation.data.tripId;
                  return <div className="pending-row" key={obligation.id}>
                    <label>
                      Cancellation fee (₹)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={cancellationFeeDrafts[tripId] ?? ""}
                        onChange={event => void updateCancellationFeeDraft(tripId, event.target.value)}
                        disabled={cancellationFeeBusy}
                        aria-label="Cancellation fee in rupees"
                      />
                    </label>
                    <button
                      className="primary-action"
                      disabled={cancellationFeeBusy || (cancellationFeeDrafts[tripId] ?? "") === ""}
                      onClick={() => void submitCancellationFee(tripId)}
                    >Save cancellation fee</button>
                  </div>;
                })}
              </div>}
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
              <small className="driver-note">Each action is saved locally first. GPS is sampled asynchronously until reliable evidence arrives; the state changes only after the event is committed.</small>
              <small className="driver-note">Background limits: keep the browser PWA open and visible during GPS capture; screen-off browser capture is not guaranteed. On Android, the floating controls run as a location foreground service; without them, a Capacitor GPS request is short-lived and screen-off delivery is not guaranteed.</small>
            </section>

            <FeatureScreenHost registry={runtimeRegistry} mountPoint="Drive" context={{ activeScreen }} />
        </div>
        {activeScreen === "Timeline" && (
          <FeatureScreenHost registry={runtimeRegistry} mountPoint="Timeline" context={{ loadTimeline: workspace.loadTimeline }} />
        )}
        {activeScreen === "Performance" && (
          <section className="screen-heading"><small>YOUR WORKSPACE</small><h1>Performance</h1><ComingSoon screen="Performance" /><FeatureScreenHost registry={runtimeRegistry} mountPoint="Performance" context={{ activeScreen }} /></section>
        )}
        {activeScreen === "Admin" && <AdminServicesProvider services={adminServices}><FeatureScreenHost registry={runtimeRegistry} mountPoint="Admin" context={<AdminWorkspace />} /></AdminServicesProvider>}
    </ShellRenderer>
  );
}
