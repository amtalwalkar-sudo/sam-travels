import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AdminIdentityPresentationAdapter, AdminIdentitySnapshot } from "../admin-identity-presentation-adapter";
import type { BusinessRoleV1 } from "../../../../packages/domain/src/person-identity";
import "./AdminFormControls.css";

export function PersonIdentityPanel({ adapter }: { adapter: AdminIdentityPresentationAdapter }) {
  const [snapshot, setSnapshot] = useState<AdminIdentitySnapshot>({
    people: [], drivers: [], links: {}, pinConfigured: false,
  });
  const [name, setName] = useState("");
  const [roles, setRoles] = useState<BusinessRoleV1[]>(["driver"]);
  const [pin, setPin] = useState("");
  const [selectedPerson, setSelectedPerson] = useState("");
  const [selectedRole, setSelectedRole] = useState<BusinessRoleV1>("driver");
  const [active, setActive] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setSnapshot(await adapter.load());
  }, [adapter]);

  useEffect(() => {
    void refresh().catch(error => setMessage(error instanceof Error ? error.message : "Identity records unavailable."));
  }, [refresh]);

  async function enroll(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      await adapter.enroll({
        displayName: name.trim(), roles,
        ...(!snapshot.pinConfigured ? { initialAdminPin: pin } : {}),
      });
      if (!snapshot.pinConfigured) setPin("");
      setName(""); setRoles(["driver"]); setMessage("Person enrolled.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Person enrollment failed.");
    } finally { setBusy(false); }
  }

  async function link(driverId: string, personId: string) {
    setBusy(true); setMessage("");
    try {
      await adapter.linkDriver({ driverId, personId });
      setSnapshot(current => ({ ...current, links: { ...current.links, [driverId]: personId } }));
      setMessage(personId ? "Driver profile link saved." : "Driver profile unlinked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Driver link failed.");
    } finally { setBusy(false); }
  }

  async function activate(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const actor = await adapter.activate({
        personId: selectedPerson, role: selectedRole,
        ...(selectedRole === "admin" ? { pin } : {}),
      });
      setActive(actor.actorId + " · " + actor.role);
      setPin(""); setMessage("Role activated.");
    } catch (error) {
      setActive(""); setMessage(error instanceof Error ? error.message : "Role activation failed.");
    } finally { setBusy(false); }
  }

  return <section className="admin-capability-panel" aria-label="People and roles">
    <h3>People & roles</h3>
    <p className="admin-hint">One person can hold Driver and Admin roles under the same person ID.</p>
    <form className="admin-capability-form" onSubmit={enroll}>
      <label>Person name<input required maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label>
      <div className="loan-form-grid">
        <label><input type="checkbox" checked={roles.includes("driver")} onChange={event =>
          setRoles(current => event.target.checked ? [...current.filter(role => role !== "driver"), "driver"] : current.filter(role => role !== "driver"))} /> Driver role</label>
        <label><input type="checkbox" checked={roles.includes("admin")} onChange={event =>
          setRoles(current => event.target.checked ? [...current.filter(role => role !== "admin"), "admin"] : current.filter(role => role !== "admin"))} /> Admin role</label>
      </div>
      {roles.includes("admin") && !snapshot.pinConfigured && <label>Set initial Admin PIN<input required minLength={4} maxLength={12} inputMode="numeric" type="password" value={pin} onChange={event => setPin(event.target.value)} /></label>}
      <button className="admin-primary" disabled={busy || !name.trim() || !roles.length ||
        (!snapshot.pinConfigured && (!roles.includes("admin") || !/^\d{4,12}$/.test(pin)))}>Enroll person</button>
    </form>
    {snapshot.drivers.map(driver => <label key={driver.driverId}>Link {driver.name} to person
      <select disabled={busy} value={snapshot.links[driver.driverId] ?? ""} onChange={event => void link(driver.driverId, event.target.value)}>
        <option value="">Not linked</option>
        {snapshot.people.filter(person => person.roles.includes("driver") && person.status === "active")
          .map(person => <option key={person.personId} value={person.personId}>{person.displayName}</option>)}
      </select>
    </label>)}
    <form className="admin-capability-form" onSubmit={activate}>
      <label>Select person<select required value={selectedPerson} onChange={event => setSelectedPerson(event.target.value)}>
        <option value="">Select person</option>
        {snapshot.people.filter(person => person.status === "active")
          .map(person => <option key={person.personId} value={person.personId}>{person.displayName}</option>)}
      </select></label>
      <label>Active role<select value={selectedRole} onChange={event => setSelectedRole(event.target.value as BusinessRoleV1)}>
        <option value="driver">Driver</option><option value="admin">Admin</option>
      </select></label>
      {selectedRole === "admin" && <label>Admin PIN<input required type="password" inputMode="numeric" value={pin} onChange={event => setPin(event.target.value)} /></label>}
      <button className="admin-primary" disabled={busy || !selectedPerson}>Activate role</button>
      <button className="admin-secondary" type="button" disabled={busy} onClick={() => {
        adapter.clear(); setActive(""); setMessage("Role deactivated.");
      }}>Deactivate</button>
    </form>
    {active && <p className="admin-hint">Active: {active}</p>}
    {message && <p role="status" className="admin-hint">{message}</p>}
  </section>;
}
