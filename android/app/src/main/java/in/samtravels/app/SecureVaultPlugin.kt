package `in`.samtravels.app
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
@CapacitorPlugin(name="SecureVault")
class SecureVaultPlugin:Plugin(){
 private val alias="sam-travels-token-v1"
 private fun key():SecretKey{val store=KeyStore.getInstance("AndroidKeyStore").apply{load(null)};val existing=store.getKey(alias,null) as? SecretKey;if(existing!=null)return existing;val generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");generator.init(KeyGenParameterSpec.Builder(alias,KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build());return generator.generateKey()}
 @PluginMethod fun set(call:PluginCall){val name=call.getString("name");val value=call.getString("value");if(name.isNullOrBlank()||value==null){call.reject("Credential name and value are required");return};try{val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());val encrypted=cipher.iv+cipher.doFinal(value.toByteArray(Charsets.UTF_8));context.getSharedPreferences("sam_travels_secure",0).edit().putString(name,Base64.encodeToString(encrypted,Base64.NO_WRAP)).apply();call.resolve()}catch(e:Exception){call.reject("Secure credential write failed",e)}}
 @PluginMethod fun get(call:PluginCall){val name=call.getString("name");if(name.isNullOrBlank()){call.reject("Credential name required");return};try{val encoded=context.getSharedPreferences("sam_travels_secure",0).getString(name,null);val out=JSObject();if(encoded!=null){val bytes=Base64.decode(encoded,Base64.NO_WRAP);val iv=bytes.copyOfRange(0,12);val payload=bytes.copyOfRange(12,bytes.size);val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),javax.crypto.spec.GCMParameterSpec(128,iv));out.put("value",String(cipher.doFinal(payload),Charsets.UTF_8))};call.resolve(out)}catch(e:Exception){call.reject("Secure credential read failed",e)}}
 @PluginMethod fun remove(call:PluginCall){val name=call.getString("name");if(name.isNullOrBlank()){call.reject("Credential name required");return};context.getSharedPreferences("sam_travels_secure",0).edit().remove(name).apply();call.resolve()}
}