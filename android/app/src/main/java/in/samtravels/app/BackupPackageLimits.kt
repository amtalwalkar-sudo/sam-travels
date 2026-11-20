package `in`.samtravels.app

internal const val MAX_BACKUP_RECORD_COUNT = 1_000_000

internal fun requireBackupRecordCountWithinLimit(count: Int, limit: Int = MAX_BACKUP_RECORD_COUNT) {
    require(limit in 0..MAX_BACKUP_RECORD_COUNT && count in 0..limit) { "backup_record_count_limit" }
}
