package `in`.samtravels.app

import android.content.Context
import android.os.Handler
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.view.WindowManager
import android.widget.*
import android.text.InputType
import org.json.JSONObject
import java.math.BigDecimal
import java.util.concurrent.Executor

/** Native presentation adapter for the shared work.trip-completed-financials v1 definition. */
class DriverTripFinancialPanel(
 private val context:Context, private val db:LocalDatabase, private val executor:Executor,
 private val main:Handler, private val onRefresh:(String)->Unit,
) {
 private val rows=linkedMapOf<String,TripForm>()
 private var heading:TextView?=null
 private var container:LinearLayout?=null

 fun attach(root:LinearLayout) {
  heading=TextView(context).apply{text="Fare and trip financials";textSize=12f;visibility=View.GONE}
  root.addView(heading)
  container=LinearLayout(context).apply{orientation=LinearLayout.VERTICAL;visibility=View.GONE}
  root.addView(container)
 }

 fun render(forms:List<JSONObject>,window:WindowManager,panel:View?,params:WindowManager.LayoutParams?) {
  val ids=forms.mapNotNull{it.optJSONObject("obligation")?.optJSONObject("data")?.optString("tripId")?.takeIf{value->value.isNotBlank()}}.toSet()
  rows.keys.filter{it !in ids}.forEach{id->container?.removeView(rows.remove(id)?.root)}
  forms.forEach { entry ->
   val obligation=entry.optJSONObject("obligation")?:return@forEach
   val data=obligation.optJSONObject("data")?:return@forEach
   val tripId=data.optString("tripId")
   if(tripId.isBlank())return@forEach
   val form=rows.getOrPut(tripId){TripForm(tripId).also{container?.addView(it.root)}}
   form.render(entry.optJSONObject("draft")?:JSONObject())
  }
  val visible=rows.isNotEmpty()
  heading?.visibility=if(visible)View.VISIBLE else View.GONE
  container?.visibility=if(visible)View.VISIBLE else View.GONE
  params?.let {
   it.flags=if(visible)it.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE.inv()
    else it.flags or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
   runCatching{panel?.let{view->window.updateViewLayout(view,it)}}
  }
 }

 private inner class TripForm(private val tripId:String) {
  val root=LinearLayout(context).apply{orientation=LinearLayout.VERTICAL;setPadding(0,dp(8),0,dp(8))}
  private val title=TextView(context).apply{text="Fare required · "+tripId;textSize=12f}
  private val fare=amountInput("Fare (₹)")
  private val optionalToggle=Button(context).apply{text="Add Toll / Parking (optional)"}
  private val optional=LinearLayout(context).apply{orientation=LinearLayout.VERTICAL;visibility=View.GONE}
  private val toll=amountInput("Toll (₹)")
  private val tollPayer=payerSpinner()
  private val parking=amountInput("Parking (₹)")
  private val parkingPayer=payerSpinner()
  private val submit=Button(context).apply{text="Submit trip financials"}
  private var suppress=false

  init {
   root.addView(title);root.addView(fare,LinearLayout.LayoutParams(-1,dp(48)))
   root.addView(optionalToggle);root.addView(optional)
   optional.addView(toll,LinearLayout.LayoutParams(-1,dp(48)));optional.addView(tollPayer)
   optional.addView(parking,LinearLayout.LayoutParams(-1,dp(48)));optional.addView(parkingPayer)
   root.addView(submit)
   optionalToggle.setOnClickListener{optional.visibility=if(optional.visibility==View.VISIBLE)View.GONE else View.VISIBLE}
   listOf(fare,toll,parking).forEach{it.addTextChangedListener(object:TextWatcher{
    override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){}
    override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){}
    override fun afterTextChanged(s:Editable?){if(!suppress)persistDraft()}
   })}
   listOf(tollPayer,parkingPayer).forEach{it.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{
    override fun onNothingSelected(parent:AdapterView<*>?){}
    override fun onItemSelected(parent:AdapterView<*>?,view:View?,position:Int,id:Long){if(!suppress)persistDraft()}
   }}
   submit.setOnClickListener{submit()}
  }

  fun render(copy:JSONObject) {
   val values=copy.optJSONObject("values")?:JSONObject()
   suppress=true
   setText(fare,format(values,"farePaise"));setText(toll,format(values,"tollPaise"));setText(parking,format(values,"parkingPaise"))
   selectPayer(tollPayer,values.optString("tollPayer"));selectPayer(parkingPayer,values.optString("parkingPayer"))
   optional.visibility=if(values.has("tollPaise")||values.has("parkingPaise"))View.VISIBLE else View.GONE
   suppress=false
   submit.isEnabled=canSubmit()
  }

  private fun amountInput(label:String)=EditText(context).apply{
   hint=label;inputType=InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
   contentDescription=label
  }
  private fun payerSpinner()=Spinner(context).apply{
   adapter=ArrayAdapter(context,android.R.layout.simple_spinner_dropdown_item,listOf("Select payer","Driver","Customer"))
  }
  private fun selectPayer(spinner:Spinner,value:String){spinner.setSelection(when(value){"driver"->1;"customer"->2;else->0})}
  private fun setText(input:EditText,value:String){if(!input.hasFocus()&&input.text.toString()!=value)input.setText(value)}
  private fun format(values:JSONObject,key:String):String=if(values.has(key))BigDecimal.valueOf(values.optLong(key),2).stripTrailingZeros().toPlainString()else ""
  private fun parse(value:String):Long?{
   val parts=value.split(".")
   if(value.isEmpty()||parts.size>2||parts[0].isEmpty()||!parts[0].all{it in '0'..'9'}||
      (parts.size==2&&(parts[1].length>2||!parts[1].all{it in '0'..'9'})))return null
   return runCatching{BigDecimal(value).movePointRight(2).longValueExact()}.getOrNull()?.takeIf{it>=0L}
  }
  private fun payer(spinner:Spinner):String?=when(spinner.selectedItemPosition){1->"driver";2->"customer";else->null}
  private fun values():JSONObject{
   val result=JSONObject();parse(fare.text.toString())?.let{result.put("farePaise",it)}
   parse(toll.text.toString())?.let{result.put("tollPaise",it);payer(tollPayer)?.let{p->result.put("tollPayer",p)}}
   parse(parking.text.toString())?.let{result.put("parkingPaise",it);payer(parkingPayer)?.let{p->result.put("parkingPayer",p)}}
   return result
  }
  private fun canSubmit():Boolean{
   if(parse(fare.text.toString())==null)return false
   if(toll.text.isNotEmpty()&&(parse(toll.text.toString())==null||payer(tollPayer)==null))return false
   if(parking.text.isNotEmpty()&&(parse(parking.text.toString())==null||payer(parkingPayer)==null))return false
   return true
  }
  private fun persistDraft(){
   val current=values()
   executor.execute{runCatching{DriverTripFinancialStore.updateDraft(db,tripId,current)}}
   submit.isEnabled=canSubmit()
  }
  private fun submit(){
   if(!canSubmit()){onRefresh("Enter Fare and select a payer for each Toll/Parking amount");return}
   val current=values();submit.isEnabled=false
   executor.execute{
    try{
     DriverTripFinancialStore.updateDraft(db,tripId,current)
     DriverTripFinancialStore.submit(db,tripId,current)
     main.post{onRefresh("Fare and trip financials submitted")}
    }catch(error:Exception){main.post{onRefresh("Trip financials not submitted · "+(error.message?:"retry"))}}
   }
  }
  private fun dp(value:Int)=(value*context.resources.displayMetrics.density).toInt()
 }
}
