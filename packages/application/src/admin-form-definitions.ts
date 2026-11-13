import type { FormDefinition } from "./shared-form-runtime";

/** Canonical, versioned Admin Business Setup form contract. */
export const BUSINESS_SETUP_FORM_V1 = Object.freeze<FormDefinition>({
  id: "admin.business-setup",
  version: 1,
  owner: "business-settings",
  purpose: "Set the business start date",
  primaryAction: "save",
  fields: [
    { id: "businessStartDate", label: "Business start date", type: "date", required: true },
  ],
});

/** Canonical Vehicle form; record revision is internal optimistic-concurrency metadata. */
export const VEHICLE_FORM_V1 = Object.freeze<FormDefinition>({
  id: "admin.vehicle",
  version: 1,
  owner: "vehicles",
  purpose: "Create or update a vehicle record",
  primaryAction: "save",
  fields: [
    { id: "registrationNumber", label: "Registration number", type: "text", required: true, maxLength: 32 },
    { id: "make", label: "Make", type: "text", required: true, maxLength: 80 },
    { id: "model", label: "Model", type: "text", required: true, maxLength: 80 },
    { id: "vehicleType", label: "Vehicle type", type: "text", required: true, maxLength: 48 },
    { id: "fuelType", label: "Fuel type", type: "select", required: true, options: ["Diesel", "Petrol", "CNG", "Electric", "Hybrid", "Other"] },
    { id: "yearOfManufacture", label: "Year of manufacture", type: "number", required: true },
    { id: "ownership", label: "Ownership", type: "select", required: true, options: ["Owned", "Financed", "Leased", "Attached", "Other"] },
    { id: "lifecycleState", label: "Lifecycle status", type: "select", required: true, options: ["active", "inactive", "sold"] },
    { id: "_recordRevision", label: "Record revision", type: "number" },
  ],
});

/** Canonical Driver profile form; record metadata is internal to the shared draft. */
export const DRIVER_FORM_V1 = Object.freeze<FormDefinition>({
  id: "admin.driver",
  version: 1,
  owner: "driver-records",
  purpose: "Create or update a driver profile",
  primaryAction: "save",
  fields: [
    { id: "name", label: "Driver name", type: "text", required: true, maxLength: 120 },
    { id: "licenceNumber", label: "Driving licence number", type: "text", maxLength: 64 },
    { id: "licenceExpiryDate", label: "Licence expiry date", type: "date" },
    { id: "mobileNumber", label: "Mobile number", type: "text", maxLength: 32 },
    { id: "lifecycleState", label: "Status", type: "select", required: true, options: ["active", "inactive"] },
    { id: "_selectedForWork", label: "Selected for Work", type: "checkbox" },
    { id: "_recordRevision", label: "Record revision", type: "number" },
  ],
});


/** Compliance records are immutable; renewal creates a linked new record. */
export const COMPLIANCE_FORM_V1 = Object.freeze<FormDefinition>({
  id: "admin.compliance",
  version: 1,
  owner: "compliance",
  purpose: "Record vehicle compliance coverage or renewal",
  primaryAction: "save",
  fields: [
    { id: "vehicleId", label: "Vehicle", type: "text", required: true },
    { id: "complianceName", label: "Compliance type / name", type: "text", required: true, maxLength: 120 },
    { id: "validFrom", label: "Valid from", type: "date", required: true },
    { id: "validTo", label: "Valid until", type: "date", required: true },
    { id: "totalCostPaise", label: "Total cost in paise", type: "number", required: true },
    { id: "supportingDocumentRef", label: "Document reference", type: "text", maxLength: 240 },
    { id: "renewedFromRecordId", label: "Renewed from record", type: "text" },
  ],
});

/** Canonical Maintenance visit form. Item rows are a JSON value validated by the owning service. */
export const MAINTENANCE_VISIT_FORM_V1 = Object.freeze<FormDefinition>({
  id: "admin.maintenance-visit",
  version: 1,
  owner: "maintenance",
  purpose: "Record a vehicle maintenance visit and itemised costs",
  primaryAction: "save",
  fields: [
    { id: "vehicleId", label: "Vehicle", type: "text", required: true },
    { id: "maintenanceDate", label: "Maintenance date", type: "date", required: true },
    { id: "maintenanceType", label: "Maintenance type", type: "text", required: true, maxLength: 120 },
    { id: "description", label: "Description", type: "text", required: true, maxLength: 2000 },
    { id: "itemsJson", label: "Itemised costs", type: "text", required: true, maxLength: 20000 },
    { id: "odometerKm", label: "Odometer km", type: "number" },
    { id: "provider", label: "Provider", type: "text", maxLength: 160 },
    { id: "nextServiceDate", label: "Next service date", type: "date" },
    { id: "nextServiceKm", label: "Next service km", type: "number" },
  ],
});

