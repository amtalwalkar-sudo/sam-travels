import { useEffect, useState, type ComponentType } from "react";
import type { AdminPresentationServices } from "../../../../packages/application/src";
import type { AtomicRecordBatchRepository, RuntimeRegistry, PolicyRepository, RecordRepository } from "../../../../packages/core/src";
import { SwipeActionBar } from "./SwipeActionBar";
import { driverPresentationCssVars } from "./driver-presentation";
import { getDriverSwipeAction } from "../../../../packages/features/work-shift";
import { BackupPanel } from "./BackupPanel";
import { useDriverWorkspace } from "./use-driver-workspace";
import { FeatureScreenHost } from "./FeatureScreenHost";
import { AdminWorkspace } from "./AdminWorkspace";
import { FuelEntryPanel } from "./FuelEntryPanel";
import { FullCostBreakevenPanel } from "./FullCostBreakevenPanel";
import type { FullCostBreakevenService } from "../../../../packages/application/src";
import { AdminServicesProvider } from "./admin-services-context";
import { ApplicationShell, primaryShellDefinition, type ApplicationShellProps, type PrimaryScreen } from "./ApplicationShell";

type Screen = PrimaryScreen;
const shellDefinition = primaryShellDefinition;

export type AppProps = Readonly<{ ShellRenderer?: ComponentType<ApplicationShellProps>; adminServices: AdminPresentationServices; runtimeRegistry: RuntimeRegistry; platformRepository: RecordRepository & PolicyRepository & AtomicRecordBatchRepository; fullCostBreakeven: Pick<FullCostBreakevenService, "calculate">; showBreakevenSanityCheck: boolean }>;

