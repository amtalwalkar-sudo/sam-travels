package `in`.samtravels.app

import org.json.JSONObject

/** Thin native adapter; Room access remains in the approved Work financial persistence gateway. */
object DriverTripFinancialStore {
 fun createPendingObligation(db:LocalDatabase,tripId:String,eventId:String,now:String,tripContext:JSONObject?) =
  DriverCancellationFeeStore.createPendingCompletedRideObligation(db,tripId,eventId,now,tripContext)
 fun pendingObligations(db:LocalDatabase):List<JSONObject> = DriverCancellationFeeStore.pendingCompletedRideFinancialObligations(db)
 fun ensureDraft(db:LocalDatabase,tripId:String):JSONObject = DriverCancellationFeeStore.ensureCompletedTripFinancialDraft(db,tripId)
 fun updateDraft(db:LocalDatabase,tripId:String,values:JSONObject) = DriverCancellationFeeStore.updateCompletedTripFinancialDraft(db,tripId,values)
 fun submit(db:LocalDatabase,tripId:String,values:JSONObject):JSONObject = DriverCancellationFeeStore.submitCompletedTripFinancials(db,tripId,values)
}
