import type { FormSubmissionCommand, FormSubmissionPort } from "./form-submission-port";

export type FormFieldDefinition = Readonly<{
  id: string;
  label: string;
  type: "text" | "number" | "date" | "time" | "select" | "checkbox";
  required?: boolean;
  maxLength?: number;
  options?: readonly string[];
}>;

export type FormDefinition = Readonly<{
  id: string;
  version: number;
  owner: string;
  purpose: string;
  primaryAction: "save" | "submit";
  fields: readonly FormFieldDefinition[];
}>;

export type FormWorkingCopy = Readonly<{
  formId: string;
  formVersion: number;
  instanceId: string;
  revision: number;
  status: "in_progress" | "pending" | "submitted";
  values: Readonly<Record<string, unknown>>;
  operationId: string;
  updatedAt: string;
}>;

export interface FormWorkingCopyRepository {
  get(formId: string, instanceId: string): Promise<FormWorkingCopy | undefined>;
  put(copy: FormWorkingCopy, expectedRevision?: number): Promise<void>;
  remove(formId: string, instanceId: string): Promise<void>;
}

export type FormValidationIssue = Readonly<{ fieldId: string; code: string; message: string }>;

export function validateFormValues(
  definition: FormDefinition,
  values: Readonly<Record<string, unknown>>,
): FormValidationIssue[] {
  const issues: FormValidationIssue[] = [];
  for (const field of definition.fields) {
    const value = values[field.id];
    const empty = value === undefined || value === null || value === "";
    if (field.required && empty) {
      issues.push({ fieldId: field.id, code: "required", message: field.label + " is required." });
      continue;
    }
    if (empty) continue;
    if (field.type === "text" && typeof value !== "string") {
      issues.push({ fieldId: field.id, code: "type", message: field.label + " must be text." });
    } else if (field.type === "text" && field.maxLength !== undefined && (value as string).length > field.maxLength) {
      issues.push({ fieldId: field.id, code: "max_length", message: field.label + " is too long." });
    } else if (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
      issues.push({ fieldId: field.id, code: "type", message: field.label + " must be a valid number." });
    } else if (field.type === "date" && (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + "T00:00:00Z")))) {
      issues.push({ fieldId: field.id, code: "date", message: field.label + " must be a valid date." });
    } else if (field.type === "select" && (typeof value !== "string" || !field.options?.includes(value))) {
      issues.push({ fieldId: field.id, code: "option", message: "Choose a valid " + field.label.toLowerCase() + "." });
    } else if (field.type === "checkbox" && typeof value !== "boolean") {
      issues.push({ fieldId: field.id, code: "type", message: field.label + " must be selected or cleared." });
    }
  }
  return issues;
}

/**
 * Shared, surface-neutral form mechanics. It persists working copies only as
 * in-progress state; the owning feature remains responsible for business rules
 * and durable business-record writes through FormSubmissionPort.
 */
export class SharedFormRuntime {
  private readonly submissions = new Map<string, Promise<unknown>>();

  constructor(
    private readonly workingCopies: FormWorkingCopyRepository,
    private readonly submissionPort: FormSubmissionPort,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async open(definition: FormDefinition, instanceId: string): Promise<FormWorkingCopy> {
    this.assertDefinition(definition);
    const existing = await this.workingCopies.get(definition.id, instanceId);
    if (existing) {
      if (existing.formVersion !== definition.version) throw new Error("form_definition_version_mismatch");
      return existing;
    }
    const copy: FormWorkingCopy = {
      formId: definition.id, formVersion: definition.version, instanceId,
      revision: 0, status: "in_progress", values: {}, operationId: crypto.randomUUID(), updatedAt: this.now(),
    };
    await this.workingCopies.put(copy);
    return copy;
  }

  async update(
    definition: FormDefinition,
    copy: FormWorkingCopy,
    fieldId: string,
    value: unknown,
  ): Promise<FormWorkingCopy> {
    this.assertDefinition(definition);
    if (copy.formId !== definition.id || copy.formVersion !== definition.version || copy.status !== "in_progress") {
      throw new Error("form_copy_not_editable");
    }
    if (!definition.fields.some(field => field.id === fieldId)) throw new Error("unknown_form_field");
    const next: FormWorkingCopy = {
      ...copy, revision: copy.revision + 1, values: { ...copy.values, [fieldId]: value }, updatedAt: this.now(),
    };
    await this.workingCopies.put(next, copy.revision);
    return next;
  }

  async submit(definition: FormDefinition, copy: FormWorkingCopy): Promise<unknown> {
    this.assertDefinition(definition);
    if (definition.primaryAction !== "submit") throw new Error("form_primary_action_is_save");
    if (copy.formId !== definition.id || copy.formVersion !== definition.version || copy.status !== "in_progress") {
      throw new Error("form_copy_not_submittable");
    }
    const issues = validateFormValues(definition, copy.values);
    if (issues.length) {
      const error = new Error("form_validation_failed");
      Object.assign(error, { issues });
      throw error;
    }
    const key = definition.id + ":" + copy.instanceId + ":" + copy.operationId;
    const active = this.submissions.get(key);
    if (active) return active;
    const operation = this.submissionPort.submit({
      formId: definition.id, formVersion: definition.version, operationId: copy.operationId, values: copy.values,
    });
    this.submissions.set(key, operation);
    try {
      const result = await operation;
      const submitted: FormWorkingCopy = { ...copy, revision: copy.revision + 1, status: "submitted", updatedAt: this.now() };
      await this.workingCopies.put(submitted, copy.revision);
      return result;
    } finally {
      this.submissions.delete(key);
    }
  }

  private assertDefinition(definition: FormDefinition) {
    if (!definition.id.trim() || !Number.isSafeInteger(definition.version) || definition.version < 1 ||
        !definition.owner.trim() || !definition.purpose.trim() ||
        !["save", "submit"].includes(definition.primaryAction) ||
        new Set(definition.fields.map(field => field.id)).size !== definition.fields.length ||
        definition.fields.some(field => !field.id.trim() || !field.label.trim())) {
      throw new Error("invalid_form_definition");
    }
  }
}
