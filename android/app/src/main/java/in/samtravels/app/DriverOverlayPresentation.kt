package `in`.samtravels.app

import android.content.Context
import android.graphics.PixelFormat
import android.content.res.ColorStateList
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView
import java.util.concurrent.Executor

/**
 * Owns only the native overlay's disposable presentation and WindowManager views.
 * Workflow commands, durable state, GPS, recovery, and service lifecycle remain in
 * DriverOverlayService and are reached only through callbacks.
 */
internal class DriverOverlayPresentation(
    private val context: Context,
    private val db: LocalDatabase,
    private val executor: Executor,
    private val main: Handler,
    private val swipePresentation: DriverSwipePresentationContract,
    private val elapsedText: () -> String,
    private val onRefresh: (String?) -> Unit,
    private val onSwipeTransition: () -> Unit,
    private val onTransition: (String) -> Unit,
    private val onRecovery: () -> Unit,
    private val onAttachmentFailure: () -> Unit,
) {
    private val visual = DriverPresentationContract.fromAssets(context)

    lateinit var window: WindowManager
        private set
    var panel: LinearLayout? = null
        private set
    var panelParams: WindowManager.LayoutParams? = null
        private set
    var bubble: TextView? = null
        private set
    private var bubbleParams: WindowManager.LayoutParams? = null

    var status: TextView? = null
        private set
    var recoveryButton: Button? = null
        private set
    private var swipeLabel: TextView? = null
    private var swipeBar: SeekBar? = null
    private var cancelButton: Button? = null
    private var timerText: TextView? = null
    private var cancellationFeePanel: DriverCancellationFeePanel? = null
    private var tripFinancialPanel: DriverTripFinancialPanel? = null

    private val timerTick = object : Runnable {
        override fun run() {
            updateTimer(elapsedText())
            main.postDelayed(this, 1000)
        }
    }

    fun showPanel() {
        if (panel != null) return
        window = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            background = GradientDrawable().apply { setColor(visual.surfaceRaised); cornerRadius = dp(visual.cardRadius).toFloat(); setStroke(dp(1), visual.border) }
        }
        val content = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(visual.overlayPanelPadding), dp(visual.overlayPanelPadding), dp(visual.overlayPanelPadding), dp(visual.overlayPanelPadding))
        }
        val scroll = ScrollView(context).apply {
            isFillViewport = false
            clipToPadding = false
        }
        scroll.addView(content, ViewGroup.LayoutParams(-1, -2))
        root.addView(scroll, LinearLayout.LayoutParams(dp(visual.overlayWidth), dp(visual.overlayMaxHeight)))

        val headerRow = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val header = TextView(context).apply {
            text = "Sam Travels · Driver"
            textSize = visual.headingSp
            setTextColor(visual.textStrong)
        }
        status = header
        headerRow.addView(header, LinearLayout.LayoutParams(0, dp(40), 1f))
        // Header-only drag handling keeps buttons, sliders, and form fields from
        // accidentally becoming presentation gesture targets.
        var panelDownX = 0f
        var panelDownY = 0f
        var panelStartX = 0
        var panelStartY = 0
        var panelGestureMoved = false
        header.setOnTouchListener { view, event ->
            android.util.Log.i("DriverOverlayService", "header_touch action=${event.actionMasked} rawX=${event.rawX} rawY=${event.rawY}")
            val params = panelParams ?: return@setOnTouchListener false
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    panelDownX = event.rawX
                    panelDownY = event.rawY
                    panelStartX = params.x
                    panelStartY = params.y
                    panelGestureMoved = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - panelDownX
                    val dy = event.rawY - panelDownY
                    val threshold = dp(12)
                    if (kotlin.math.abs(dx) > threshold || kotlin.math.abs(dy) > threshold) {
                        panelGestureMoved = true
                        if (dy < -dp(72) && kotlin.math.abs(dy) > kotlin.math.abs(dx) * 1.2f) {
                            android.util.Log.i("DriverOverlayService", "header_swipe_minimize dy=$dy dx=$dx")
                            minimizePanel()
                            return@setOnTouchListener true
                        }
                        DriverOverlayBoundsGestures.movePanelWithinUsableBounds(context, window, panel ?: return@setOnTouchListener true, params, panelStartX + dx.toInt(), panelStartY + dy.toInt(), ::dp)
                    }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (!panelGestureMoved && event.actionMasked == MotionEvent.ACTION_UP) view.performClick()
                    true
                }
                else -> true
            }
        }
        val minimize = Button(context).apply {
            text = "Minimize"
            textSize = 11f
            isAllCaps = false
            contentDescription = "Minimize controls"
            setOnClickListener { minimizePanel() }
        }
        headerRow.addView(minimize, LinearLayout.LayoutParams(-2, dp(40)))
        content.addView(headerRow)

        val elapsed = TextView(context).apply {
            text = "00:00:00"
            textSize = visual.headingSp + 4f
            setTextColor(visual.textStrong)
            setPadding(2, 6, 2, 6)
        }
        timerText = elapsed
        content.addView(elapsed)

        val label = TextView(context).apply {
            text = "Swipe to Going to pickup"
            textSize = visual.labelSp
            setTextColor(visual.textStrong)
            setPadding(2, 10, 2, 4)
        }
        swipeLabel = label
        content.addView(label)

        val slider = SeekBar(context).apply {
            max = 100
            progress = 0
            progressTintList = ColorStateList.valueOf(visual.accent)
            thumbTintList = ColorStateList.valueOf(visual.accent)
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(bar: SeekBar?, progress: Int, fromUser: Boolean) {}
                override fun onStartTrackingTouch(bar: SeekBar?) {}
                override fun onStopTrackingTouch(bar: SeekBar?) { bar?.progress = 0 }
            })
        }
        var swipeStartX: Float? = null
        var swipeMoved = false
        slider.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    swipeStartX = event.rawX
                    swipeMoved = false
                }
                MotionEvent.ACTION_MOVE -> {
                    val start = swipeStartX
                    if (start != null && event.rawX - start >= dp(swipePresentation.minimumIntentTravelDp)) {
                        swipeMoved = true
                    }
                }
                MotionEvent.ACTION_UP -> {
                    val confirmed = swipeMoved && slider.progress >= swipePresentation.completionPercent
                    swipeStartX = null
                    swipeMoved = false
                    if (confirmed) onSwipeTransition()
                    slider.progress = 0
                }
                MotionEvent.ACTION_CANCEL -> {
                    swipeStartX = null
                    swipeMoved = false
                    slider.progress = 0
                }
            }
            false
        }
        swipeBar = slider
        content.addView(slider, LinearLayout.LayoutParams(dp(visual.overlayWidth - visual.overlayPanelPadding * 2), dp(visual.swipeHeight)))

        val cancel = Button(context).apply {
            text = swipePresentation.secondaryAction("going_to_pickup")?.label ?: "Cancel ride"
            textSize = visual.labelSp
            setTextColor(visual.dangerText)
            backgroundTintList = ColorStateList.valueOf(visual.dangerSurface)
            minHeight = dp(visual.fieldHeight)
            setOnClickListener {
                onTransition(swipePresentation.secondaryAction("going_to_pickup")?.eventType ?: return@setOnClickListener)
            }
        }
        cancelButton = cancel
        content.addView(cancel)

        cancellationFeePanel = DriverCancellationFeePanel(context, db, executor, main) { message ->
            onRefresh(message)
        }.also { it.attach(content) }
        tripFinancialPanel = DriverTripFinancialPanel(context, db, executor, main) { message ->
            onRefresh(message)
        }.also { it.attach(content) }
        recoveryButton = Button(context).apply {
            text = "Retry pending action"
            setOnClickListener { onRecovery() }
            isEnabled = false
        }
        content.addView(recoveryButton)

        panel = root
        val type = if (Build.VERSION.SDK_INT >= 26) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            WindowManager.LayoutParams.TYPE_PHONE
        }
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
            x = 12
            y = 0
        }
        panelParams = params
        try {
            window.addView(root, params)
            android.util.Log.i("DriverOverlayService", "panel_attached root=" + root.hashCode())
            onRefresh(null)
            main.removeCallbacks(timerTick)
            main.post(timerTick)
        } catch (error: Exception) {
            android.util.Log.e("DriverOverlayService", "Window attachment failed", error)
            panel = null
            panelParams = null
            onAttachmentFailure()
        }
    }

    fun render(
        state: String,
        revision: Int,
        pending: Boolean,
        expiredPending: Boolean,
        financialPending: Boolean,
        canSwipe: Boolean,
        feeTripId: String?,
        feePaise: Long?,
        feeCanSubmit: Boolean,
        completedFinancialForms: List<org.json.JSONObject>,
        message: String?,
    ) {
        if (state == "idle") {
            removePanel()
            return
        }
        val baseStatus = "Sam Travels · " + state.replace("_", " ") + " · r" + revision
        val nextStatus = message ?: if (pending) {
            "Action awaiting GPS · " + state.replace("_", " ")
        } else if (expiredPending) {
            baseStatus + " · previous GPS action expired"
        } else {
            baseStatus
        }
        if (status?.text?.toString() != nextStatus) {
            status?.text = nextStatus
            status?.announceForAccessibility(nextStatus)
        }
        val swipeAction = swipePresentation.action(state)
        val swipeText = swipeAction?.let { "Swipe to " + it.label }
        swipeLabel?.text = swipeText ?: "Trip action unavailable"
        swipeLabel?.contentDescription = swipeText ?: "Trip action unavailable"
        swipeBar?.contentDescription = swipeText ?: "Trip action unavailable"
        swipeLabel?.visibility = if (swipeText == null) View.GONE else View.VISIBLE
        swipeBar?.visibility = if (swipeText == null) View.GONE else View.VISIBLE
        swipeBar?.progress = 0
        swipeBar?.isEnabled = canSwipe
        swipeBar?.animate()?.alpha(if (canSwipe) 1f else visual.disabledOpacity)?.setDuration(visual.motionDurationMs.toLong())
        swipeLabel?.setTextColor(if (canSwipe) visual.state("default").text else visual.state("disabled").text)
        status?.setTextColor(if (pending) visual.state("pending").text else if (expiredPending) visual.state("error").text else visual.state("default").text)
        cancelButton?.visibility = if (state == "going_to_pickup") View.VISIBLE else View.GONE
        cancelButton?.isEnabled = !pending && !financialPending && state == "going_to_pickup"
        cancellationFeePanel?.render(
            feeTripId, feePaise, financialPending, feeCanSubmit,
            window, panel, panelParams,
        )
        tripFinancialPanel?.render(completedFinancialForms, financialPending, window, panel, panelParams)
    }

    fun setSavingStatus() {
        status?.text = "Saving action · GPS pending"
        main.post {
            swipeBar?.isEnabled = false
            cancelButton?.isEnabled = false
        }
    }

    fun setRecoveryBlocked() {
        status?.text = "Recovery required · actions disabled"
        recoveryButton?.isEnabled = false
    }

    fun minimizePanel() {
        val current = panel ?: return
        runCatching { window.removeView(current) }
        panel = null
        panelParams = null
        DriverOverlayMinimizer.minimize(
            context, window, elapsedText, ::dp, ::restorePanel,
            { bubble = null; bubbleParams = null; onAttachmentFailure() },
            { chip, params -> bubble = chip; bubbleParams = params },
            { bubbleParams },
        )
    }

    private fun restorePanel() {
        android.util.Log.i("DriverOverlayService", "restore_requested bubble=${bubble?.hashCode()}")
        bubble?.let { runCatching { window.removeView(it) } }
        bubble = null
        bubbleParams = null
        showPanel()
        android.util.Log.i("DriverOverlayService", "restore_finished panelAttached=${panel != null}")
    }

    fun updateTimer(value: String) {
        timerText?.text = value
        bubble?.text = "⏱ " + value
    }

    fun removePanel() {
        main.removeCallbacks(timerTick)
        if (::window.isInitialized) {
            panel?.let { try { window.removeView(it) } catch (_: Exception) {} }
            bubble?.let { try { window.removeView(it) } catch (_: Exception) {} }
        }
        panel = null
        panelParams = null
        bubble = null
        bubbleParams = null
    }

    private fun dp(value: Int): Int =
        (value * context.resources.displayMetrics.density).toInt()
}
