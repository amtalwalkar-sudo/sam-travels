package `in`.samtravels.app

import android.util.Base64
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.security.SecureRandom

@RunWith(AndroidJUnit4::class)
class NativeBackupV2PackageTest {
    @Test fun nativePackageRoundTripsAndMatchesSharedFixtureManifest() {
        // The TypeScript interoperability test decrypts this shared fixture and verifies
        // the plaintext/manifest; it does not invoke a snapshot restore coordinator.
        // Ciphertexts are randomized, so native output is verified by decrypting its
        // own envelopes rather than byte-comparing it with another encryption run.
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
        // This fixed vector is consumed by the TypeScript interoperability test.
        // Equality proves the checked-in package is produced by the Android writer,
        // not merely a hand-authored envelope that happens to decrypt.
        assertEquals(canonicalJson(fixture.getJSONObject("backup")), canonicalJson(generated))
        val expectedManifest = fixture.getJSONObject("backup").getJSONObject("manifest")
        val actualManifest = generated.getJSONObject("manifest")
        listOf("applicationVersion", "schemaVersion", "createdAt", "businessTimezone", "snapshotRevision", "format", "plaintextSha256")
            .forEach { key -> assertEquals("Manifest field $key must match shared fixture", expectedManifest.get(key), actualManifest.get(key)) }
        assertEquals("recordCounts must match shared fixture", expectedManifest.getJSONObject("recordCounts").getInt("records"), actualManifest.getJSONObject("recordCounts").getInt("records"))

        // Exercise the same canonical manifest serializer used by production
        // decryption. JSONObject.toString() is not the v2 wire-format AAD.
        assertArrayEquals(
            plaintext,
            NativeBackupV2Package.decrypt(generated, fixture.getString("recoveryKey")),
        )
    }

    @Test fun nativeDecryptsSharedRecoveryOnlyPackageAndRejectsTampering() {
        val context = InstrumentationRegistry.getInstrumentation().context
        val fixture = JSONObject(context.assets.open("cross-platform-backup-v2.json").bufferedReader().use { it.readText() })
        val recoveryKey = fixture.getString("recoveryKey")
        val expected = fixture.getString("expectedPlaintext").toByteArray(Charsets.UTF_8)
        val packageJson = fixture.getJSONObject("backup")
        assertArrayEquals(expected, NativeBackupV2Package.decrypt(packageJson, recoveryKey))

        val tampered = JSONObject(packageJson.toString())
        tampered.getJSONObject("payload").put("ciphertext", "AA==")
        try {
            NativeBackupV2Package.decrypt(tampered, recoveryKey)
            throw AssertionError("tampered ciphertext must fail authentication")
        } catch (error: Exception) {
            assertTrue(error !is AssertionError)
        }
        try {
            NativeBackupV2Package.decrypt(packageJson, Base64.encodeToString(ByteArray(32), Base64.NO_WRAP))
            throw AssertionError("wrong recovery key must fail authentication")
        } catch (error: Exception) {
            assertTrue(error !is AssertionError)
        }
    }

    private fun canonicalJson(value: Any?): String = when (value) {
        is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(prefix = "{", postfix = "}") {
            JSONObject.quote(it) + ":" + canonicalJson(value.get(it))
        }
        is JSONArray -> (0 until value.length()).joinToString(prefix = "[", postfix = "]") {
            canonicalJson(value.get(it))
        }
        JSONObject.NULL -> "null"
        is String -> JSONObject.quote(value)
        else -> value.toString()
    }

}
