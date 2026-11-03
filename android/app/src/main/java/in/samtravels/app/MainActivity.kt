package `in`.samtravels.app

import android.content.Intent
import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(RoomStorePlugin::class.java)
        registerPlugin(DriverWorkflowPlugin::class.java)
        registerPlugin(SecureVaultPlugin::class.java)
        registerPlugin(BackupPlugin::class.java)
        persistDropboxCallback(intent)
        super.onCreate(savedInstanceState)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        persistDropboxCallback(intent)
    }

    private fun persistDropboxCallback(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme != "samtravels" || uri.host != "oauth") return
        getSharedPreferences("sam_travels_oauth", MODE_PRIVATE)
            .edit()
            .putString("pending_callback_url", uri.toString())
            .apply()
    }
}
