package `in`.samtravels.app
import android.os.Bundle
import com.getcapacitor.BridgeActivity
class MainActivity:BridgeActivity(){override fun onCreate(savedInstanceState:Bundle?){registerPlugin(RoomStorePlugin::class.java);registerPlugin(DriverWorkflowPlugin::class.java);registerPlugin(SecureVaultPlugin::class.java);registerPlugin(BackupPlugin::class.java);super.onCreate(savedInstanceState)}}
