package `in`.samtravels.app

import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Rendered acceptance for the Android Device Readiness prompt in the real Capacitor WebView. */
@RunWith(AndroidJUnit4::class)
class DeviceReadinessWebViewAcceptanceTest {
    private fun findWebView(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (i in 0 until view.childCount) {
            findWebView(view.getChildAt(i))?.let { return it }
        }
        return null
    }

    private fun evaluate(webView: WebView, script: String): String {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val latch = CountDownLatch(1)
        val result = AtomicReference<String>()
        instrumentation.runOnMainSync {
            webView.evaluateJavascript(script) { value -> result.set(value); latch.countDown() }
        }
        assertTrue("Device Readiness WebView script timed out", latch.await(15, TimeUnit.SECONDS))
        return result.get() ?: error("WebView returned no result")
    }

    @Test fun promptRendersAndOptionalSettingsNeverBlockDriverEntry() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val app = instrumentation.targetContext.applicationContext
        val activity = instrumentation.startActivitySync(
            Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        ) as MainActivity
        try {
            val deadline = System.currentTimeMillis() + 30_000
            var webView: WebView? = null
            while (System.currentTimeMillis() < deadline && webView == null) {
                instrumentation.waitForIdleSync()
                webView = findWebView(activity.window.decorView)
                Thread.sleep(100)
            }
            val view = webView ?: error("Capacitor WebView was not attached")
            val loaded = System.currentTimeMillis() + 30_000
            while (System.currentTimeMillis() < loaded) {
                val ready = evaluate(view, "document.readyState === 'complete' && !!document.querySelector('.driver-card')")
                if (ready == "true") break
                Thread.sleep(200)
            }
            assertTrue("Driver workspace must load before settings are reviewed",
                evaluate(view, "!!document.querySelector('.driver-card')") == "true")
            assertTrue("Phone settings entry point must render",
                evaluate(view, "!!document.querySelector('.device-readiness-trigger')") == "true")
            evaluate(view, "document.querySelector('.device-readiness-trigger')?.click()")
            assertTrue("Rendered readiness dialog must expose settings and a continue action",
                evaluate(view, "!!document.querySelector('[role=dialog]') && !!document.querySelector('.device-readiness-footer button')") == "true")
            evaluate(view, "document.querySelector('.device-readiness-footer button')?.click()")
            assertTrue("Continuing must close the prompt without blocking driver entry",
                evaluate(view, "!document.querySelector('[role=dialog]') && !!document.querySelector('.driver-card')") == "true")
        } finally {
            instrumentation.runOnMainSync { activity.finish() }
        }
    }
}
