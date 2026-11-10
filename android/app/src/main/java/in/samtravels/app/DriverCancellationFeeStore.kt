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

    fun createPendingObligation(db:LocalDatabase,tripId:String,eventId:String,now:String) {
        require(tripId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "cancelled_trip_identity_missing" }
        val id="work:trip-financial-obligation:$tripId"
        require(db.records().get(id)==null) { "trip_financial_obligation_already_exists" }
        val envelope=JSONObject().put("id",id).put("schemaVersion",1).put("createdAt",now).put("updatedAt",now)
            .put("source","android").put("revision",1)
            .put("data",JSONObject().put("schemaVersion",1).put("tripId",tripId)
                .put("kind","cancellation_fee").put("status","pending")
                .put("cancellationEventId",eventId).put("createdAt",now))
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
            val values=copy.optJSONObject("values")?:error("form_working_copy_invalid")
            require(values.has("cancellationFeePaise")&&values.optLong("cancellationFeePaise",-1L)==feePaise) { "cancellation_fee_draft_mismatch" }
            val now=Instant.now().toString()
            data.put("status","submitted").put("feePaise",feePaise).put("operationId",operationId).put("submittedAt",now)
            envelope.put("revision",envelope.optInt("revision")+1).put("updatedAt",now).put("data",data)
            copy.put("status","submitted").put("revision",copy.optInt("revision")+1).put("updatedAt",now)
            copyEnvelope.put("revision",copyEnvelope.optInt("revision")+1).put("updatedAt",now).put("data",copy)
            db.records().put(StoredRecord(obligationId,envelope.toString(),obligationRow.schemaVersion,now))
            db.records().put(StoredRecord(copyId,copyEnvelope.toString(),copyRow.schemaVersion,now))
            result=envelope
        }
        return result?:error("cancellation_fee_not_submitted")
    }
}
