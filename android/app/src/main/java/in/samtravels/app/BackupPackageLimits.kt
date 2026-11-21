package `in`.samtravels.app

internal const val MAX_BACKUP_RECORD_COUNT = 1_000_000

internal fun requireBackupRecordCountWithinLimit(count: Int, limit: Int = MAX_BACKUP_RECORD_COUNT) {
    require(limit in 0..MAX_BACKUP_RECORD_COUNT && count in 0..limit) { "backup_record_count_limit" }
}

internal const val MAX_BACKUP_PACKAGE_BYTES = 512L * 1024 * 1024

internal fun requireBackupPackageByteLength(
    byteLength: Long,
    limit: Long = MAX_BACKUP_PACKAGE_BYTES,
) {
    require(limit in 0L..MAX_BACKUP_PACKAGE_BYTES) { "backup_invalid_package_size" }
    require(byteLength >= 0L) { "backup_invalid_package_size" }
    require(byteLength <= limit) { "backup_package_too_large" }
}
