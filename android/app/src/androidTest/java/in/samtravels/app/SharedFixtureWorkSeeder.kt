package `in`.samtravels.app

import org.json.JSONObject

/** Seeds the shared fixture's committed, acknowledged, pending and recoverable Work states through Room. */
internal object SharedFixtureWorkSeeder {
    fun seed(database: LocalDatabase, workFixture: JSONObject) {
        DriverWorkflowIdentityTestFixtures.seed(database, "driver-001", "synthetic-person-001")
        val transitionsJson = workFixture.getJSONArray("committedTransitions")
        val transitions = (0 until transitionsJson.length()).map { index ->
            val item = transitionsJson.getJSONObject(index)
            Triple(item.getString("type"), item.getString("id"), item.getString("at")) to item
        }
        for ((transition, item) in transitions) {
            val (eventType, eventId, transitionAt) = transition
            val current = DriverWorkflowStore.snapshot(database)
            val command = JSONObject().put("schemaVersion", 1).put("commandId", eventId).put("eventId", eventId)
                .put("eventType", eventType).put("originSurface", "pwa").put("transitionAt", transitionAt)
                .put("expectedPriorState", current.getString("state")).put("expectedRevision", current.getInt("revision"))
                .put("idempotencyKey", eventId)
            if (item.optInt("workflowVersion", 1) == 2) {
                command.put("workflowVersion", 2)
                item.optJSONObject("odometer")?.let { command.put("odometer", JSONObject(it.toString())) }
                item.optJSONObject("driverContext")?.let { command.put("driverContext", JSONObject(it.toString())) }
                item.optJSONObject("tripContext")?.let { command.put("tripContext", JSONObject(it.toString())) }
            }
            val gps = JSONObject().put("latitude", 19.076).put("longitude", 72.8777).put("horizontalAccuracyM", 8)
                .put("fixAt", transitionAt).put("provider", "android-test")
            DriverWorkflowStore.queue(database, command, java.time.Instant.parse(transitionAt))
            DriverWorkflowStore.complete(database, eventId, gps, java.time.Instant.parse(transitionAt))
            val expectedOutbox = (0 until workFixture.getJSONArray("outboxStates").length())
                .map { workFixture.getJSONArray("outboxStates").getJSONObject(it) }
                .firstOrNull { it.optString("eventId") == eventId }
            if (expectedOutbox?.optBoolean("delivered") == true) DriverWorkflowOutbox.markEventDelivered(database, eventId)
        }
        val intentStates = workFixture.getJSONArray("intentStates")
        for (index in 0 until intentStates.length()) {
            val scenario = intentStates.getJSONObject(index)
            if (scenario.optString("status") == "recorded") continue
            val eventId = scenario.getString("eventId")
            val transitionAt = scenario.getString("transitionAt")
            val current = DriverWorkflowStore.snapshot(database)
            val command = JSONObject().put("schemaVersion", 1).put("commandId", eventId).put("eventId", eventId)
                .put("eventType", scenario.getString("eventType")).put("originSurface", "pwa").put("transitionAt", transitionAt)
                .put("expectedPriorState", current.getString("state")).put("expectedRevision", current.getInt("revision"))
                .put("idempotencyKey", eventId)
            DriverWorkflowStore.queue(database, command, java.time.Instant.parse(transitionAt))
            if (scenario.optString("status") == "needs_attention") {
                val reason = scenario.getString("reason")
                DriverWorkflowStore.markNeedsAttention(database, eventId, reason)
                DriverWorkflowStore.reactivate(database, eventId)
                DriverWorkflowStore.markNeedsAttention(database, eventId, reason)
            }
        }

        val financial = workFixture.getJSONObject("tripFinancial")
        val tripId = financial.getString("tripId")
        DriverTripFinancialStore.ensureDraft(database, tripId)
        val draftId = "__sam_travels_form_working_copy__:work.trip-completed-financials:$tripId"
        val draftRow = database.records().get(draftId) ?: error("fixture_trip_financial_draft_missing")
        val draftEnvelope = JSONObject(draftRow.json)
        val draft = draftEnvelope.getJSONObject("data")
            .put("operationId", financial.getString("operationId"))
        draftEnvelope.put("revision", draftEnvelope.optInt("revision") + 1)
            .put("updatedAt", financial.getString("submittedAt")).put("data", draft)
        database.records().put(StoredRecord(draftId, draftEnvelope.toString(), draftRow.schemaVersion, financial.getString("submittedAt")))
        val values = financial.getJSONObject("values")
        DriverTripFinancialStore.updateDraft(database, tripId, JSONObject(values.toString()))
        DriverTripFinancialStore.submit(database, tripId, JSONObject(values.toString()))
    }
}
