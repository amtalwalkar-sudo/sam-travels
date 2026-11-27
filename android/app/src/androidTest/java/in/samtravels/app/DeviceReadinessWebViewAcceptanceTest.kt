package `in`.samtravels.app

import android.content.Intent
import android.view.KeyEvent
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
            assertTrue("Driver workspace must load before settings are reviewed; page=" + evaluate(view, "document.body.innerText"),
                evaluate(view, "!!document.querySelector('.driver-card')") == "true")
            assertTrue("Phone settings entry point must render",
                evaluate(view, "!!document.querySelector('.device-readiness-trigger')") == "true")
            evaluate(view, "document.querySelector('.device-readiness-trigger')?.click()")
            assertTrue("Rendered readiness dialog must expose settings and a continue action",
                evaluate(view, "!!document.querySelector('[role=dialog]') && !!document.querySelector('.device-readiness-footer button')") == "true")
            evaluate(view, """
                (() => {
                  const plugin = window.Capacitor?.Plugins?.DeviceReadiness;
                  if (!plugin) return false;
                  window.__nativeResumeEvents = 0;
                  window.__resumeListenerReady = false;
                  plugin.addListener("appResume", () => {
                    window.__nativeResumeEvents += 1;
                  }).then(() => { window.__resumeListenerReady = true; });
                  const openSetting = plugin.openSetting.bind(plugin);
                  plugin.openSetting = options => openSetting(options).then(result => {
                    window.__settingResult = result;
                    return result;
                  });
                  return true;
                })()
            """.trimIndent())
            val listenerDeadline = System.currentTimeMillis() + 5_000
            while (System.currentTimeMillis() < listenerDeadline &&
                evaluate(view, "window.__resumeListenerReady === true") != "true") Thread.sleep(50)
            assertTrue("Native resume observer must be registered before opening Settings",
                evaluate(view, "window.__resumeListenerReady === true") == "true")
            val resumeEventsBeforeSettings = evaluate(view, "window.__nativeResumeEvents || 0").trim('"').toInt()
            assertTrue("Location settings action must be rendered",
                evaluate(view, "[...document.querySelectorAll('.device-readiness-item')].some(n => n.innerText.includes('Precise location access'))") == "true")
            evaluate(view, "[...document.querySelectorAll('.device-readiness-item')].find(n => n.innerText.includes('Precise location access'))?.click()")
            val settingsDeadline = System.currentTimeMillis() + 10_000
            while (System.currentTimeMillis() < settingsDeadline && activity.hasWindowFocus()) Thread.sleep(100)
            assertTrue("Selecting Precise location access must hand off to Android Settings", !activity.hasWindowFocus())
            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
            val returnDeadline = System.currentTimeMillis() + 10_000
            while (System.currentTimeMillis() < returnDeadline && !activity.hasWindowFocus()) Thread.sleep(100)
            assertTrue("App must regain focus after returning from Android Settings", activity.hasWindowFocus())
            val recheckDeadline = System.currentTimeMillis() + 10_000
            var resumeEventsAfterReturn = resumeEventsBeforeSettings
            while (System.currentTimeMillis() < recheckDeadline && resumeEventsAfterReturn <= resumeEventsBeforeSettings) {
                resumeEventsAfterReturn = evaluate(view, "window.__nativeResumeEvents || 0").trim('"').toInt()
                Thread.sleep(100)
            }
            assertTrue("Returning from Settings must deliver the native resume event that refreshes readiness",
                resumeEventsAfterReturn > resumeEventsBeforeSettings)
            assertTrue("Native Settings handoff must report success",
                evaluate(view, "window.__settingResult?.opened === true") == "true")
            evaluate(view, "document.querySelector('.device-readiness-footer button')?.click()")
            assertTrue("Continuing must close the prompt without blocking driver entry",
                evaluate(view, "!document.querySelector('[role=dialog]') && !!document.querySelector('.driver-card')") == "true")
        } finally {
            instrumentation.runOnMainSync { activity.finish() }
        }
    }
}
