import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BUSINESS_SETUP_FORM_V1, type AdminPresentationServices } from "../../../../packages/application/src";
import { useAdminBusinessSetupServices } from "./admin-services-context";
import "./AdminFormControls.css";

type BusinessSettings = Awaited<ReturnType<AdminPresentationServices["businessSettings"]["get"]>>;

export function BusinessSetupSection() {
  const services = useAdminBusinessSetupServices();
  const [record, setRecord] = useState<BusinessSettings | undefined>();
  const [copy, setCopy] = useState<Awaited<ReturnType<typeof services.formRuntime.open>>>();
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const current = await services.businessSettings.get();
      let workingCopy = await services.formRuntime.open(BUSINESS_SETUP_FORM_V1, "business-settings-singleton");
      if (workingCopy.values.businessStartDate === undefined && current) {
        workingCopy = await services.formRuntime.update(
          BUSINESS_SETUP_FORM_V1, workingCopy, "businessStartDate", current.data.businessStartDate,
        );
      }
      setRecord(current);
      setCopy(workingCopy);
      setDate(typeof workingCopy.values.businessStartDate === "string"
        ? workingCopy.values.businessStartDate : current?.data.businessStartDate ?? "");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Business Setup.");
    } finally { setLoading(false); }
  }, [services]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setMessage("");
    try {
      let workingCopy = copy ?? await services.formRuntime.open(BUSINESS_SETUP_FORM_V1, "business-settings-singleton");
      if (workingCopy.values.businessStartDate !== date) {
        workingCopy = await services.formRuntime.update(
          BUSINESS_SETUP_FORM_V1, workingCopy, "businessStartDate", date,
        );
      }
      await services.formRuntime.save(BUSINESS_SETUP_FORM_V1, workingCopy);
      const saved = await services.businessSettings.get();
      setRecord(saved);
      setCopy(await services.formRuntime.open(BUSINESS_SETUP_FORM_V1, "business-settings-singleton"));
      setMessage("Business start date saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Business settings could not be saved.");
    } finally { setSaving(false); }
  }

  return <div className="admin-capability-panel">
    <p className="admin-hint">Business-wide settings are owned by Business Settings. Historical finance and compliance dates remain allowed regardless of this date.</p>
    {loading ? <p className="admin-hint">Loading business settings…</p> : <form className="admin-capability-form" onSubmit={save}>
      <label>Business start date<input required type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <div className="loan-form-actions"><button className="admin-primary" type="submit" disabled={saving || !date}>{saving ? "Saving…" : record ? "Save changes" : "Set business start date"}</button></div>
      {record && <small className="admin-hint">Saved record · revision {record.revision}</small>}
      {copy && <small className="admin-hint">Draft status · {copy.status.replaceAll("_", " ")}</small>}
    </form>}
    {message && <p className="admin-message" role="status">{message}</p>}
  </div>;
}
