package `in`.samtravels.app

import android.content.Context
import android.graphics.Rect
import android.view.Gravity
import android.view.View
import android.view.WindowManager

/** Clamp presentation-only overlay movement to the usable viewport and dock compact bubbles. */
internal object DriverOverlayBoundsGestures {
    /** Clamp overlay coordinates to the display's currently visible (system-bar-excluded) frame. */
    fun usableBounds(context: Context, view: View): android.graphics.Rect {
        val bounds = android.graphics.Rect()
        view.getWindowVisibleDisplayFrame(bounds)
        if (bounds.width() <= 0 || bounds.height() <= 0) {
            val metrics = context.resources.displayMetrics
            bounds.set(0, 0, metrics.widthPixels, metrics.heightPixels)
        }
        return bounds
    }

    fun movePanelWithinUsableBounds(context: Context, window: WindowManager, current: View, params: WindowManager.LayoutParams, x: Int, y: Int, dp: (Int) -> Int) {
        val bounds = usableBounds(context, current)
        params.gravity = Gravity.START or Gravity.TOP
        params.x = x.coerceIn(0, (bounds.width() - current.width).coerceAtLeast(0))
        params.y = y.coerceIn(0, (bounds.height() - current.height).coerceAtLeast(0))
        runCatching { window.updateViewLayout(current, params) }
    }

    fun moveBubbleWithinUsableBounds(context: Context, window: WindowManager, current: View, params: WindowManager.LayoutParams, x: Int, y: Int, dp: (Int) -> Int) {
        val bounds = usableBounds(context, current)
        params.gravity = Gravity.START or Gravity.TOP
        params.x = x.coerceIn(0, (bounds.width() - current.width).coerceAtLeast(0))
        params.y = y.coerceIn(0, (bounds.height() - current.height).coerceAtLeast(0))
        runCatching { window.updateViewLayout(current, params) }
    }

    /** On release, dock to the nearest horizontal edge while retaining a clamped vertical position. */
    fun dockBubbleToNearestEdge(context: Context, window: WindowManager, current: View, params: WindowManager.LayoutParams) {
        val bounds = usableBounds(context, current)
        params.gravity = Gravity.START or Gravity.TOP
        val left = params.x
        val right = (bounds.width() - current.width).coerceAtLeast(0)
        params.x = if (left + current.width / 2 < bounds.width() / 2) 0 else right
        params.y = params.y.coerceIn(0, (bounds.height() - current.height).coerceAtLeast(0))
        runCatching { window.updateViewLayout(current, params) }
        android.util.Log.i("DriverOverlayService", "bubble_docked edge=${if (params.x == 0) "left" else "right"} x=${params.x} y=${params.y}")
    }

}
