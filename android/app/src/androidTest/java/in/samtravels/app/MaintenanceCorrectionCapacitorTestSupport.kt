package `in`.samtravels.app

import android.os.SystemClock
import android.webkit.WebView
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

internal fun maintenanceEnvelope(
  id: String,
  timestamp: String,
  data: JSONObject,
  createdBy: JSONObject? = null,
): StoredRecord {
  val record = JSONObject().put("id", id).put("schemaVersion", 1)
    .put("createdAt", timestamp).put("updatedAt", timestamp).put("source", "android")
    .put("revision", 1).put("data", data)
  if (createdBy != null) record.put("createdBy", createdBy)
  return StoredRecord(id, record.toString(), 1, timestamp)
}

internal fun evaluateMaintenanceWebView(activity: MainActivity, script: String): Boolean {
  val instrumentation = InstrumentationRegistry.getInstrumentation()
  val result = AtomicReference<String?>()
  val latch = CountDownLatch(1)
  instrumentation.runOnMainSync {
    activity.getBridge().getWebView().evaluateJavascript(script) {
      result.set(it)
      latch.countDown()
    }
  }
  return latch.await(5, TimeUnit.SECONDS) && result.get() == "true"
}

internal fun awaitMaintenanceJavascript(activity: MainActivity, expression: String, timeoutMs: Long): Boolean {
  val instrumentation = InstrumentationRegistry.getInstrumentation()
  val webView: WebView = activity.getBridge().getWebView()
  val deadline = SystemClock.uptimeMillis() + timeoutMs
  while (SystemClock.uptimeMillis() < deadline) {
    val result = AtomicReference<String?>()
    val latch = CountDownLatch(1)
    instrumentation.runOnMainSync {
      webView.evaluateJavascript("Boolean($expression)") {
        result.set(it)
        latch.countDown()
      }
    }
    if (latch.await(2, TimeUnit.SECONDS) && result.get() == "true") return true
    SystemClock.sleep(100)
  }
  return false
}
