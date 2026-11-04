import Dexie,{type Table}from"dexie";
import type{RecordEnvelope}from"../../core/src/types";
import type{DriverStateProjection}from"../../core/src/commands";
import type{DriverEvent,DriverIntent}from"../../domain/src/driver-workflow";
type SnapshotRow={id:"driver-state";value:DriverStateProjection};
type OutboxRow={id:string;eventId:string;revision:number;delivered:boolean;createdAt:string};
type BackupCheckpointRow={id:string;createdAt:string;status:"checkpoint"|"restored_unverified"|"verified"|"rollback_complete";snapshot:Record<string,unknown[]>};
type CredentialVaultRow={name:string;nonce:string;ciphertext:string;updatedAt:string};
type CredentialVaultMetaRow={id:"credential-vault";salt:string;checkNonce:string;checkCiphertext:string};\ntype DiagnosticRow={id:string;timestamp:string;subsystem:string;operation:string;outcome:"failure";failureCategory:string;recoveryResult:string;appVersion:string;schemaVersion:number};
class SamTravelsDatabase extends Dexie{
 records!:Table<RecordEnvelope<unknown>,string>;
 driverState!:Table<SnapshotRow,string>;
 driverIntents!:Table<DriverIntent,string>;
 driverEvents!:Table<DriverEvent,string>;
 driverOutbox!:Table<OutboxRow,string>;
 backupCheckpoints!:Table<BackupCheckpointRow,string>;
 credentialVault!:Table<CredentialVaultRow,string>;
 credentialVaultMeta!:Table<CredentialVaultMetaRow,string>;\n diagnostics!:Table<DiagnosticRow,string>;
 constructor(){super("sam-travels-browser");this.version(1).stores({records:"id,updatedAt,schemaVersion,deletedAt"});this.version(2).stores({records:"id,updatedAt,schemaVersion,deletedAt",driverState:"id",driverIntents:"&command.eventId,status,createdAt",driverEvents:"&eventId,committedAt,revision",driverOutbox:"&id,eventId,revision,delivered,createdAt"});this.version(3).stores({records:"id,updatedAt,schemaVersion,deletedAt",driverState:"id",driverIntents:"&command.eventId,status,createdAt",driverEvents:"&eventId,committedAt,revision",driverOutbox:"&id,eventId,revision,delivered,createdAt",backupCheckpoints:"&id,createdAt,status"});this.version(4).stores({records:"id,updatedAt,schemaVersion,deletedAt",driverState:"id",driverIntents:"&command.eventId,status,createdAt",driverEvents:"&eventId,committedAt,revision",driverOutbox:"&id,eventId,revision,delivered,createdAt",backupCheckpoints:"&id,createdAt,status",credentialVault:"&name,updatedAt",credentialVaultMeta:"&id"});this.version(5).stores({records:"id,updatedAt,schemaVersion,deletedAt",driverState:"id",driverIntents:"&command.eventId,status,createdAt",driverEvents:"&eventId,committedAt,revision",driverOutbox:"&id,eventId,revision,delivered,createdAt",backupCheckpoints:"&id,createdAt,status",credentialVault:"&name,updatedAt",credentialVaultMeta:"&id",diagnostics:"&id,timestamp"})}
}
export const browserDatabase=new SamTravelsDatabase();
