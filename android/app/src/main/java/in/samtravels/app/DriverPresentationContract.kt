package `in`.samtravels.app

import android.content.Context
import android.graphics.Color
import org.json.JSONObject

/** Reads the shared visual-token contract; this adapter never owns workflow or form rules. */
internal class DriverPresentationContract private constructor(
    val surface: Int,
    val surfaceRaised: Int,
    val border: Int,
    val text: Int,
    val textStrong: Int,
    val accent: Int,
    val accentSoft: Int,
    val dangerSurface: Int,
    val dangerBorder: Int,
    val dangerText: Int,
    val hint: Int,
    val disabledOpacity: Float,
    val cardRadius: Int,
    val fieldRadius: Int,
    val buttonRadius: Int,
    val overlayPanelPadding: Int,
    val overlayCompactPadding: Int,
    val fieldGap: Int,
    val fieldHeight: Int,
    val swipeHeight: Int,
    val overlayWidth: Int,
    val overlayMaxHeight: Int,
    val headingSp: Float,
    val labelSp: Float,
    val strongLabelSp: Float,
    val hintSp: Float,
    val formHeadingSp: Float,
) {
    companion object {
        private const val ASSET = "driver-presentation-v1.json"

        fun fromAssets(context: Context): DriverPresentationContract =
            context.assets.open(ASSET).bufferedReader().use { parse(JSONObject(it.readText())) }

        internal fun parse(json: JSONObject): DriverPresentationContract {
            require(json.optString("contractId") == "sam-travels.driver-presentation")
            require(json.optInt("version", -1) == 1)
            val colors = json.getJSONObject("colors")
            val shape = json.getJSONObject("shape")
            val spacing = json.getJSONObject("spacing")
            val sizing = json.getJSONObject("sizing")
            val type = json.getJSONObject("typography")
            val states = json.getJSONObject("visualStates")
            require(states.has("default") && states.has("pending") && states.has("success") &&
                states.has("error") && states.has("disabled"))
            fun color(key: String) = Color.parseColor(colors.getString(key))
            val opacity = colors.getDouble("disabledOpacity").toFloat()
            require(opacity in 0f..1f)
            fun positive(source: JSONObject, key: String) = source.getInt(key).also { require(it > 0) }
            return DriverPresentationContract(
                color("surface"), color("surfaceRaised"), color("border"), color("text"),
                color("textStrong"), color("accent"), color("accentSoft"), color("dangerSurface"),
                color("dangerBorder"), color("dangerText"), color("hint"), opacity,
                positive(shape, "cardRadius"), positive(shape, "fieldRadius"), positive(shape, "buttonRadius"),
                positive(spacing, "overlayPanelPadding"), positive(spacing, "overlayCompactPadding"),
                positive(spacing, "fieldGap"), positive(sizing, "fieldHeight"), positive(sizing, "swipeHeight"),
                positive(sizing, "overlayWidth"), positive(sizing, "overlayMaxHeight"),
                type.getInt("headingSp").toFloat(), type.getInt("labelSp").toFloat(),
                type.getInt("strongLabelSp").toFloat(), type.getInt("hintSp").toFloat(),
                type.getInt("formHeadingSp").toFloat(),
            )
        }
    }
}
