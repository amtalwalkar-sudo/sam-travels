package `in`.samtravels.app

import android.content.Context
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class PerformanceActiveDrivingDayRoomParityTest {
    @Test fun roomRecordsProduceTheSameActiveDayCountAndBusinessKmAverageAsPwa() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val fixture = instrumentation.context.assets.open("driver-workflow-parity-v1.json")
            .bufferedReader().use { JSONObject(it.readText()) }
            .getJSONObject("activeDrivingDay")
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        var webView: WebView? = null
        try {
            val vehicleId = fixture.getString("vehicleId")
            val operationalDate = fixture.getString("operationalDate")
            val shiftId = fixture.getString("shiftId")
            val dailyId = "work:daily-business-km:" + java.net.URLEncoder.encode(vehicleId, "UTF-8")
                .replace("+", "%20") + ":" + operationalDate
            val tripId = "work:trip-financial-obligation:" + fixture.getString("tripId")
            val createdAt = fixture.getString("tripCreatedAt")
            val dailyEnvelope = JSONObject().put("id", dailyId).put("schemaVersion", 1)
                .put("createdAt", createdAt).put("updatedAt", fixture.getString("tripCompletedAt"))
                .put("source", "integration").put("revision", 4)
                .put("businessDate", operationalDate)
                .put("data", JSONObject().put("schemaVersion", 1)
                    .put("kind", "daily_business_kilometres").put("vehicleId", vehicleId)
                    .put("operationalDate", operationalDate)
                    .put("totalBusinessKm", fixture.getInt("businessKm")).put("unallocatedBusinessKm", 0)
                    .put("entries", JSONArray().put(JSONObject().put("shiftId", shiftId)
                        .put("allocationStatus", "allocated").put("businessKm", fixture.getInt("businessKm"))
                        .put("personalKm", fixture.getInt("personalKm")))))
            val tripEnvelope = JSONObject().put("id", tripId).put("schemaVersion", 1)
                .put("createdAt", createdAt).put("updatedAt", fixture.getString("tripCompletedAt"))
                .put("source", "integration").put("revision", 2).put("businessDate", operationalDate)
                .put("data", JSONObject().put("schemaVersion", 1).put("kind", "completed_ride_financials")
                    .put("status", "submitted").put("createdAt", createdAt)
                    .put("completedAt", fixture.getString("tripCompletedAt"))
                    .put("tripContext", JSONObject().put("schemaVersion", 1).put("shiftId", shiftId)
                        .put("driverId", fixture.getString("driverId"))
                        .put("assignmentId", fixture.getString("assignmentId"))
                        .put("vehicleId", vehicleId).put("operationalDate", operationalDate)))
            db.records().put(StoredRecord(dailyId, dailyEnvelope.toString(), 1, fixture.getString("tripCompletedAt")))
            db.records().put(StoredRecord(tripId, tripEnvelope.toString(), 1, fixture.getString("tripCompletedAt")))

            val roomRows = db.records().list()
            val dailyRows = JSONArray().put(JSONObject(roomRows.single { it.id == dailyId }.json))
            val tripRows = JSONArray().put(JSONObject(roomRows.single { it.id == tripId }.json))
            val input = JSONObject().put("vehicleId", vehicleId)
                .put("from", operationalDate).put("to", fixture.getString("followingOperationalDate"))
                .put("dailyDistanceRecords", dailyRows).put("tripFinancialRecords", tripRows)

            val pageLoaded = CountDownLatch(1)
            instrumentation.runOnMainSync {
                webView = WebView(context).apply {
                    settings.javaScriptEnabled = true
                    webViewClient = object : WebViewClient() {
                        override fun onPageFinished(view: WebView?, url: String?) {
                            pageLoaded.countDown()
                        }
                    }
                    loadDataWithBaseURL("https://localhost/", "<html><body></body></html>",
                        "text/html", "UTF-8", null)
                }
            }
            assertTrue("WebView parity page did not load", pageLoaded.await(15, TimeUnit.SECONDS))
            val projectionScript = instrumentation.context.assets.open("full-cost-work-distance-projection.js")
                .bufferedReader().use { it.readText() }
            val scriptLoaded = CountDownLatch(1)
            instrumentation.runOnMainSync {
                webView!!.evaluateJavascript(projectionScript) { scriptLoaded.countDown() }
            }
            assertTrue("Shared Work-distance projection did not load", scriptLoaded.await(15, TimeUnit.SECONDS))

            val calculation = """
                (() => {
                  const result = window.FullCostWorkDistanceParity.buildFullCostWorkDistanceProjectionV1($input);
                  const activeDrivingDayCount = [...result.activityByDate.values()]
                    .filter(bucket => bucket.activeDrivingDay).length;
                  const totalBusinessKm = [...result.distanceByDate.values()]
                    .reduce((sum, item) => sum + item.businessKm, 0);
                  return {
                    activeDrivingDayCount,
                    totalBusinessKm,
                    averageBusinessKmPerActiveDrivingDay: activeDrivingDayCount > 0
                      ? totalBusinessKm / activeDrivingDayCount : null,
                    issues: result.activeDaySourceIssues
                  };
                })()
            """.trimIndent()
            val calculated = CountDownLatch(1)
            var resultJson: String? = null
            instrumentation.runOnMainSync {
                webView!!.evaluateJavascript(calculation) { value ->
                    resultJson = value
                    calculated.countDown()
                }
            }
            assertTrue("Room active-day projection did not complete", calculated.await(15, TimeUnit.SECONDS))
            val result = JSONObject(resultJson ?: error("Room projection returned no result"))
            assertEquals(fixture.getInt("expectedActiveDrivingDayCount"), result.getInt("activeDrivingDayCount"))
            assertEquals(fixture.getInt("expectedTotalBusinessKm"), result.getInt("totalBusinessKm"))
            assertEquals(fixture.getInt("expectedAverageBusinessKmPerActiveDrivingDay"),
                result.getInt("averageBusinessKmPerActiveDrivingDay"))
            assertEquals(0, result.getJSONArray("issues").length())
        } finally {
            instrumentation.runOnMainSync { webView?.destroy() }
            db.close()
        }
    }
}
