export const DRIVER_COMMAND_SCHEMA_VERSION=1 as const;
export const BRIDGE_CONTRACT_VERSION=1 as const;
export const DRIVER_EVENT_TYPES=["shift_start","shift_end","trip_start","trip_end","ride_cancel"] as const;
export type DriverEventType=typeof DRIVER_EVENT_TYPES[number];
export type CommandSurface="pwa"|"native_overlay";
export type DriverWorkflowState="idle"|"shift_active"|"trip_active"|"approach_active"|"needs_attention";
export type DriverTransitionCommand={
 schemaVersion:typeof DRIVER_COMMAND_SCHEMA_VERSION;
 commandId:string;
 eventId:string;
 eventType:DriverEventType;
 originSurface:CommandSurface;
 transitionAt:string;
 expectedPriorState:DriverWorkflowState;
 expectedRevision:number;
 idempotencyKey:string;
 driverContext?:{driverId:string;driverName:string;vehicleId?:string};
};
export type DriverStateProjection={
 schemaVersion:1;
 revision:number;
 state:DriverWorkflowState;
 shiftStartedAt?:string;
 tripStartedAt?:string;
 approachStartedAt?:string;
 lastEventId?:string;
};
export type NativeBridgeRequest<T>={bridgeVersion:typeof BRIDGE_CONTRACT_VERSION;requestId:string;payload:T};
export type NativeBridgeResponse<T>={bridgeVersion:typeof BRIDGE_CONTRACT_VERSION;requestId:string;result:T};
