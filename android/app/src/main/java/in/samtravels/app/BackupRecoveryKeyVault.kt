package `in`.samtravels.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Device-protected copy of the user's portable backup recovery key.
 *
 * The key-encryption key is Android Keystore generated and never exported.
 * Only ciphertext is persisted in SharedPreferences. A device lock / Keystore
 * availability failure is intentionally propagated so WorkManager can retry.
 */
internal class BackupRecoveryKeyVault(context: Context) {
    private val preferences = context.getSharedPreferences("sam_travels_backup_key_v1", Context.MODE_PRIVATE)

    fun store(recoveryKey: String) {
        val raw = try { Base64.decode(recoveryKey, Base64.NO_WRAP) } catch (_: IllegalArgumentException) {
            throw IllegalArgumentException("Invalid backup recovery key encoding")
        }
        require(raw.size == 32) { "Backup recovery key must contain 256 bits" }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val encrypted = cipher.iv + cipher.doFinal(raw)
        check(preferences.edit().putString(ENTRY, Base64.encodeToString(encrypted, Base64.NO_WRAP)).commit()) {
            "Unable to persist encrypted backup recovery key"
        }
        raw.fill(0)
    }

    fun read(): String? {
        val encoded = preferences.getString(ENTRY, null) ?: return null
        val encrypted = Base64.decode(encoded, Base64.NO_WRAP)
        require(encrypted.size > IV_BYTES) { "Stored backup recovery key is truncated" }
        val iv = encrypted.copyOfRange(0, IV_BYTES)
        val ciphertext = encrypted.copyOfRange(IV_BYTES, encrypted.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(TAG_BITS, iv))
        val raw = cipher.doFinal(ciphertext)
        try {
            require(raw.size == 32) { "Stored backup recovery key has invalid length" }
            return Base64.encodeToString(raw, Base64.NO_WRAP)
        } finally {
            raw.fill(0)
        }
    }

    fun remove() {
        check(preferences.edit().remove(ENTRY).commit()) { "Unable to remove backup recovery key" }
    }

    private fun getOrCreateKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val ANDROID_KEY_STORE = "AndroidKeyStore"
        const val KEY_ALIAS = "sam-travels-backup-recovery-v1"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val ENTRY = "encrypted_recovery_key"
        const val IV_BYTES = 12
        const val TAG_BITS = 128
    }
}
