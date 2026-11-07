import type { FeatureRecordSource } from "./feature-record-service";

let applicationRecordSource: FeatureRecordSource | undefined;

/** Bind the platform's record provenance once at the application composition boundary. */
export function initializeApplicationRecordSource(source: FeatureRecordSource): void {
  if (applicationRecordSource) throw new Error("Application record source is already initialized");
  applicationRecordSource = source;
}

/** Presentation and application workflows consume provenance without inspecting platform SDKs. */
export function getApplicationRecordSource(): FeatureRecordSource {
  if (!applicationRecordSource) throw new Error("Application record source has not been initialized");
  return applicationRecordSource;
}