/** Canonical general Maintenance expense form. */
export const MAINTENANCE_EXPENSE_FORM_V1 = Object.freeze<FormDefinition>({
  id: "admin.maintenance-expense",
  version: 1,
  owner: "maintenance",
  purpose: "Record a general vehicle maintenance expense",
  primaryAction: "save",
  fields: [
    { id: "vehicleId", label: "Vehicle", type: "text", required: true },
    { id: "expenseDate", label: "Expense date", type: "date", required: true },
    { id: "expenseName", label: "Expense name", type: "text", required: true, maxLength: 120 },
    { id: "description", label: "Description", type: "text", required: true, maxLength: 2000 },
    { id: "amountPaise", label: "Amount in paise", type: "number", required: true },
    { id: "odometerKm", label: "Odometer km", type: "number" },
    { id: "provider", label: "Provider", type: "text", maxLength: 160 },
  ],
});

/** Canonical per-vehicle Maintenance rate change form. */
export const MAINTENANCE_RATE_FORM_V1 = Object.freeze<FormDefinition>({
  id: "admin.maintenance-rate",
  version: 1,
  owner: "maintenance",
  purpose: "Add a per-kilometre rate with effective-date history",
  primaryAction: "save",
  fields: [
    { id: "vehicleId", label: "Vehicle", type: "text", required: true },
    { id: "ratePaisePerKm", label: "Rate in paise per km", type: "number", required: true },
  ],
});



/** Canonical Loan details form. The record revision is internal optimistic-concurrency metadata. */
export const LOAN_DETAILS_FORM_V1 = Object.freeze<FormDefinition>({
  id: "admin.loan-details",
  version: 1,
  owner: "finance-loans",
  purpose: "Create an immutable loan details record and its EMI calculation inputs",
  primaryAction: "save",
  fields: [
    { id: "vehicleId", label: "Vehicle", type: "text", required: true },
    { id: "loanName", label: "Loan name", type: "text", required: true, maxLength: 120 },
    { id: "lenderName", label: "Lender name", type: "text", required: true, maxLength: 120 },
    { id: "loanAccountReference", label: "Loan account reference", type: "text", maxLength: 120 },
    { id: "principalPaise", label: "Original principal in paise", type: "number", required: true },
    { id: "annualInterestRateBasisPoints", label: "Annual interest rate in basis points", type: "number", required: true },
    { id: "loanStartDate", label: "Loan start date", type: "date", required: true },
    { id: "tenureMonths", label: "Tenure in months", type: "number", required: true },
    { id: "firstEmiDate", label: "First EMI date", type: "date", required: true },
    { id: "_recordId", label: "Record identity", type: "text" },
    { id: "_recordRevision", label: "Record revision", type: "number" },
  ],
});


/** Canonical Loan payment form; allocations are serialized in the working copy and validated by FinanceLoanPaymentService. */
export const LOAN_PAYMENT_FORM_V1 = Object.freeze<FormDefinition>({
  id: "admin.loan-payment",
  version: 1,
  owner: "finance-loans",
  purpose: "Record a payment and its EMI allocations",
  primaryAction: "save",
  fields: [
    { id: "loanId", label: "Loan", type: "text", required: true },
    { id: "businessDate", label: "Payment date", type: "date", required: true },
    { id: "amountPaise", label: "Amount in paise", type: "number", required: true },
    { id: "method", label: "Payment method", type: "select", required: true, options: ["cash", "bank_transfer", "cheque", "upi", "other"] },
    { id: "scheduleVersion", label: "Schedule version", type: "number", required: true },
    { id: "allocationsJson", label: "EMI allocations", type: "text", required: true, maxLength: 20000 },
    { id: "reference", label: "Transaction reference", type: "text", maxLength: 240 },
    { id: "note", label: "Payment note", type: "text", maxLength: 2000 },
  ],
});

/** Preview is non-committing; the final submit carries the service preview for stale-state revalidation. */
export const LOAN_PREPAYMENT_FORM_V1 = Object.freeze<FormDefinition>({
  id: "admin.loan-prepayment",
  version: 1,
  owner: "finance-loans",
  purpose: "Preview and confirm a principal prepayment",
  primaryAction: "submit",
  fields: [
    { id: "loanId", label: "Loan", type: "text", required: true },
    { id: "businessDate", label: "Prepayment date", type: "date", required: true },
    { id: "amountPaise", label: "Principal amount in paise", type: "number", required: true },
    { id: "mode", label: "Prepayment mode", type: "select", required: true, options: ["reduce_tenure"] },
    { id: "previewJson", label: "Service preview", type: "text", required: true, maxLength: 50000 },
  ],
});

/** Settlement preview is non-committing; submit commits only the exact preview after service revalidation. */
export const LOAN_SETTLEMENT_FORM_V1 = Object.freeze<FormDefinition>({
  id: "admin.loan-settlement",
  version: 1,
  owner: "finance-loans",
  purpose: "Preview and confirm final loan settlement",
  primaryAction: "submit",
  fields: [
    { id: "loanId", label: "Loan", type: "text", required: true },
    { id: "businessDate", label: "Settlement date", type: "date", required: true },
    { id: "method", label: "Payment method", type: "select", required: true, options: ["cash", "bank_transfer", "cheque", "upi", "other"] },
    { id: "reference", label: "Settlement reference", type: "text", maxLength: 240 },
    { id: "previewJson", label: "Service preview", type: "text", required: true, maxLength: 5000 },
  ],
});
