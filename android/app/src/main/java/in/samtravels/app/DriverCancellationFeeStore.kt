package `in`.samtravels.app

import org.json.JSONObject
import java.time.Instant
import java.util.UUID

/** Durable cancellation-fee obligation and the shared v1 form working-copy adapter. */
object DriverCancellationFeeStore {
    fun requireNoPendingObligation(db:LocalDatabase) {
        require(pendingObligation(db)==null) { "trip_cancellation_fee_required" }
    }

    fun pendingObligation(db:LocalDatabase):JSONObject? =
        db.records().list().firstOrNull { row ->
            row.id.startsWith("work:trip-financial-obligation:") &&
                JSONObject(row.json).optJSONObject("data")?.let {
                    it.optString("kind")=="cancellation_fee" && it.optString("status")=="pending"
                }==true
        }?.let { JSONObject(it.json) }

    fun createPendingObligation(db:LocalDatabase,tripId:String,eventId:String,now:String,tripContext:JSONObject?) {
        require(tripId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "cancelled_trip_identity_missing" }
        require(tripContext != null) { "cancelled_trip_context_missing" }
        val id="work:trip-financial-obligation:$tripId"
        require(db.records().get(id)==null) { "trip_financial_obligation_already_exists" }
        val envelope=JSONObject().put("id",id).put("schemaVersion",1).put("createdAt",now).put("updatedAt",now)
            .put("source","android").put("revision",1)
            .put("data",JSONObject().put("schemaVersion",1).put("tripId",tripId)
                .put("kind","cancellation_fee").put("status","pending")
                .put("cancellationEventId",eventId).put("createdAt",now).apply { tripContext?.let { put("tripContext",JSONObject(it.toString())) } })
        db.records().put(StoredRecord(id,envelope.toString(),1,now))
    }

    private fun draftRecordId(tripId:String)="__sam_travels_form_working_copy__:work.trip-cancellation-fee:$tripId"

    fun ensureCancellationFeeDraft(db:LocalDatabase,tripId:String):JSONObject {
        require(tripId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "trip_id_invalid" }
        var result:JSONObject?=null
        db.runInTransaction {
            val id=draftRecordId(tripId)
            val existing=db.records().get(id)
            if(existing!=null) {
                val envelope=JSONObject(existing.json)
                val copy=envelope.optJSONObject("data")?:error("form_working_copy_invalid")
                require(copy.optString("formId")=="work.trip-cancellation-fee"&&copy.optInt("formVersion",-1)==1&&
                    copy.optString("instanceId")==tripId&&copy.optString("status") in setOf("in_progress","submitted")) { "form_working_copy_invalid" }
                result=copy
            } else {
                val now=Instant.now().toString()
                val copy=JSONObject().put("formId","work.trip-cancellation-fee").put("formVersion",1)
                    .put("instanceId",tripId).put("revision",0).put("status","in_progress")
                    .put("values",JSONObject().put("tripId",tripId)).put("operationId",UUID.randomUUID().toString())
                    .put("updatedAt",now)
                val envelope=JSONObject().put("id",id).put("schemaVersion",1).put("createdAt",now).put("updatedAt",now)
                    .put("source","android").put("revision",1).put("data",copy)
                db.records().put(StoredRecord(id,envelope.toString(),1,now))
                result=copy
            }
        }
        return result?:error("form_working_copy_unavailable")
    }

    fun updateCancellationFeeDraft(db:LocalDatabase,tripId:String,feePaise:Long?) {
        require(feePaise==null||feePaise>=0L) { "cancellation_fee_must_be_non_negative_integer_paise" }
        db.runInTransaction {
            val id=draftRecordId(tripId)
            val row=db.records().get(id)?:error("form_working_copy_missing")
            val envelope=JSONObject(row.json)
            val copy=envelope.optJSONObject("data")?:error("form_working_copy_invalid")
            require(copy.optString("formId")=="work.trip-cancellation-fee"&&copy.optString("instanceId")==tripId&&
                copy.optString("status")=="in_progress") { "form_working_copy_invalid" }
            val values=JSONObject(copy.optJSONObject("values")?.toString()?: "{}").put("tripId",tripId)
            if(feePaise==null)values.remove("cancellationFeePaise") else values.put("cancellationFeePaise",feePaise)
            val now=Instant.now().toString()
            copy.put("revision",copy.optInt("revision")+1).put("values",values).put("updatedAt",now)
            envelope.put("revision",envelope.optInt("revision")+1).put("updatedAt",now).put("data",copy)
            db.records().put(StoredRecord(id,envelope.toString(),row.schemaVersion,now))
        }
    }

