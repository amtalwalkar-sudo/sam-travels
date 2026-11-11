package `in`.samtravels.app

import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView

/** Compact-bubble creation and presentation-only drag/dock interactions. */
internal object DriverOverlayMinimizer {
    fun minimize(
        context: Context,
        window: WindowManager,
        elapsedText: () -> String,
        dp: (Int) -> Int,
        restorePanel: () -> Unit,
        onAttachmentFailure: () -> Unit,
        onAttached: (TextView, WindowManager.LayoutParams) -> Unit,
    ) {
        val chip = TextView(context).apply {
            text = "⏱ " + elapsedText()
            textSize = 13f
            setTextColor(android.graphics.Color.WHITE)
            setBackgroundColor(android.graphics.Color.rgb(24, 54, 74))
            setPadding(dp(12), dp(10), dp(12), dp(10))
            contentDescription = "Driver controls minimized. Tap to reopen"
            isClickable = true
            isFocusable = true
            var bubbleDownX = 0f
            var bubbleDownY = 0f
            var bubbleStartX = 0
            var bubbleStartY = 0
            var bubbleDragged = false
            setOnTouchListener { view, event ->
                android.util.Log.i("DriverOverlayService", "bubble_touch action=${event.actionMasked} x=${event.rawX} y=${event.rawY}")
                val params = bubbleParams ?: return@setOnTouchListener false
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        bubbleDownX = event.rawX
                        bubbleDownY = event.rawY
                        bubbleStartX = params.x
                        bubbleStartY = params.y
                        bubbleDragged = false
                        true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = event.rawX - bubbleDownX
                        val dy = event.rawY - bubbleDownY
                        if (kotlin.math.abs(dx) > dp(10) || kotlin.math.abs(dy) > dp(10)) {
                            bubbleDragged = true
                            moveBubbleWithinUsableBounds(params, bubbleStartX + dx.toInt(), bubbleStartY + dy.toInt())
                        }
                        true
                    }
                    MotionEvent.ACTION_UP -> {
                        if (bubbleDragged) dockBubbleToNearestEdge(params) else view.performClick()
                        true
                    }
                    MotionEvent.ACTION_CANCEL -> true
                    else -> true
                }
            }
            setOnClickListener {
                android.util.Log.i("DriverOverlayService", "bubble_click")
                restorePanel()
            }
        }
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
            gravity = Gravity.START or Gravity.CENTER_VERTICAL
            x = 0
            y = 0
        }
        onAttached(chip, params)
        try {
            window.addView(chip, params)
            android.util.Log.i("DriverOverlayService", "bubble_attached view=${chip.hashCode()} x=${params.x} y=${params.y}")
        } catch (error: Exception) {
            android.util.Log.e("DriverOverlayService", "Bubble attachment failed", error)
            onAttachmentFailure()
        }
    }
}
