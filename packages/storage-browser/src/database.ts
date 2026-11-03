import Dexie,{type Table}from"dexie";
import type{RecordEnvelope}from"../../core/src/types";
import type{DriverStateProjection}from"../../core/src/commands";
import type{DriverEvent,DriverIntent}from"../../domain/src/driver-workflow";
type SnapshotRow={id:"driver-state";value:DriverStateProjection};
type OutboxRow={id:string;eventId:string;revision:number;delivered:boolean;createdAt:string};
class SamTravelsDatabase extends Dexie{
 records!:Table<RecordEnvelope<unknown>,string>;
 driverState!:Table<SnapshotRow,string>;
 driverIntents!:Table<DriverIntent,string>;
 driverEvents!:Table<DriverEvent,string>;
 driverOutbox!:Table<OutboxRow,string>;
 constructor(){super("sam-travels-browser");this.version(1).stores({records:"id,updatedAt,schemaVersion,deletedAt"});this.version(2).stores({records:"id,updatedAt,schemaVersion,deletedAt",driverState:"id",driverIntents:"&command.eventId,status,createdAt",driverEvents:"&eventId,committedAt,revision",driverOutbox:"&id,eventId,revision,delivered,createdAt"})}
}
export const browserDatabase=new SamTravelsDatabase();
