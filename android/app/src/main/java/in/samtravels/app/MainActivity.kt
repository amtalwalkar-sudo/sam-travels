package `in`.samtravels.app
import android.os.Bundle
import com.getcapacitor.BridgeActivity
class MainActivity:BridgeActivity(){override fun onCreate(savedInstanceState:Bundle?){registerPlugin(RoomStorePlugin::class.java);registerPlugin(DriverWorkflowPlugin::class.java);super.onCreate(savedInstanceState)}}