package `in`.samtravels.app

import android.content.Context
import android.os.Handler
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.text.InputType
import java.math.BigDecimal
import java.util.concurrent.Executor

/** Focused native presentation adapter for the shared cancellation-fee v1 form. */
class DriverCancellationFeePanel(
    private val context:Context,
    private val db:LocalDatabase,
    private val executor:Executor,
    private val main:Handler,
    private val onRefresh:(String)->Unit,
) {
    private var tripId:String?=null
    private var label:TextView?=null
    private var input:EditText?=null
    private var saveButton:Button?=null
    private var hasLocalEdits=false
    private var suppressChanges=false

    fun attach(root:LinearLayout) {
        label=TextView(context).apply {
            text="Cancellation fee required";textSize=12f
            setTextColor(android.graphics.Color.rgb(24,54,74));visibility=View.GONE
        }
        root.addView(label)
        input=EditText(context).apply {
            hint="Cancellation fee (₹)"
            inputType=InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
            contentDescription="Required cancellation fee in rupees"
            visibility=View.GONE
            addTextChangedListener(object:TextWatcher {
                override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){}
                override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){}
                override fun afterTextChanged(s:Editable?) {
                    if(suppressChanges)return
                    hasLocalEdits=true
                    val currentTrip=tripId?:return
                    val paise=parsePaise(s?.toString().orEmpty())
                    saveButton?.isEnabled=paise!=null
                    executor.execute { runCatching { DriverCancellationFeeStore.updateCancellationFeeDraft(db,currentTrip,paise) } }
                }
            })
        }
        root.addView(input,LinearLayout.LayoutParams(dp(210),dp(48)))
        saveButton=Button(context).apply {
            text="Save cancellation fee";visibility=View.GONE
            setOnClickListener { submit() }
        }
        root.addView(saveButton)
    }

    fun render(
        currentTripId:String?,feePaise:Long?,visible:Boolean,canSubmit:Boolean,
        window:WindowManager,panel:View?,params:WindowManager.LayoutParams?,
    ) {
        if(tripId!=currentTripId)hasLocalEdits=false
        tripId=currentTripId
        label?.visibility=if(visible)View.VISIBLE else View.GONE
        input?.visibility=if(visible)View.VISIBLE else View.GONE
        saveButton?.visibility=if(visible)View.VISIBLE else View.GONE
        val text=feePaise?.let{BigDecimal.valueOf(it,2).setScale(2).toPlainString()}.orEmpty()
        if(!hasLocalEdits&&input?.text?.toString()!=text) {
            suppressChanges=true
            input?.setText(text)
            input?.setSelection(input?.text?.length?:0)
            suppressChanges=false
        }
        saveButton?.isEnabled=if(hasLocalEdits)parsePaise(input?.text?.toString().orEmpty())!=null else canSubmit
        params?.let {
            it.flags=if(visible)it.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE.inv()
                else it.flags or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
            runCatching { panel?.let { view -> window.updateViewLayout(view,it) } }
        }
    }

    private fun parsePaise(value:String):Long? {
        if(!value.matches(Regex("\\d+(\\.\\d{1,2})?")))return null
        return runCatching{BigDecimal(value).movePointRight(2).longValueExact()}.getOrNull()?.takeIf{it>=0L}
    }

    private fun submit() {
        val currentTrip=tripId?:return
        val fee=parsePaise(input?.text?.toString().orEmpty())
        if(fee==null) { label?.text="Enter a valid fee; ₹0 is allowed";return }
        saveButton?.isEnabled=false
        executor.execute {
            try {
                NativeStartupRecovery.ensure(db)
                DriverCancellationFeeStore.updateCancellationFeeDraft(db,currentTrip,fee)
                DriverCancellationFeeStore.submitCancellationFee(db,currentTrip,fee)
                main.post { hasLocalEdits=false;onRefresh("Cancellation fee saved") }
            } catch(error:Exception) {
                main.post { onRefresh("Cancellation fee not saved · "+(error.message?:"retry")) }
            }
        }
    }

    private fun dp(value:Int)=(value*context.resources.displayMetrics.density).toInt()
}
