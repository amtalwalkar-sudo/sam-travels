/**
 * Stable command boundary implemented by application services.
 * Presentation forms submit values here; they never write persistence directly.
 */
export type FormSubmissionCommand = Readonly<{
  formId: string;
  formVersion: number;
  instanceId: string;
  operationId: string;
  action: "save" | "submit";
  values: Readonly<Record<string, unknown>>;
}>;

export type FormSubmissionPort<Result = unknown> = {
  submit(command: FormSubmissionCommand): Promise<Result>;
};
