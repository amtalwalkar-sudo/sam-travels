package `in`.samtravels.app

internal const val MAX_BACKUP_RECORD_COUNT = 1_000_000

internal fun requireBackupRecordCountWithinLimit(count: Int, limit: Int = MAX_BACKUP_RECORD_COUNT) {
    require(limit in 0..MAX_BACKUP_RECORD_COUNT && count in 0..limit) { "backup_record_count_limit" }
}

internal const val MAX_BACKUP_PACKAGE_BYTES = 512L * 1024 * 1024
internal const val BACKUP_PACKAGE_ENVELOPE_RESERVE_BYTES = 1024L * 1024
private const val AES_GCM_TAG_BYTES = 16L

/**
 * Conservative preflight for the serialized encrypted JSON envelope.
 * Account for the AES-GCM tag, base64 expansion and a fixed metadata reserve
 * before any digest or encryption work begins.
 */
internal fun estimateBackupPackageBytes(
    plaintextBytes: Long,
    envelopeReserveBytes: Long = BACKUP_PACKAGE_ENVELOPE_RESERVE_BYTES,
): Long {
    require(plaintextBytes >= 0L && envelopeReserveBytes >= 0L) { "backup_invalid_plaintext_size" }
    val ciphertextBytes = Math.addExact(plaintextBytes, AES_GCM_TAG_BYTES)
    val base64Bytes = Math.multiplyExact(Math.floorDiv(Math.addExact(ciphertextBytes, 2L), 3L), 4L)
    return Math.addExact(base64Bytes, envelopeReserveBytes)
}

internal fun requireBackupPlaintextWithinPackageLimit(
    plaintextBytes: Long,
    limit: Long = MAX_BACKUP_PACKAGE_BYTES,
    envelopeReserveBytes: Long = BACKUP_PACKAGE_ENVELOPE_RESERVE_BYTES,
): Long {
    require(limit in 0L..MAX_BACKUP_PACKAGE_BYTES && envelopeReserveBytes in 0L..limit) {
        "backup_invalid_package_size"
    }
    val estimatedBytes = estimateBackupPackageBytes(plaintextBytes, envelopeReserveBytes)
    require(estimatedBytes <= limit) { "backup_plaintext_preflight_exceeded" }
    return estimatedBytes
}

internal fun requireBackupPackageByteLength(
    byteLength: Long,
    limit: Long = MAX_BACKUP_PACKAGE_BYTES,
) {
    require(limit in 0L..MAX_BACKUP_PACKAGE_BYTES) { "backup_invalid_package_size" }
    require(byteLength >= 0L) { "backup_invalid_package_size" }
    require(byteLength <= limit) { "backup_package_too_large" }
}
