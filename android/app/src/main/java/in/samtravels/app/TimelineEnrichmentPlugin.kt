package `in`.samtravels.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/** Platform bridge for explicit scheduling and UI notification of durable enrichment work. */
@CapacitorPlugin(name = "TimelineEnrichment")
class TimelineEnrichmentPlugin : Plugin() {
    private var receiver: BroadcastReceiver? = null

    override fun load() {
        super.load()
        val listener = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                notifyListeners("enrichmentChanged", JSObject())
            }
        }
        receiver = listener
        val filter = IntentFilter(ACTION_CHANGED)
        if (Build.VERSION.SDK_INT >= 33) {
            context.registerReceiver(listener, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("DEPRECATION")
            context.registerReceiver(listener, filter)
        }
    }

    override fun handleOnDestroy() {
        receiver?.let { runCatching { context.unregisterReceiver(it) } }
        receiver = null
        super.handleOnDestroy()
    }

    @PluginMethod
    fun schedule(call: PluginCall) {
        TimelineEnrichmentScheduler.schedule(context)
        call.resolve()
    }

    companion object {
        const val ACTION_CHANGED = "in.samtravels.app.TIMELINE_ENRICHMENT_CHANGED"
    }
}
