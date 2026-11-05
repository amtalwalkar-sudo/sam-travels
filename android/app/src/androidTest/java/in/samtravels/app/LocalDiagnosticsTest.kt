package `in`.samtravels.app

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LocalDiagnosticsTest {
    @Test fun recorderBoundsEntriesAndExportsOnlySanitizedMetadata() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        context.getSharedPreferences("sam_travels_local_diagnostics", Context.MODE_PRIVATE).edit().clear().commit()
        repeat(245) {
            LocalDiagnostics.record(context, "recovery", "restore_snapshot", "backup", "rolled_back")
        }
        val entries = LocalDiagnostics.export(context)
        assertEquals(200, entries.length())
        val first = entries.getJSONObject(0)
        assertTrue(first.has("timestamp"))
        assertEquals("failure", first.getString("outcome"))
        assertEquals(1, first.getInt("schemaVersion"))
        assertFalse(entries.toString().contains("latitude"))
        assertFalse(entries.toString().contains("longitude"))
        context.getSharedPreferences("sam_travels_local_diagnostics", Context.MODE_PRIVATE).edit().clear().commit()
    }

    @Test fun tokenSanitizationDoesNotRetainPayloadText() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        context.getSharedPreferences("sam_travels_local_diagnostics", Context.MODE_PRIVATE).edit().clear().commit()
        LocalDiagnostics.record(context, "coordinates 19.076,72.877", "restore private payload", "failure", "retry failed")
        val entry = LocalDiagnostics.export(context).getJSONObject(0)
        assertEquals("unknown", entry.getString("subsystem"))
        assertEquals("unknown", entry.getString("operation"))
        assertEquals("unknown", entry.getString("failureCategory"))
        context.getSharedPreferences("sam_travels_local_diagnostics", Context.MODE_PRIVATE).edit().clear().commit()
    }
}
