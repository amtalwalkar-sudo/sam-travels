export function isRuntimeLocalRecord(id: string): boolean {
  return id === "work:selected-driver" || id.startsWith("identity:driver-person-link:");
}

export function isPreservedLocalRecord(id: string): boolean {
  return isRuntimeLocalRecord(id) ||
    id.startsWith("__sam_travels_recovery_checkpoint__:") ||
    id.startsWith("__sam_travels_recovery_journal__:");
}

export function isNonPortableIdentityRecord(id: string): boolean {
  return isPreservedLocalRecord(id) || id.startsWith("identity:person:");
}

export function isNonRestorableImportedRecord(id: string): boolean {
  return id.startsWith("identity:person:") ||
    id.startsWith("__sam_travels_recovery_checkpoint__:") ||
    id.startsWith("__sam_travels_recovery_journal__:");
}
