package `in`.samtravels.app

import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertTrue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Shared Android WebView acceptance mechanics, kept outside the scenario test's architecture budget. */
internal open class RestoredRoomPerformanceWebViewAcceptanceSupport {
    protected fun envelope(
        id: String,
        data: JSONObject,
        createdAt: String,
        updatedAt: String = createdAt,
        revision: Int = 1,
        businessDate: String? = null,
    ): JSONObject = JSONObject()
        .put("id", id)
        .put("schemaVersion", 1)
        .put("createdAt", createdAt)
        .put("updatedAt", updatedAt)
        .put("source", "integration")
        .put("revision", revision)
        .apply { if (businessDate != null) put("businessDate", businessDate) }
        .put("data", data)
    protected fun snapshot(database: LocalDatabase) =
        NativeSnapshotBuilder.build(database, NativeBackupRecovery::isInternalRecord, "android-webview-acceptance")
    protected fun recordGraph(bundle: NativeSnapshotBundle): Map<String, String> {
        val records = bundle.snapshot.getJSONArray("records")
        return (0 until records.length()).associate { index ->
            val row = records.getJSONObject(index)
            row.getString("id") to row.getString("json")
        }
    }
    protected fun findWebView(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) {
            for (index in 0 until view.childCount) {
                findWebView(view.getChildAt(index))?.let { return it }
            }
        }
        return null
    }
    protected fun evaluate(webView: WebView, script: String): String {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val latch = CountDownLatch(1)
        val result = AtomicReference<String>()
        instrumentation.runOnMainSync {
            webView.evaluateJavascript(script) { value ->
                result.set(value)
                latch.countDown()
            }
        }
        assertTrue("WebView JavaScript evaluation timed out", latch.await(15, TimeUnit.SECONDS))
        return result.get() ?: error("WebView JavaScript returned no value")
    }
    protected fun waitFor(webView: WebView, timeoutSeconds: Long = 60, predicate: (JSONObject) -> Boolean): JSONObject {
        val deadline = SystemClock.elapsedRealtime() + TimeUnit.SECONDS.toMillis(timeoutSeconds)
        var last = JSONObject()
        while (SystemClock.elapsedRealtime() < deadline) {
            val raw = evaluate(webView, """
                (() => ({
                  ready: document.readyState,
                  body: document.body?.innerText || "",
                  performance: document.querySelector("#performance-dashboard-title")?.innerText || "",
                  lifetime: document.querySelector(".performance-lifetime-grid")?.innerText || "",
                  error: document.querySelector(".performance-error")?.innerText || ""
                }))()
            """.trimIndent())
            last = JSONObject(raw)
            if (predicate(last)) return last
            SystemClock.sleep(300)
        }
        throw AssertionError("Timed out waiting for WebView acceptance condition. Last DOM: ${last}")
    }

}
