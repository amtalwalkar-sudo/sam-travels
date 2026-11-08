package `in`.samtravels.app

import org.json.JSONObject

/** Validates the Work-selected Driver, effective assignment and active Vehicle at shift start. */
internal object WorkDriverContextResolver {
    fun resolve(db: LocalDatabase, transitionAt: String): JSONObject {
        val records=db.records().list()
        val selectedRows=records.filter { it.id=="work:selected-driver" }
        require(selectedRows.size==1) { "work_driver_not_selected" }
        val selected=JSONObject(selectedRows.single().json).optJSONObject("data")?:error("work_selected_driver_invalid")
        require(selected.optInt("schemaVersion",-1)==1) { "work_selected_driver_invalid" }
        require(!selected.has("lockedShiftId")||selected.isNull("lockedShiftId")) { "work_driver_selection_locked_during_shift" }
        val driverId=selected.optString("driverId")
        require(driverId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "work_selected_driver_invalid" }
        val driverRows=records.filter { it.id=="feature:driver-records:driver:$driverId" }
        require(driverRows.size==1) { "driver_not_active" }
        val driver=JSONObject(driverRows.single().json).optJSONObject("data")?:error("driver_not_active")
        require(driver.optInt("schemaVersion",-1)==1&&driver.optString("driverId")==driverId&&driver.optString("name").isNotBlank()&&driver.optString("lifecycleState")=="active") { "driver_not_active" }
        val historyRows=records.filter { it.id=="feature:driver-records:assignment:$driverId" }
        require(historyRows.size==1) { "driver_assignment_missing" }
        val history=JSONObject(historyRows.single().json).optJSONObject("data")?:error("driver_assignment_invalid")
        require(history.optInt("schemaVersion",-1)==1&&history.optString("driverId")==driverId) { "driver_assignment_identity_mismatch" }
        val assignments=history.optJSONArray("assignments")?:error("driver_assignment_invalid")
        val assignmentIds=mutableSetOf<String>()
        val active=mutableListOf<JSONObject>()
        var previousAssignedAt:java.time.Instant?=null
        for(index in 0 until assignments.length()) {
            val item=assignments.optJSONObject(index)?:error("driver_assignment_invalid")
            require(item.keys().asSequence().all { it in setOf("assignmentId","vehicleId","assignedAt","unassignedAt") }&&
                item.optString("assignmentId").matches(Regex("[A-Za-z0-9_-]{1,128}"))&&assignmentIds.add(item.optString("assignmentId"))&&
                item.optString("vehicleId").startsWith("feature:vehicle:")) { "driver_assignment_invalid" }
            val assignedAt=java.time.OffsetDateTime.parse(item.optString("assignedAt")).toInstant()
            require(previousAssignedAt==null||!assignedAt.isBefore(previousAssignedAt)) { "driver_assignment_history_order_invalid" }
            previousAssignedAt=assignedAt
            if(item.has("unassignedAt")) {
                val unassignedAt=java.time.OffsetDateTime.parse(item.optString("unassignedAt")).toInstant()
                require(!unassignedAt.isBefore(assignedAt)) { "driver_assignment_period_invalid" }
            } else active.add(item)
        }
        require(active.size==1) { if(active.isEmpty()) "driver_assignment_missing" else "driver_multiple_active_assignments" }
        val assignment=active.single()
        val assignmentId=assignment.optString("assignmentId");val vehicleId=assignment.optString("vehicleId")
        require(assignmentId.matches(Regex("[A-Za-z0-9_-]{1,128}"))&&vehicleId.matches(Regex("feature:vehicle:[A-Za-z0-9_-]{1,128}"))) { "driver_assignment_invalid" }
        require(java.time.OffsetDateTime.parse(assignment.getString("assignedAt")).toInstant()<=java.time.OffsetDateTime.parse(transitionAt).toInstant()) { "driver_assignment_not_active_at_shift_start" }
        val vehicleRows=records.filter { it.id==vehicleId }
        require(vehicleRows.size==1) { "vehicle_not_active" }
        val vehicle=JSONObject(vehicleRows.single().json).optJSONObject("data")?:error("vehicle_not_active")
        val vehicleFields=setOf("schemaVersion","registrationNumber","make","model","vehicleType","fuelType","yearOfManufacture","ownership","lifecycleState")
        val registration=vehicle.optString("registrationNumber").replace(Regex("[\\s-]+"),"").uppercase(java.util.Locale.ROOT)
        val year=vehicle.opt("yearOfManufacture") as? Number
        require(vehicle.keys().asSequence().toSet()==vehicleFields&&vehicle.optInt("schemaVersion",-1)==1&&vehicle.optString("lifecycleState")=="active"&&
            registration.isNotBlank()&&vehicleId=="feature:vehicle:$registration"&&
            listOf("make","model","vehicleType","fuelType","ownership").all { vehicle.optString(it).isNotBlank() }&&
            year!=null&&year.toDouble().isFinite()&&year.toDouble()%1.0==0.0&&year.toInt()>0) { "vehicle_not_active" }
        return JSONObject().put("schemaVersion",1).put("driverId",driverId).put("assignmentId",assignmentId).put("vehicleId",vehicleId)
    }

 }
