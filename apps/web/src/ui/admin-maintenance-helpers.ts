import type { AdminPresentationServices } from "../../../../packages/application/src";
export type Vehicle = Awaited<ReturnType<AdminPresentationServices["vehicles"]["list"]>>[number];
export type Maintenance = Awaited<ReturnType<AdminPresentationServices["maintenance"]["listVehicleRecords"]>>;
export type ItemDraft = { id: string; description: string; amount: string };
export const today = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
};
export const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(paise / 100);
export const newItem = (): ItemDraft => ({ id: crypto.randomUUID(), description: "", amount: "" });
