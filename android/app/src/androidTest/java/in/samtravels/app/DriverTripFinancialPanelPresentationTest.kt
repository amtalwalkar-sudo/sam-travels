package `in`.samtravels.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Spinner
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Exercises the production native overlay form views and their Room-backed submit path. */
class DriverTripFinancialPanelPresentationTest {
    @Test fun renderedOverlayRequiresFareAndIndependentPayersThenSubmitsZeroFare() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val db = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        val executor = Executors.newSingleThreadExecutor()
        val submitted = CountDownLatch(1)
        try {
            val now = java.time.Instant.now().toString()
            DriverTripFinancialStore.createPendingObligation(
                db, "overlay-ui-trip", "overlay-ui-end-ride", now, null,
            )
            val obligation = DriverTripFinancialStore.pendingObligations(db).single()
            val draft = DriverTripFinancialStore.ensureDraft(db, "overlay-ui-trip")
            val root = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
            val panel = DriverTripFinancialPanel(
                context, db, executor, Handler(Looper.getMainLooper()),
            ) { submitted.countDown() }
            val window = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager

            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                panel.attach(root)
                panel.render(
                    listOf(JSONObject().put("obligation", obligation).put("draft", draft)),
                    false, window, root, null,
                )
            }
            InstrumentationRegistry.getInstrumentation().waitForIdleSync()

            fun allViews(parent: ViewGroup): List<View> =
                (0 until parent.childCount).flatMap { index ->
                    val child = parent.getChildAt(index)
                    listOf(child) + if (child is ViewGroup) allViews(child) else emptyList()
                }

            lateinit var fare: EditText
            lateinit var toll: EditText
            lateinit var tollPayer: Spinner
            lateinit var parking: EditText
            lateinit var parkingPayer: Spinner
            lateinit var submit: Button
            lateinit var optional: Button
            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                val views = allViews(root)
                fare = views.filterIsInstance<EditText>().single { it.hint == "Fare (₹)" }
                toll = views.filterIsInstance<EditText>().single { it.hint == "Toll (₹)" }
                parking = views.filterIsInstance<EditText>().single { it.hint == "Parking (₹)" }
                tollPayer = views.filterIsInstance<Spinner>().first()
                parkingPayer = views.filterIsInstance<Spinner>().last()
                submit = views.filterIsInstance<Button>().single { it.text == "Submit trip financials" }
                optional = views.filterIsInstance<Button>().single { it.text == "Add Toll / Parking (optional)" }
                assertFalse("Missing Fare must block submission", submit.isEnabled)
                optional.performClick()
                fare.setText("0")
                toll.setText("12.34")
                assertFalse("Toll amount without its own payer must block submission", submit.isEnabled)
                tollPayer.setSelection(1)
                // The test root is intentionally not attached to a WindowManager;
                // dispatch the same AdapterView callback a real attached Spinner
                // emits after the user confirms a selection.
                tollPayer.onItemSelectedListener?.onItemSelected(
                    tollPayer, null, 1, tollPayer.selectedItemId,
                )
                parking.setText("2.50")
                assertFalse("Parking amount without its own payer must block submission", submit.isEnabled)
                parkingPayer.setSelection(2)
                parkingPayer.onItemSelectedListener?.onItemSelected(
                    parkingPayer, null, 2, parkingPayer.selectedItemId,
                )
            }
            InstrumentationRegistry.getInstrumentation().waitForIdleSync()
            InstrumentationRegistry.getInstrumentation().runOnMainSync {
                assertTrue(
                    "Explicit zero Fare and independently assigned payers must enable submit; " +
                        "fare='" + fare.text + "' toll='" + toll.text + "' tollPayer=" + tollPayer.selectedItemPosition +
                        " parking='" + parking.text + "' parkingPayer=" + parkingPayer.selectedItemPosition +
                        " submitEnabled=" + submit.isEnabled,
                    submit.isEnabled,
                )
                submit.performClick()
            }

            assertTrue("Native form submission should return completion feedback", submitted.await(5, TimeUnit.SECONDS))
            val saved = DriverTripFinancialStore.pendingObligations(db)
            assertTrue("Submitted obligation must no longer be pending", saved.isEmpty())
            val row = db.records().get("work:trip-financial-obligation:overlay-ui-trip")
            assertNotNull(row)
            val data = JSONObject(row!!.json).getJSONObject("data")
            assertEquals("submitted", data.getString("status"))
            assertEquals(0L, data.getLong("farePaise"))
            assertEquals(1234L, data.getLong("tollPaise"))
            assertEquals("driver", data.getString("tollPayer"))
            assertEquals(250L, data.getLong("parkingPaise"))
            assertEquals("customer", data.getString("parkingPayer"))
        } finally {
            executor.shutdownNow()
            db.close()
        }
    }
}
