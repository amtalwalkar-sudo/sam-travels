import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { FUEL_ENTRY_FORM_V1, type AdminPresentationServices } from "../../../../packages/application/src";
import { deriveFuelQuantityMilliKg } from "../../../../packages/features/business-expenses";
import { useAdminServices } from "./admin-services-context";

type Vehicle = Awaited<ReturnType<AdminPresentationServices["vehicles"]["list"]>>[number];

function rupeesToPaise(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  const decimal = String(value);
  if (!/^[0-9]+(?:[.][0-9]{1,2})?$/.test(decimal)) return undefined;
  const [whole, fraction = ""] = decimal.split(".");
  const paise = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return paise <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(paise) : undefined;
}

export function FuelEntryPanel() {
  const services = useAdminServices();
  const [open, setOpen] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [latestOdometerByVehicle, setLatestOdometerByVehicle] = useState<Record<string, number>>({});
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [copy, setCopy] = useState<Awaited<ReturnType<typeof services.formRuntime.open>>>();
  const copyRef = useRef<typeof copy>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const start = useCallback(async () => {
    const [availableVehicles, drafts, fuelPurchases] = await Promise.all([
      services.vehicles.list(),
      services.formRuntime.listDrafts(FUEL_ENTRY_FORM_V1),
      services.businessExpenses.listFuelPurchases(),
    ]);
    const latest = new Map<string, { occurredAt: string; odometerKm: number }>();
    for (const purchase of fuelPurchases) {
      const previous = latest.get(purchase.data.vehicleId);
      if (!previous || purchase.data.occurredAt > previous.occurredAt) {
        latest.set(purchase.data.vehicleId, { occurredAt: purchase.data.occurredAt, odometerKm: purchase.data.odometerKm });
      }
    }
    setLatestOdometerByVehicle(Object.fromEntries([...latest].map(([id, item]) => [id, item.odometerKm])));
    setVehicles(availableVehicles.filter(vehicle => vehicle.data.lifecycleState === "active"));
    const resumable = [...drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    let next = resumable ?? await services.formRuntime.open(FUEL_ENTRY_FORM_V1, crypto.randomUUID());
    if (next.values.partialRefill === undefined) next = await services.formRuntime.update(FUEL_ENTRY_FORM_V1, next, "partialRefill", false);
    copyRef.current = next; setCopy(next);
    // GPS is intentionally not requested when the form opens. A fresh,
    // event-scoped request begins only inside the Submit handler.
  }, [services]);

  useEffect(() => {
    if (open) void start().catch(error => setMessage(error instanceof Error ? error.message : "Fuel entry could not be opened."));
  }, [open, start]);

  function change(field: string, value: unknown) {
    setValues(previous => ({ ...previous, [field]: value }));
    queue.current = queue.current.then(async () => {
      const current = copyRef.current;
      if (!current) return;
      const updated = await services.formRuntime.update(FUEL_ENTRY_FORM_V1, current, field, value);
      copyRef.current = updated; setCopy(updated);
    }).catch(error => setMessage(error instanceof Error ? error.message : "Fuel draft could not be saved."));
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await queue.current;
      const current = copyRef.current;
      if (!current) throw new Error("fuel_entry_form_not_ready");
      await services.formRuntime.submit(FUEL_ENTRY_FORM_V1, current);
      if (typeof current.values.vehicleId === "string" && typeof current.values.odometerKm === "number") {
        const vehicleId = current.values.vehicleId;
        setLatestOdometerByVehicle(previous => ({
          ...previous, [vehicleId]: Math.max(previous[vehicleId] ?? 0, current.values.odometerKm as number),
        }));
      }
      setMessage("Fuel purchase saved.");
      copyRef.current = undefined; setCopy(undefined); setValues({});
      const next = await services.formRuntime.open(FUEL_ENTRY_FORM_V1, crypto.randomUUID());
      copyRef.current = next; setCopy(next); setValues({ partialRefill: false });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fuel purchase could not be saved.");
    } finally { setBusy(false); }
  }

  const calculatedQuantityMilliKg = useMemo(() => {
    const amountPaise = rupeesToPaise(values.amountRupees);
    const pricePaisePerKg = rupeesToPaise(values.priceRupeesPerKg);
    if (!amountPaise || !pricePaisePerKg) return undefined;
    try { return deriveFuelQuantityMilliKg(amountPaise, pricePaisePerKg); }
    catch { return undefined; }
  }, [values.amountRupees, values.priceRupeesPerKg]);
  const latestOdometer = typeof values.vehicleId === "string" ? latestOdometerByVehicle[values.vehicleId] : undefined;
  const enteredOdometer = typeof values.odometerKm === "number" ? values.odometerKm : undefined;
  const odometerRegression = latestOdometer !== undefined && enteredOdometer !== undefined &&
    Number.isSafeInteger(enteredOdometer) && enteredOdometer < latestOdometer;

  return <aside className="fuel-entry-launcher" aria-label="Fuel entry">
    <button className="fuel-entry-toggle" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      {open ? "Close fuel entry" : "＋ Fuel entry"}
    </button>
    {open && <section className="fuel-entry-panel">
      <h2>Fuel Entry</h2>
      <p>Record a fuel purchase at any time. A shift or trip does not need to be active.</p>
      {!vehicles.length && <p role="status">Add an active vehicle in Admin before recording fuel.</p>}
      <form onSubmit={submit}>
        <label>Vehicle
          <select required value={String(values.vehicleId ?? "")} onChange={event => change("vehicleId", event.target.value)}>
            <option value="">Select vehicle</option>
            {vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.data.registrationNumber} · {vehicle.data.make} {vehicle.data.model}</option>)}
          </select>
        </label>
        <label>Odometer (km)
          <input required type="number" min="1" step="1" inputMode="numeric" value={String(values.odometerKm ?? "")}
            onChange={event => change("odometerKm", event.target.value === "" ? undefined : Number(event.target.value))} />
        </label>
        <label>Price per kg (₹)
          <input required type="number" min="0.01" step="0.01" inputMode="decimal" value={String(values.priceRupeesPerKg ?? "")}
            onChange={event => change("priceRupeesPerKg", event.target.value === "" ? undefined : Number(event.target.value))} />
        </label>
        <label>Amount paid (₹)
          <input required type="number" min="0.01" step="0.01" inputMode="decimal" value={String(values.amountRupees ?? "")}
            onChange={event => change("amountRupees", event.target.value === "" ? undefined : Number(event.target.value))} />
        </label>
        {calculatedQuantityMilliKg !== undefined && <p className="fuel-derived-preview">Calculated fuel quantity: <strong>{(calculatedQuantityMilliKg / 1000).toFixed(3)} kg</strong></p>}
        {latestOdometer !== undefined && <small>Latest recorded odometer for this vehicle: {latestOdometer.toLocaleString("en-IN")} km</small>}
        {odometerRegression && <p className="fuel-odometer-warning" role="status">This reading is below the latest recorded odometer ({latestOdometer} km). Check it before submitting; the entry will not be blocked.</p>}
        <label className="fuel-partial-choice">
          <input type="checkbox" checked={values.partialRefill === true} onChange={event => change("partialRefill", event.target.checked)} />
          Partial refill
        </label>
        <small>Full tank is the default. All purchases count as fuel expense; only full-tank refills form mileage checkpoints.</small>
        <button className="primary-action" type="submit" disabled={busy || !copy || !vehicles.length}>{busy ? "Saving…" : "Submit fuel purchase"}</button>
      </form>
      {copy && <small>Draft · {copy.status.replaceAll("_", " ")}</small>}
      {message && <p role="status">{message}</p>}
    </section>}
  </aside>;
}