/** The shell renderer is replaceable without changing feature screens or application workflows. */
export function App({ ShellRenderer = ApplicationShell, adminServices, runtimeRegistry, platformRepository, fullCostBreakeven, showBreakevenSanityCheck }: AppProps) {
  const [activeScreen, setActiveScreen] = useState<Screen>(shellDefinition.initialScreen);
  const workspace = useDriverWorkspace(runtimeRegistry, platformRepository);
  const [shiftStartOdometer, setShiftStartOdometer] = useState("");
  const [shiftEndOdometer, setShiftEndOdometer] = useState("");
  const [boundaryOdometer, setBoundaryOdometer] = useState("");
  useEffect(() => {
    setShiftStartOdometer("");
    setShiftEndOdometer("");
    setBoundaryOdometer("");
  }, [workspace.driver?.state, workspace.driver?.lastConfirmedOdometerKm, workspace.driver?.shiftStartOdometerKm]);
  const {
    repo, enabled, error, ready, driver, pending, pendingBlocksWorkflow, pendingBoundary, boundaryAt, driverBusy,
    driverMessage, shiftOn, localClock, elapsed, driverChoices, selectedDriverId,
    pendingCancellationFees, cancellationFeeDrafts, cancellationFeeBusy,
    pendingCompletedTripFinancials, completedTripFinancialDrafts, completedTripFinancialBusy, completedTripFinancialSummaries,
  } = workspace;
  const { retry, toggleNetwork, dispatch, selectDriver, updateCancellationFeeDraft, submitCancellationFee,
    updateCompletedTripFinancialDraft, submitCompletedTripFinancials } = workspace.actions;
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

            <section className="driver-card" style={driverPresentationCssVars}>
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
              <div className="driver-odometer-summary">
                <small>LATEST CONFIRMED ODOMETER</small>
                <strong>{driver?.lastConfirmedOdometerKm === undefined ? "Not available yet" : driver.lastConfirmedOdometerKm.toLocaleString("en-IN") + " km"}</strong>
              </div>
              {!shiftOn && <label className="driver-selection">Work Driver
                <select value={selectedDriverId} onChange={(event) => void selectDriver(event.target.value)} disabled={driverBusy}>
                  <option value="">Select an active Driver</option>
                  {driverChoices.map((choice) => <option key={choice.driverId} value={choice.driverId}>{choice.name}</option>)}
                </select>
              </label>}
              <div className="driver-actions driver-actions-stateful">
                {!shiftOn && <>
                  <label className="driver-selection">Shift-start odometer (km)
                    <input type="number" min={driver?.lastConfirmedOdometerKm ?? 0} step="1" inputMode="numeric"
                      value={shiftStartOdometer || (driver?.lastConfirmedOdometerKm === undefined ? "" : String(driver.lastConfirmedOdometerKm))}
                      onChange={event => setShiftStartOdometer(event.target.value)} disabled={driverBusy} />
                  </label>
                  {driver?.lastConfirmedOdometerKm !== undefined && shiftStartOdometer !== "" &&
                    <small className="driver-note">Personal kilometres: {Math.max(0, Number(shiftStartOdometer) - driver.lastConfirmedOdometerKm)} km</small>}
                  {driver?.lastConfirmedOdometerKm === undefined && <small className="driver-note">First shift: personal kilometres are not available.</small>}
                  <button className="primary-action" disabled={!driver || !selectedDriverId || driverBusy || pendingBlocksWorkflow ||
                    (shiftStartOdometer === "" && driver?.lastConfirmedOdometerKm === undefined) ||
                    !Number.isSafeInteger(Number(shiftStartOdometer || driver?.lastConfirmedOdometerKm)) ||
                    Number(shiftStartOdometer || driver?.lastConfirmedOdometerKm) < (driver?.lastConfirmedOdometerKm ?? 0)}
                    onClick={() => dispatch("shift_start", Number(shiftStartOdometer || driver?.lastConfirmedOdometerKm))}>Start shift</button>
                </>}
                {driver?.state === "shift_active" && <>
                  {pendingBoundary && <div className="pending-list" role="alert">
                    <strong>04:00 operational-day boundary reached</strong>
                    <p>Confirm the vehicle odometer to close the outgoing shift and continue with the same Driver and Vehicle.</p>
                    <label className="driver-selection">Boundary odometer (km)
                      <input type="number" min={driver.shiftStartOdometerKm ?? 0} step="1" inputMode="numeric" value={boundaryOdometer || String(driver.lastConfirmedOdometerKm ?? driver.shiftStartOdometerKm ?? "")} onChange={event=>setBoundaryOdometer(event.target.value)} disabled={driverBusy}/>
                    </label>
                    <button className="primary-action" disabled={driverBusy || !Number.isSafeInteger(Number(boundaryOdometer || driver.lastConfirmedOdometerKm || driver.shiftStartOdometerKm)) || Number(boundaryOdometer || driver.lastConfirmedOdometerKm || driver.shiftStartOdometerKm) < (driver.shiftStartOdometerKm ?? 0)} onClick={()=>dispatch("shift_rotate",Number(boundaryOdometer || driver.lastConfirmedOdometerKm || driver.shiftStartOdometerKm))}>Confirm odometer and rotate shift</button>
                    <small className="driver-note">Boundary: {boundaryAt ? new Date(boundaryAt).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}) : "Pending"}</small>
                  </div>}
                  {!pendingBoundary && swipeAction && <SwipeActionBar label={swipeAction.label} disabled={!driver?.shiftContext || driverBusy || pendingBlocksWorkflow} onConfirm={() => dispatch(swipeAction.eventType)} />}
                  {!pendingBoundary && driver?.shiftStartOdometerKm !== undefined ? <>
                    <label className="driver-selection">Shift-end odometer (km)
                      <input type="number" min={driver.shiftStartOdometerKm} step="1" inputMode="numeric"
                        value={shiftEndOdometer || String(driver.shiftStartOdometerKm)}
                        onChange={event => setShiftEndOdometer(event.target.value)} disabled={driverBusy} />
                    </label>
                    <small className="driver-note">Business kilometres: {Math.max(0, Number(shiftEndOdometer || driver.shiftStartOdometerKm) - driver.shiftStartOdometerKm)} km</small>
                    <button className="secondary-action" disabled={driverBusy || pendingBlocksWorkflow ||
                      !Number.isSafeInteger(Number(shiftEndOdometer || driver.shiftStartOdometerKm)) ||
                      Number(shiftEndOdometer || driver.shiftStartOdometerKm) < driver.shiftStartOdometerKm}
                      onClick={() => dispatch("shift_end", Number(shiftEndOdometer || driver.shiftStartOdometerKm))}>End shift</button>
                  </> : !pendingBoundary && <button className="secondary-action" disabled={driverBusy || pendingBlocksWorkflow}
                    onClick={() => dispatch("shift_end")}>End legacy shift</button>}
                  {!driver?.shiftContext && <small className="driver-note">This shift uses legacy v1 history. End it and start a new shift to create v2 trips with a fixed Driver and Vehicle snapshot.</small>}
                </>}
                {driver?.state === "going_to_pickup" && <>
                  {swipeAction && <SwipeActionBar label={swipeAction.label} disabled={driverBusy || pendingBlocksWorkflow} onConfirm={() => dispatch(swipeAction.eventType)} />}
                  <button className="cancel-trip-action" disabled={driverBusy || pendingBlocksWorkflow} onClick={() => dispatch("cancel_ride")}>Cancel trip</button>
                </>}
                {driver?.state === "trip_active" && swipeAction && <SwipeActionBar label={swipeAction.label} disabled={driverBusy || pendingBlocksWorkflow} onConfirm={() => dispatch(swipeAction.eventType)} />}
              </div>
              {pendingCancellationFees.length > 0 && <div className="pending-list driver-form-list" aria-live="polite">
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
              {pendingCompletedTripFinancials.length > 0 && <div className="pending-list" aria-live="polite">
                <strong>Fare and trip financials required</strong>
                <p>Enter Fare to complete this ride's financial entry. ₹0 is valid. Toll and Parking are optional; choose a payer separately for each amount entered.</p>
                {pendingCompletedTripFinancials.map(obligation => {
                  const tripId=obligation.data.tripId;
                  const draft=completedTripFinancialDrafts[tripId]??{fare:"",toll:"",tollPayer:"",parking:"",parkingPayer:""};
                  const summary=completedTripFinancialSummaries[tripId];
                  return <div className="pending-row" key={obligation.id}>
                    <label>Fare (₹)
                      <input type="number" min="0" step="0.01" inputMode="decimal" value={draft.fare}
                        onChange={event=>void updateCompletedTripFinancialDraft(tripId,"fare",event.target.value)}
                        disabled={completedTripFinancialBusy} aria-label="Fare in rupees" />
                    </label>
                    <details>
                      <summary>Add Toll (optional)</summary>
                      <label>Toll (₹)
                        <input type="number" min="0" step="0.01" inputMode="decimal" value={draft.toll}
                          onChange={event=>void updateCompletedTripFinancialDraft(tripId,"toll",event.target.value)}
                          disabled={completedTripFinancialBusy} aria-label="Toll in rupees" />
                      </label>
                      <label>Toll paid by
                        <select value={draft.tollPayer} onChange={event=>void updateCompletedTripFinancialDraft(tripId,"tollPayer",event.target.value)}
                          disabled={completedTripFinancialBusy}>
                          <option value="">Select payer</option><option value="driver">Driver</option><option value="customer">Customer</option>
                        </select>
                      </label>
                    </details>
                    <details>
                      <summary>Add Parking (optional)</summary>
                      <label>Parking (₹)
                        <input type="number" min="0" step="0.01" inputMode="decimal" value={draft.parking}
                          onChange={event=>void updateCompletedTripFinancialDraft(tripId,"parking",event.target.value)}
                          disabled={completedTripFinancialBusy} aria-label="Parking in rupees" />
                      </label>
                      <label>Parking paid by
                        <select value={draft.parkingPayer} onChange={event=>void updateCompletedTripFinancialDraft(tripId,"parkingPayer",event.target.value)}
                          disabled={completedTripFinancialBusy}>
                          <option value="">Select payer</option><option value="driver">Driver</option><option value="customer">Customer</option>
                        </select>
                      </label>
                    </details>
                    {summary && <small>Customer charge ₹{(summary.customerChargePaise/100).toFixed(2)} · Driver expenses ₹{(summary.driverExpensesPaise/100).toFixed(2)} · Net trip earnings before fuel ₹{(summary.netTripEarningsBeforeFuelPaise/100).toFixed(2)}</small>}
                    <button className="primary-action" disabled={completedTripFinancialBusy||draft.fare===""}
                      onClick={()=>void submitCompletedTripFinancials(tripId)}>Submit trip financials</button>
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

            <FeatureScreenHost registry={runtimeRegistry} mountPoint="Drive" contextContract={{ id: "drive.host", version: 1 }} context={{ activeScreen }} />
        </div>
        {activeScreen === "Timeline" && (
          <FeatureScreenHost registry={runtimeRegistry} mountPoint="Timeline" contextContract={{ id: "timeline.main", version: 1 }} context={{ loadTimeline: workspace.loadTimeline }} />
        )}
        {activeScreen === "Performance" && (
          <section className="screen-heading"><small>YOUR WORKSPACE</small><h1>Performance</h1>{showBreakevenSanityCheck && <FullCostBreakevenPanel service={fullCostBreakeven} />}<FeatureScreenHost registry={runtimeRegistry} mountPoint="Performance" contextContract={{ id: "performance.host", version: 1 }} context={{ activeScreen }} /></section>
        )}
        {activeScreen === "Admin" && <AdminServicesProvider services={adminServices} identityRecords={platformRepository}><FeatureScreenHost registry={runtimeRegistry} mountPoint="Admin" contextContract={{ id: "admin.workspace", version: 1 }} context={<AdminWorkspace />} /></AdminServicesProvider>}
      <AdminServicesProvider services={adminServices} identityRecords={platformRepository}>
        <FuelEntryPanel />
      </AdminServicesProvider>
    </ShellRenderer>
  );
}
