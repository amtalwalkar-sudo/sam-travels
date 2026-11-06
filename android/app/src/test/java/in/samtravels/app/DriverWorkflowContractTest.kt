package `in`.samtravels.app

import org.json.JSONObject
import org.junit.Assert.assertThrows
import org.junit.Test

class DriverWorkflowContractTest {
    private fun command() = JSONObject(
        """{
          "schemaVersion":1,"commandId":"command-1","eventId":"event-1",
          "eventType":"shift_start","originSurface":"pwa",
          "transitionAt":"2026-11-06T08:00:00Z","expectedPriorState":"idle",
          "expectedRevision":0,"idempotencyKey":"idem-1"
        }""",
    )

    private fun intent() = JSONObject()
        .put("command", command())
        .put("status", "pending_location")
        .put("createdAt", "2026-11-06T08:00:00Z")
        .put("updatedAt", "2026-11-06T08:00:00Z")

    private fun event() = JSONObject()
        .put("eventId", "event-1")
        .put("command", command())
        .put("gps", JSONObject(
            """{"latitude":19.076,"longitude":72.8777,"horizontalAccuracyM":8,"fixAt":"2026-11-06T08:00:00Z","provider":"test"}""",
        ))
        .put("committedAt", "2026-11-06T08:00:01Z")
        .put("revision", 1)

    @Test
    fun acceptsCurrentCommandIntentStateEventAndOutboxContracts() {
        DriverWorkflowContract.validateCommand(command())
        DriverWorkflowContract.validateIntent(intent())
        DriverWorkflowContract.validateState(JSONObject("""{"schemaVersion":1,"revision":0,"state":"idle"}"""))
        DriverWorkflowContract.validateEvent(event())
        DriverWorkflowContract.validateOutbox(JSONObject(
            """{"id":"driver-state:1","eventId":"event-1","revision":1,"integrationId":"logbook.work-driver-events.v1","contractVersion":1,"eventName":"work.driver-event-committed","payloadVersion":1,"delivered":false,"createdAt":"2026-11-06T08:00:01Z"}""",
        ))
    }

    @Test
    fun rejectsUnknownEventStateAndIntentDiscriminants() {
        assertThrows(IllegalArgumentException::class.java) {
            DriverWorkflowContract.validateCommand(command().put("eventType", "unknown"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            DriverWorkflowContract.validateCommand(command().put("expectedPriorState", "unknown"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            DriverWorkflowContract.validateIntent(intent().put("status", "unknown"))
        }
    }

    @Test
    fun rejectsMismatchedEventIdentityRevisionAndGpsEvidence() {
        assertThrows(IllegalArgumentException::class.java) {
            DriverWorkflowContract.validateEvent(event().put("eventId", "other-event"))
        }
        assertThrows(IllegalArgumentException::class.java) {
            DriverWorkflowContract.validateEvent(event().put("revision", 2))
        }
        assertThrows(IllegalArgumentException::class.java) {
            DriverWorkflowContract.validateEvent(event().put(
                "gps",
                JSONObject("""{"latitude":19.076,"longitude":72.8777,"horizontalAccuracyM":80,"fixAt":"2026-11-06T08:00:00Z","provider":"test"}"""),
            ))
        }
    }
}
