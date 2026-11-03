package `in`.samtravels.app

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import java.security.SecureRandom

@RunWith(AndroidJUnit4::class)
class NativeBackupV2PackageTest {
    @Test fun nativePackageMatchesSharedTypeScriptRestoreFixture() {
        // androidTest assets are packaged in the instrumentation APK, not the target app APK.
        val testContext = InstrumentationRegistry.getInstrumentation().context
        val fixture = JSONObject(testContext.assets.open("native-backup-v2.json").bufferedReader().use { it.readText() })
        val plaintext = """{"records":[{"id":"driver-state","json":"{}","schemaVersion":1,"updatedAt":"2026-11-04T00:00:00.000Z"}],"snapshotRevision":7,"schemaVersion":1}"""
            .toByteArray(Charsets.UTF_8)
        val manifest = JSONObject()
            .put("applicationVersion", "0.1.0")
            .put("schemaVersion", 1)
            .put("createdAt", "2026-11-04T00:00:00.000Z")
            .put("businessTimezone", "Asia/Kolkata")
            .put("snapshotRevision", 7)
            .put("recordCounts", JSONObject().put("records", 1))
        val deterministicRandom = object : SecureRandom() {
            private val bytes = (33..64).map { it.toByte() } + (1..24).map { it.toByte() }
            private var offset = 0
            override fun nextBytes(target: ByteArray) {
                require(offset + target.size <= bytes.size)
                bytes.subList(offset, offset + target.size).toByteArray().copyInto(target)
                offset += target.size
            }
        }

        val generated = NativeBackupV2Package.create(
            plaintext,
            manifest,
            fixture.getString("recoveryKey"),
            deterministicRandom,
        )

        assertEquals(fixture.getJSONObject("backup").toString(), generated.toString())
    }
}
