package `in`.samtravels.app

import android.util.Base64
import org.json.JSONObject
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Native implementation of backup-encryption-v2. The wire shape and manifest AAD
 * are intentionally kept in one small unit so Android and TypeScript can share
 * a checked-in interoperability fixture.
 */
internal object NativeBackupV2Package {
    fun create(
        plaintext: ByteArray,
        sourceManifest: JSONObject,
        recoveryKey: String,
        random: SecureRandom = SecureRandom(),
    ): JSONObject {
        val recoveryBytes = Base64.decode(recoveryKey, Base64.NO_WRAP)
        require(recoveryBytes.size == 32) { "backup_invalid_recovery_key" }
        val dek = ByteArray(32).also(random::nextBytes)
        try {
            val digest = Base64.encodeToString(
                MessageDigest.getInstance("SHA-256").digest(plaintext),
                Base64.NO_WRAP,
            )
            val manifest = JSONObject(sourceManifest.toString())
                .put("format", "backup-encryption-v2")
                .put("plaintextSha256", digest)
            val aad = manifest.toString().toByteArray(Charsets.UTF_8)
            val payload = encrypt(dek, plaintext, aad, random)
            val wrapped = encrypt(recoveryBytes, dek, aad, random)
            return JSONObject()
                .put("manifest", manifest)
                .put("payload", JSONObject().put("algorithm", "AES-256-GCM")
                    .put("nonce", encode(payload.first)).put("ciphertext", encode(payload.second)))
                .put("keyEnvelopes", JSONObject().put("recovery", JSONObject()
                    .put("algorithm", "AES-256-GCM")
                    .put("wrappedDek", JSONObject().put("algorithm", "AES-256-GCM")
                        .put("nonce", encode(wrapped.first)).put("ciphertext", encode(wrapped.second)))))
        } finally {
            dek.fill(0)
            recoveryBytes.fill(0)
        }
    }

    private fun encrypt(
        key: ByteArray,
        plaintext: ByteArray,
        aad: ByteArray,
        random: SecureRandom,
    ): Pair<ByteArray, ByteArray> {
        val nonce = ByteArray(12).also(random::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))
        cipher.updateAAD(aad)
        return nonce to cipher.doFinal(plaintext)
    }

    private fun encode(value: ByteArray): String = Base64.encodeToString(value, Base64.NO_WRAP)
}
