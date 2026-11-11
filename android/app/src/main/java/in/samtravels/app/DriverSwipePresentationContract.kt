package `in`.samtravels.app

import android.content.Context
import org.json.JSONObject

/** Runtime reader for the exact versioned swipe contract also consumed by the PWA. */
internal class DriverSwipePresentationContract private constructor(
    private val actions: Map<String, Action>,
    private val secondaryActions: Map<String, Action>,
    val completionPercent: Int,
    val minimumIntentTravelDp: Int,
) {
    data class Action(val label: String, val eventType: String)

    fun action(state: String): Action? = actions[state]
    fun secondaryAction(state: String): Action? = secondaryActions[state]

    companion object {
        private const val ASSET = "driver-swipe-presentation-v1.json"

        fun fromAssets(context: Context): DriverSwipePresentationContract =
            context.assets.open(ASSET).bufferedReader().use { parse(JSONObject(it.readText())) }

        internal fun parse(json: JSONObject): DriverSwipePresentationContract {
            require(json.optString("contractId") == "sam-travels.driver-swipe-presentation")
            require(json.optInt("version", -1) == 1)
            require(json.optString("workflowAuthority") == "docs/DRIVER_WORKFLOW_CONTRACT.md")
            require(json.optString("semantics").isNotBlank())
            val gesture = json.getJSONObject("gesture")
            require(gesture.optString("axis") == "horizontal")
            require(gesture.optString("direction") == "left-to-right")
            require(gesture.optBoolean("oneActionPerGesture"))
            val resetOn = gesture.getJSONArray("resetOn").let { array -> (0 until array.length()).map { array.getString(it) }.toSet() }
            require(resetOn.containsAll(setOf("cancel", "incomplete", "disabled", "state-change", "blur")))
            val webTravel = gesture.getJSONObject("minimumIntentTravel").getInt("webCssPx")
            require(webTravel > 0)
            val completion = gesture.getInt("completionPercent")
            val travel = gesture.getJSONObject("minimumIntentTravel").getInt("nativeDp")
            require(completion in 1..100 && travel > 0)
            val actions = readActions(json.getJSONObject("actions"))
            val secondary = readActions(json.getJSONObject("secondaryActions"))
            require(actions.keys == setOf("shift_active", "going_to_pickup", "trip_active"))
            require(actions.values.map { it.eventType }.toSet() == setOf("trip_create", "start_ride", "end_ride"))
            require(secondary.keys == setOf("going_to_pickup"))
            require(secondary.getValue("going_to_pickup").eventType == "cancel_ride")
            return DriverSwipePresentationContract(actions, secondary, completion, travel)
        }

        private fun readActions(source: JSONObject): Map<String, Action> {
            val result = linkedMapOf<String, Action>()
            val keys = source.keys()
            while (keys.hasNext()) {
                val state = keys.next()
                val item = source.getJSONObject(state)
                val label = item.getString("label").trim()
                val event = item.getString("eventType").trim()
                require(label.isNotEmpty() && event.isNotEmpty())
                result[state] = Action(label, event)
            }
            return result
        }
    }
}
