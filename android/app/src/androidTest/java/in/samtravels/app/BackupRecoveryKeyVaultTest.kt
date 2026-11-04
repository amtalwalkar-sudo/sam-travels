package `in`.samtravels.app

import androidx.test.core.app.ApplicationProvider
import android.content.Context
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class BackupRecoveryKeyVaultTest {
    @Test fun recoveryKeyIsProtectedAndSurvivesVaultRecreation() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val key = android.util.Base64.encodeToString(ByteArray(32) { (it + 1).toByte() }, android.util.Base64.NO_WRAP)
        val first = BackupRecoveryKeyVault(context)
        first.remove()
        first.store(key)

        // A fresh vault instance represents a later process/UI/worker access.
        assertEquals(key, BackupRecoveryKeyVault(context).read())
        first.remove()
        assertNull(BackupRecoveryKeyVault(context).read())
    }

    @Test fun invalidRecoveryKeyIsRejected() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val vault = BackupRecoveryKeyVault(context)
        vault.remove()
        try {
            vault.store("not-a-valid-256-bit-key")
            throw AssertionError("Expected invalid key rejection")
        } catch (_: IllegalArgumentException) {
            assertNull(vault.read())
        }
    }
}
