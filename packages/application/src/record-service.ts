import{assertRecordEnvelope,RECORD_ENVELOPE_SCHEMA_VERSION}from"../../core/src/persistence-contract";
import type{RecordEnvelope}from"../../core/src/types";
import type{RecordRepository}from"../../core/src/repositories";
export type RecordSource=RecordEnvelope<unknown>["source"];
export class RecordApplicationService{
 constructor(private readonly repository:RecordRepository){}
 async create<T>(input:{id:string;data:T;source:RecordSource;businessDate?:string;now?:string}):Promise<RecordEnvelope<T>>{
  const now=input.now??new Date().toISOString();
  if(!input.id.trim())throw new Error("Record id is required");
  if(await this.repository.get(input.id))throw new Error("Record already exists: "+input.id);
  const record:RecordEnvelope<T>={id:input.id,schemaVersion:RECORD_ENVELOPE_SCHEMA_VERSION,createdAt:now,updatedAt:now,businessDate:input.businessDate,source:input.source,revision:1,data:input.data};
  assertRecordEnvelope(record);await this.repository.put(record);return record;
 }
 async update<T>(id:string,data:T,now=new Date().toISOString()):Promise<RecordEnvelope<T>>{
  const previous=await this.repository.get<T>(id);if(!previous)throw new Error("Record not found: "+id);assertRecordEnvelope(previous);
  const next:RecordEnvelope<T>={...previous,updatedAt:now,revision:previous.revision+1,data};
  assertRecordEnvelope(next);await this.repository.put(next);return next;
 }
 async get<T>(id:string){const record=await this.repository.get<T>(id);if(record)assertRecordEnvelope(record);return record}
}
