package `in`.samtravels.app

import org.junit.Assert.assertEquals
import org.junit.Test

class RecordDeletionPolicyTest {
    @Test fun onlyTransientFormWorkingCopiesCanUseGenericHardDelete() {
        assertTransientRecordDeletionAllowed("__sam_travels_form_working_copy__:admin.vehicle:one")
        val protectedIds = listOf(
            "feature:finance:loan:one", "feature:compliance:policy:one",
            "feature:maintenance:visit:one", "work:event:one", "logbook:event:one",
            "historical-correction:one", "backup-checkpoint:one", "identity:person:one",
        )
        protectedIds.forEach { id ->
            val failure = runCatching { assertTransientRecordDeletionAllowed(id) }.exceptionOrNull()
            assertEquals("record_delete_forbidden", failure?.message)
        }
    }
}
