import { AdminWorkspaceShell } from "./AdminWorkspaceShell";
import { BusinessSetupSection } from "./AdminBusinessSetupSection";
import { VehicleSection } from "./AdminVehicleSection";
import { BusinessStartDateCostAllocationPanel } from "./BusinessStartDateCostAllocationPanel";
import { DriverSection } from "./AdminDriverSection";
import { ComplianceSection } from "./AdminComplianceSection";
import { MaintenanceSection } from "./AdminMaintenance";
import { AdminFinanceSection } from "./AdminFinanceSection";
import { useAdminIdentityAdapter } from "./admin-services-context";
import { PersonIdentityPanel } from "./PersonIdentityPanel";
import { TrafficChallanSection } from "./BusinessExpenseAdminForms";

export function AdminWorkspace() {
  const identityAdapter = useAdminIdentityAdapter();
  const sections = [
    { id: "business-setup", label: "Business setup", content: <><BusinessSetupSection /><BusinessStartDateCostAllocationPanel /></> },
    { id: "vehicle", label: "Vehicle", content: <VehicleSection /> },
    { id: "driver", label: "Driver", content: <DriverSection /> },
    { id: "compliance", label: "Compliance", content: <><ComplianceSection /><TrafficChallanSection /></> },
    { id: "finance", label: "Finance", content: <AdminFinanceSection /> },
    { id: "maintenance", label: "Maintenance", content: <MaintenanceSection /> },
  ];
  return <AdminWorkspaceShell identityPanel={<PersonIdentityPanel adapter={identityAdapter} />}
    sections={sections} initialExpandedSection="finance" />;
}