    fun submitCancellationFee(db:LocalDatabase,tripId:String,feePaise:Long):JSONObject {
        require(tripId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "trip_id_invalid" }
        require(feePaise>=0L) { "cancellation_fee_must_be_non_negative_integer_paise" }
        ensureCancellationFeeDraft(db,tripId)
        var result:JSONObject?=null
        db.runInTransaction {
            val obligationId="work:trip-financial-obligation:$tripId"
            val obligationRow=db.records().get(obligationId)?:error("cancellation_fee_obligation_missing")
            val envelope=JSONObject(obligationRow.json)
            val data=envelope.optJSONObject("data")?:error("cancellation_fee_obligation_invalid")
            require(data.optString("kind")=="cancellation_fee"&&data.optString("tripId")==tripId) { "cancellation_fee_obligation_invalid" }
            val copyId=draftRecordId(tripId)
            val copyRow=db.records().get(copyId)?:error("form_working_copy_missing")
            val copyEnvelope=JSONObject(copyRow.json)
            val copy=copyEnvelope.optJSONObject("data")?:error("form_working_copy_invalid")
            val operationId=copy.optString("operationId")
            if(data.optString("status")=="submitted") {
                require(data.optLong("feePaise",-1L)==feePaise&&data.optString("operationId")==operationId) { "cancellation_fee_already_submitted" }
                result=envelope
                return@runInTransaction
            }
            require(data.optString("status")=="pending") { "cancellation_fee_obligation_invalid" }
            val createdBy = DriverWorkflowIdentity.resolveDriverAuthor(db, JSONObject(), DriverWorkflowStore.snapshot(db))
            val values=copy.optJSONObject("values")?:error("form_working_copy_invalid")
            require(values.has("cancellationFeePaise")&&values.optLong("cancellationFeePaise",-1L)==feePaise) { "cancellation_fee_draft_mismatch" }
            val now=Instant.now().toString()
            data.put("status","submitted").put("feePaise",feePaise).put("operationId",operationId).put("submittedAt",now)
            envelope.put("revision",envelope.optInt("revision")+1).put("updatedAt",now).put("createdBy",createdBy).put("data",data)
            copy.put("status","submitted").put("revision",copy.optInt("revision")+1).put("updatedAt",now)
            copyEnvelope.put("revision",copyEnvelope.optInt("revision")+1).put("updatedAt",now).put("data",copy)
            db.records().put(StoredRecord(obligationId,envelope.toString(),obligationRow.schemaVersion,now))
            db.records().put(StoredRecord(copyId,copyEnvelope.toString(),copyRow.schemaVersion,now))
            result=envelope
        }
        return result?:error("cancellation_fee_not_submitted")
    }

    fun createPendingCompletedRideObligation(db:LocalDatabase,tripId:String,eventId:String,now:String,tripContext:JSONObject?) {
        require(tripId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "completed_trip_identity_missing" }
        val id="work:trip-financial-obligation:$tripId"
        require(db.records().get(id)==null) { "trip_financial_obligation_already_exists" }
        val data=JSONObject().put("schemaVersion",1).put("tripId",tripId).put("kind","completed_ride_financials")
            .put("status","pending").put("endRideEventId",eventId).put("createdAt",now)
        tripContext?.let { data.put("tripContext",JSONObject(it.toString())) }
        val envelope=JSONObject().put("id",id).put("schemaVersion",1).put("createdAt",now).put("updatedAt",now)
            .put("source","android").put("revision",1).put("data",data)
        db.records().put(StoredRecord(id,envelope.toString(),1,now))
    }

    fun pendingCompletedRideFinancialObligations(db:LocalDatabase):List<JSONObject> =
        db.records().list().filter { row ->
            row.id.startsWith("work:trip-financial-obligation:") &&
                JSONObject(row.json).optJSONObject("data")?.let {
                    it.optString("kind")=="completed_ride_financials" && it.optString("status")=="pending"
                }==true
        }.map { JSONObject(it.json) }

    fun ensureCompletedTripFinancialDraft(db:LocalDatabase,tripId:String):JSONObject {
        require(tripId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "trip_id_invalid" }
        var result:JSONObject?=null
        db.runInTransaction {
            val id="__sam_travels_form_working_copy__:work.trip-completed-financials:$tripId"
            val existing=db.records().get(id)
            if(existing!=null) {
                val copy=JSONObject(existing.json).optJSONObject("data")?:error("form_working_copy_invalid")
                require(copy.optString("formId")=="work.trip-completed-financials"&&copy.optInt("formVersion",-1)==1&&
                    copy.optString("instanceId")==tripId&&copy.optString("status") in setOf("in_progress","submitted")) { "form_working_copy_invalid" }
                result=copy
            } else {
                val now=Instant.now().toString()
                val copy=JSONObject().put("formId","work.trip-completed-financials").put("formVersion",1)
                    .put("instanceId",tripId).put("revision",0).put("status","in_progress")
                    .put("values",JSONObject().put("tripId",tripId)).put("operationId",UUID.randomUUID().toString())
                    .put("updatedAt",now)
                val envelope=JSONObject().put("id",id).put("schemaVersion",1).put("createdAt",now).put("updatedAt",now)
                    .put("source","android").put("revision",1).put("data",copy)
                db.records().put(StoredRecord(id,envelope.toString(),1,now))
                result=copy
            }
        }
        return result?:error("form_working_copy_unavailable")
    }

