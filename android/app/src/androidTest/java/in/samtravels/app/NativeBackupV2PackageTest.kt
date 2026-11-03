package `in`.samtravels.app

import android.util.Base64
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

@RunWith(AndroidJUnit4::class)
class NativeBackupV2PackageTest {
    @Test fun nativePackageRoundTripsAndMatchesSharedFixtureManifest() {
        // The shared fixture is restored by the TypeScript interoperability test.
        // Ciphertexts are randomized, so native output must be verified by decrypting
        // its own envelopes rather than byte-comparing it with another encryption run.
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
        val expectedManifest = fixture.getJSONObject("backup").getJSONObject("manifest")
        assertTrue("Native and TypeScript fixture manifests must agree", expectedManifest.similar(generated.getJSONObject("manifest")))

        val aad = generated.getJSONObject("manifest").toString().toByteArray(Charsets.UTF_8)
        val recoveryKey = Base64.decode(fixture.getString("recoveryKey"), Base64.NO_WRAP)
        val wrapped = generated.getJSONObject("keyEnvelopes").getJSONObject("recovery").getJSONObject("wrappedDek")
        val dek = decrypt(recoveryKey, wrapped, aad)
        val payload = generated.getJSONObject("payload")
        val restored = decrypt(dek, payload, aad)
        assertArrayEquals(plaintext, restored)
    }

    private fun decrypt(key: ByteArray, envelope: JSONObject, aad: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            SecretKeySpec(key, "AES"),
            GCMParameterSpec(128, Base64.decode(envelope.getString("nonce"), Base64.NO_WRAP)),
        )
        cipher.updateAAD(aad)
        return cipher.doFinal(Base64.decode(envelope.getString("ciphertext"), Base64.NO_WRAP))
    }
}
