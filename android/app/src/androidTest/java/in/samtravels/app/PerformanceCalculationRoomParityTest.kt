package `in`.samtravels.app

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PerformanceCalculationRoomParityTest {
    @Test fun roomPreservesTheSameSharedPerformanceFixtureEnvelopes() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val fixture = InstrumentationRegistry.getInstrumentation().context.assets.open("performance-calculation-v1-parity.json")
            .bufferedReader().use { JSONObject(it.readText()) }
        val records = fixture.getJSONArray("records")
        val expected = fixture.getJSONObject("expected")
        val db = Room.inMemoryDatabaseBuilder(context, LocalDatabase::class.java)
            .allowMainThreadQueries().build()
        val backupParticipants = listOf(
            NativeVehicleBackup.register(),
            NativeComplianceBackup.register(),
            NativeFinanceBackup.register(),
            NativeBusinessExpensesBackup.register(),
            NativePerformanceBackup.register(),
        )
        try {
            val recordsById = mutableMapOf<String, JSONObject>()
            for (index in 0 until records.length()) {
                val record = records.getJSONObject(index)
                RecordEnvelopeContract.validate(record)
                db.records().put(StoredRecord(
                    record.getString("id"),
                    record.toString(),
                    record.getInt("schemaVersion"),
                    record.getString("updatedAt"),
                ))
            }
            assertEquals(records.length(), db.records().list().size)
            for (index in 0 until records.length()) {
                val source = records.getJSONObject(index)
                val restored = db.records().get(source.getString("id"))
                assertNotNull(restored)
                val restoredEnvelope = JSONObject(restored!!.json)
                assertEquals(source.getString("id"), restoredEnvelope.getString("id"))
                assertEquals(source.getInt("revision"), restoredEnvelope.getInt("revision"))
                assertEquals(source.getJSONObject("data").toString(),
                    restoredEnvelope.getJSONObject("data").toString())
                // All subsequent source/provenance checks must resolve against
                // the envelope actually read back from Room, never the fixture
                // object that was originally inserted.
                recordsById[restoredEnvelope.getString("id")] = restoredEnvelope
            }
            val backupRows = JSONArray()
            for (index in 0 until records.length()) {
                val source = records.getJSONObject(index)
                val id = source.getString("id")
                val participant = when {
                    id.startsWith("feature:vehicle:") -> "vehicle-records"
                    id.startsWith("feature:compliance:") -> "compliance-records"
                    id.startsWith("feature:finance:loan:") -> "finance-records"
                    id.startsWith("feature:business-expenses:") -> "business-expenses-records"
                    id.startsWith("feature:performance:") -> "performance-records"
                    else -> "platform-records"
                }
                backupRows.put(JSONObject()
                    .put("id", id)
                    .put("json", source.toString())
                    .put("schemaVersion", source.getInt("schemaVersion"))
                    .put("updatedAt", source.getString("updatedAt"))
                    .put("participantId", participant))
            }
            NativeBackupCoverage.validateBusinessRecords(backupRows, requireExplicitOwnerTags = true)

            // Bind each Performance recovery member to the exact persisted
            // source envelope and immutable source revision restored by Room.
            val recoverySources = fixture.getJSONObject("input").getJSONArray("preBusinessRecovery")
            val totals = mutableMapOf("manual" to 0, "emi" to 0, "compliance" to 0)
            val businessStartDate = fixture.getJSONObject("input").getString("businessStartDate")
            for (index in 0 until recoverySources.length()) {
                val source = recoverySources.getJSONObject(index)
                val sourceId = source.getString("sourceId")
                val origin = source.getString("origin")
                val amount = source.getInt("amountPaise")
                totals[origin] = (totals[origin] ?: 0) + amount
                if (origin == "manual" || origin == "compliance") {
                    val record = recordsById[sourceId] ?: throw AssertionError("missing recovery source $sourceId")
                    assertEquals(source.getInt("revision"), record.getInt("revision"))
                    val data = record.getJSONObject("data")
                    val amountField = if (origin == "manual") "amountPaise" else "totalCostPaise"
                    assertEquals(amount, data.getInt(amountField))
                    if (origin == "compliance") {
                        assertEquals(true, data.getString("validFrom") < businessStartDate)
                    }
                } else {
                    val match = Regex("^(.*):emi:(\\d+):v(\\d+)$").matchEntire(sourceId)
                        ?: throw AssertionError("invalid EMI source identity $sourceId")
                    val loan = recordsById[match.groupValues[1]]
                        ?: throw AssertionError("missing loan source $sourceId")
                    assertEquals(source.getInt("revision"), loan.getInt("revision"))
                    val schedules = loan.getJSONObject("data").getJSONArray("scheduleVersions")
                    val schedule = (0 until schedules.length()).map { schedules.getJSONObject(it) }
                        .first { it.getInt("version") == match.groupValues[3].toInt() }
                    val rows = schedule.getJSONObject("output").getJSONArray("rows")
                    val installment = (0 until rows.length()).map { rows.getJSONObject(it) }
                        .first { it.getInt("installmentNumber") == match.groupValues[2].toInt() }
                    assertEquals(amount, installment.getInt("installmentAmountPaise"))
                    assertEquals(true, installment.getString("dueDate") < businessStartDate)
                    assertEquals(source.getInt("scheduleVersion"), schedule.getInt("version"))
                }
            }
            val expectedSources = expected.getJSONObject("recoverySources")
            assertEquals(expectedSources.getInt("manual"), totals["manual"])
            assertEquals(expectedSources.getInt("emi"), totals["emi"])
            assertEquals(expectedSources.getInt("compliance"), totals["compliance"])
            assertEquals(expected.getInt("recoveryTotalPaise"), totals.values.sum())


            // Verify every persisted correction chain against its restored target,
            // correction sequence and authoritative chain-head record.
            val correctionHeads = fixture.getJSONObject("populatedGraph").getJSONObject("lineage")
                .getJSONArray("correctionChainHeads")
            for (index in 0 until correctionHeads.length()) {
                val expectedHead = correctionHeads.getJSONObject(index)
                val targetId = expectedHead.getString("targetRecordId")
                val target = recordsById[targetId] ?: throw AssertionError("missing corrected target $targetId")
                val featureId = expectedHead.getString("featureId")
                val corrections = recordsById.values
                    .filter { it.optJSONObject("data")?.optString("featureId") == featureId &&
                        it.optJSONObject("data")?.optString("targetRecordId") == targetId &&
                        it.getString("id").startsWith("historical-correction:") }
                    .sortedBy { it.getJSONObject("data").getInt("chainRevision") }
                assertEquals(expectedHead.getInt("chainRevision"), corrections.size)
                var previousAfter: Any? = null
                corrections.forEachIndexed { correctionIndex, envelope ->
                    val correction = envelope.getJSONObject("data")
                    assertEquals(target.getInt("revision"), correction.getInt("targetRecordRevision"))
                    assertEquals(correctionIndex + 1, correction.getInt("chainRevision"))
                    if (correctionIndex > 0) {
                        assertEquals(previousAfter.toString(), correction.get("beforeValue").toString())
                        assertEquals(corrections[correctionIndex - 1].getJSONObject("data")
                            .getString("correctionId"), correction.getString("supersedesCorrectionId"))
                    }
                    previousAfter = correction.get("afterValue")
                }
                val headId = "historical-correction-chain:" + java.net.URLEncoder
                    .encode(targetId, "UTF-8").replace("+", "%20")
                val head = recordsById[headId] ?: throw AssertionError("missing correction chain head $headId")
                assertEquals(expectedHead.getInt("chainRevision"), head.getJSONObject("data").getInt("chainRevision"))
                assertEquals(expectedHead.getString("headCorrectionId"), head.getJSONObject("data").getString("headCorrectionId"))
                assertEquals(expectedHead.getInt("chainRevision"), head.getInt("revision"))
            }

            // Maintenance accrual provenance must resolve to the exact Room
            // daily-km envelope revision and effective-dated rate snapshot.
            val allRecords = fixture.getJSONObject("populatedGraph").getJSONArray("records")
            for (index in 0 until allRecords.length()) {
                val source = allRecords.getJSONObject(index)
                if (!source.getString("id").startsWith("feature:maintenance:daily-accrual:")) continue
                val accrual = source.getJSONObject("data")
                val dailyKm = recordsById[accrual.getString("dailyBusinessKmRecordId")]
                    ?: throw AssertionError("missing daily-km source")
                assertEquals(accrual.getInt("dailyBusinessKmRevision"), dailyKm.getInt("revision"))
                assertEquals(accrual.getString("operationalDate"), dailyKm.getJSONObject("data").getString("operationalDate"))
                assertEquals(accrual.getInt("businessKm"), dailyKm.getJSONObject("data").getInt("totalBusinessKm"))
                assertEquals(0, dailyKm.getJSONObject("data").getInt("unallocatedBusinessKm"))
                assertEquals(accrual.getInt("amountPaise"),
                    accrual.getInt("businessKm") * accrual.getInt("ratePaisePerKm"))
            }

            // Finance transaction provenance binds payment/reversal, prepayment
            // schedule revision and settlement cutoff to the persisted loan.
            val financeLineage = fixture.getJSONObject("populatedGraph").getJSONObject("lineage")
                .getJSONObject("finance")
            val loan = recordsById[financeLineage.getString("loanId")]
                ?: throw AssertionError("missing Finance loan")
            val ledger = recordsById[financeLineage.getString("paymentLedgerId")]
                ?: throw AssertionError("missing Finance payment ledger")
            val prepayment = recordsById[financeLineage.getString("prepaymentRecordId")]
                ?: throw AssertionError("missing Finance prepayment")
            assertEquals(true, financeLineage.getBoolean("closedLoan"))
            assertEquals("closed", loan.getJSONObject("data").getString("lifecycleState"))
            assertEquals(financeLineage.getInt("prepaymentRevision"), prepayment.getJSONObject("data").getJSONArray("revisions").getJSONObject(0).getInt("version"))
            val settlement = ledger.getJSONObject("data").getJSONArray("entries").let { entries ->
                (0 until entries.length()).map { entries.getJSONObject(it) }
                    .first { it.getString("kind") == "settlement" }
            }
            assertEquals(financeLineage.getString("settlementEntryId"), settlement.getString("id"))
            assertEquals(financeLineage.getInt("settlementScheduleVersion"), settlement.getInt("scheduleVersion"))

            // These expected values are consumed by the TypeScript browser test,
            // which runs the shared platform-neutral calculation against this
            // same fixture. Room must preserve the exact source records supplied
            // to that calculation, including source revisions.
            assertEquals(23_400, expected.getInt("recoveryTotalPaise"))
            assertEquals("2027-09-15", expected.getString("recoveryToExclusive"))
            assertEquals(2_600, expected.getInt("lifetimeProfitPaise"))
            assertEquals(902_419, expected.getInt("lifetimeTargetPaise"))
            assertEquals(27_400, expected.getInt("lifetimeCostPaise"))
            assertEquals(-899_819, expected.getInt("lifetimeTargetPositionPaise"))
        } finally {
            backupParticipants.asReversed().forEach { it.close() }
            db.close()
        }
    }
}