    fun updateCompletedTripFinancialDraft(db:LocalDatabase,tripId:String,values:JSONObject) {
        validateCompletedTripFinancialValues(values,tripId,true,false)
        db.runInTransaction {
            val id="__sam_travels_form_working_copy__:work.trip-completed-financials:$tripId"
            val row=db.records().get(id)?:error("form_working_copy_missing")
            val envelope=JSONObject(row.json)
            val copy=envelope.optJSONObject("data")?:error("form_working_copy_invalid")
            require(copy.optString("formId")=="work.trip-completed-financials"&&copy.optString("instanceId")==tripId&&
                copy.optString("status")=="in_progress") { "form_working_copy_invalid" }
            val now=Instant.now().toString()
            copy.put("revision",copy.optInt("revision")+1).put("values",JSONObject(values.toString()).put("tripId",tripId)).put("updatedAt",now)
            envelope.put("revision",envelope.optInt("revision")+1).put("updatedAt",now).put("data",copy)
            db.records().put(StoredRecord(id,envelope.toString(),row.schemaVersion,now))
        }
    }

    fun submitCompletedTripFinancials(db:LocalDatabase,tripId:String,values:JSONObject):JSONObject {
        validateCompletedTripFinancialValues(values,tripId,false,true)
        ensureCompletedTripFinancialDraft(db,tripId)
        var result:JSONObject?=null
        db.runInTransaction {
            val id="work:trip-financial-obligation:$tripId"
            val row=db.records().get(id)?:error("completed_trip_financial_obligation_missing")
            val envelope=JSONObject(row.json)
            val data=envelope.optJSONObject("data")?:error("completed_trip_financial_obligation_invalid")
            require(data.optString("kind")=="completed_ride_financials"&&data.optString("tripId")==tripId) { "completed_trip_financial_obligation_invalid" }
            val copyId="__sam_travels_form_working_copy__:work.trip-completed-financials:$tripId"
            val copyRow=db.records().get(copyId)?:error("form_working_copy_missing")
            val copyEnvelope=JSONObject(copyRow.json)
            val copy=copyEnvelope.optJSONObject("data")?:error("form_working_copy_invalid")
            val copyValues=copy.optJSONObject("values")?:error("form_working_copy_invalid")
            val operationId=copy.optString("operationId")
            if(data.optString("status")=="submitted") {
                require(data.optString("operationId")==operationId&&sameCompletedTripFinancialValues(data,values)) { "completed_trip_financials_already_submitted" }
                result=envelope
                return@runInTransaction
            }
            require(data.optString("status")=="pending") { "completed_trip_financial_obligation_invalid" }
            val createdBy = DriverWorkflowIdentity.resolveDriverAuthor(db, JSONObject(), DriverWorkflowStore.snapshot(db))
            require(sameCompletedTripFinancialValues(copyValues,values)) { "completed_trip_financial_draft_mismatch" }
            val now=Instant.now().toString()
            listOf("farePaise","tollPaise","tollPayer","parkingPaise","parkingPayer").forEach { key ->
                if(values.has(key))data.put(key,values.get(key)) else data.remove(key)
            }
            data.put("status","submitted").put("operationId",operationId).put("submittedAt",now)
            envelope.put("revision",envelope.optInt("revision")+1).put("updatedAt",now).put("createdBy",createdBy).put("data",data)
            copy.put("status","submitted").put("revision",copy.optInt("revision")+1).put("updatedAt",now)
            copyEnvelope.put("revision",copyEnvelope.optInt("revision")+1).put("updatedAt",now).put("data",copy)
            db.records().put(StoredRecord(id,envelope.toString(),row.schemaVersion,now))
            db.records().put(StoredRecord(copyId,copyEnvelope.toString(),copyRow.schemaVersion,now))
            result=envelope
        }
        return result?:error("completed_trip_financials_not_submitted")
    }

    private fun sameCompletedTripFinancialValues(left:JSONObject,right:JSONObject):Boolean =
        listOf("farePaise","tollPaise","tollPayer","parkingPaise","parkingPayer").all { key ->
            if(left.has(key)!=right.has(key)) false else !left.has(key)||left.opt(key).toString()==right.opt(key).toString()
        }

    private fun validateCompletedTripFinancialValues(values:JSONObject,tripId:String,allowMissingFare:Boolean,enforcePayers:Boolean) {
        require(tripId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "trip_id_invalid" }
        if(!allowMissingFare)require(values.has("farePaise")) { "fare_required_non_negative_integer_paise" }
        if(values.has("farePaise"))require(values.optLong("farePaise",-1L)>=0L&&values.optDouble("farePaise",Double.NaN)%1.0==0.0) { "fare_required_non_negative_integer_paise" }
        listOf("toll","parking").forEach { kind ->
            val amountKey=kind+"Paise";val payerKey=kind+"Payer"
            if(values.has(amountKey)) {
                require(values.optLong(amountKey,-1L)>=0L&&values.optDouble(amountKey,Double.NaN)%1.0==0.0) { kind+"_must_be_non_negative_integer_paise" }
                if(enforcePayers)require(values.optString(payerKey) in setOf("driver","customer")) { kind+"_payer_required" }
                if(values.has(payerKey))require(values.optString(payerKey) in setOf("driver","customer")) { kind+"_payer_invalid" }
            } else require(!values.has(payerKey)) { kind+"_payer_without_amount" }
        }
    }

}
