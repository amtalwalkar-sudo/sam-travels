import { PLATFORM_FEE_FORM_V1 } from "../../../../packages/application/src";
import { ExpenseEntryForm } from "./AdminExpenseEntryForm";

export function PlatformFeeSection() {
  return <ExpenseEntryForm definition={PLATFORM_FEE_FORM_V1} heading="Platform Fees"
    description="Record fees from actual trip or settlement evidence. Mark fees already deducted from income to prevent double-counting." />;
}
