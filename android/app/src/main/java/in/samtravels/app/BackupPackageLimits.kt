package `in`.samtravels.app

internal const val MAX_BACKUP_RECORD_COUNT = 1_000_000

internal fun requireBackupRecordCountWithinLimit(count: Int) {
    require(count in 0..MAX_BACKUP_RECORD_COUNT) { "backup_record_count_limit" }
}
