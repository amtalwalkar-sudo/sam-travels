package in.samtravels.app
import android.os.Bundle
import com.getcapacitor.BridgeActivity
class MainActivity:BridgeActivity(){override fun onCreate(savedInstanceState:Bundle?){registerPlugin(RoomStorePlugin::class.java);super.onCreate(savedInstanceState)}}