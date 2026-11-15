import { TRAFFIC_CHALLAN_FORM_V1 } from "../../../../packages/application/src";
import { ExpenseEntryForm } from "./AdminExpenseEntryForm";

export function TrafficChallanSection() {
  return <ExpenseEntryForm definition={TRAFFIC_CHALLAN_FORM_V1} heading="Traffic Challans"
    description="Record each challan against its vehicle. Challans remain separate from normal operating costs and are included in full-cost reporting." />;
}
