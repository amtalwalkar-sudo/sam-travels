import { MISC_BUSINESS_EXPENSE_FORM_V1 } from "../../../../packages/application/src";
import { ExpenseEntryForm } from "./AdminExpenseEntryForm";

export function MiscBusinessExpenseSection() {
  return <ExpenseEntryForm definition={MISC_BUSINESS_EXPENSE_FORM_V1} heading="Miscellaneous Business Expenses"
    description="Record other business costs with a category and optional vehicle or driver attribution." />;
}
