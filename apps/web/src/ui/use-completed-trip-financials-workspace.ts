import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { AtomicRecordRepository, RecordRepository } from "../../../../packages/core/src";
import { getPlatformRecordSource } from "../native-store";
import { RecordFormWorkingCopyRepository } from "../../../../packages/application/src/record-form-working-copy-repository";
import { SharedFormRuntime } from "../../../../packages/application/src/shared-form-runtime";
import { TRIP_COMPLETED_FINANCIALS_FORM_V1 } from "../../../../packages/application/src/driver-form-definitions";
import { calculateTripFinancialSummary, submitCompletedTripFinancials as submitCompletedFinancials, type CompletedTripFinancialObligation } from "../../../../packages/application/src/trip-financial-service";

type Draft = { fare:string; toll:string; tollPayer:string; parking:string; parkingPayer:string };
const emptyDraft=():Draft=>({fare:"",toll:"",tollPayer:"",parking:"",parkingPayer:""});
function parsePaise(value:string):number|null {
  const parts=value.split(".");
  if(value===""||parts.length>2||!/^[0-9]+$/.test(parts[0])||(parts[1]!==undefined&&(parts[1].length>2||!/^[0-9]*$/.test(parts[1]))))return null;
  const amount=Number(parts[0])*100+Number((parts[1]??"").padEnd(2,"0"));
  return Number.isSafeInteger(amount)&&amount>=0?amount:null;
}
function formatPaise(value:unknown):string {
  return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?(value/100).toFixed(2):"";
}
function fromValues(values:Record<string,unknown>):Draft {
  return {fare:formatPaise(values.farePaise),toll:formatPaise(values.tollPaise),
    tollPayer:typeof values.tollPayer==="string"?values.tollPayer:"",
    parking:formatPaise(values.parkingPaise),parkingPayer:typeof values.parkingPayer==="string"?values.parkingPayer:""};
}

export function useCompletedTripFinancialsWorkspace(
  platformRepository:RecordRepository&AtomicRecordRepository,
  refreshKey:number|undefined,
  setDriverMessage:Dispatch<SetStateAction<string>>,
) {
  const [pendingCompletedTripFinancials,setPendingCompletedTripFinancials]=useState<Array<{id:string;data:CompletedTripFinancialObligation}>>([]);
  const [completedTripFinancialDrafts,setCompletedTripFinancialDrafts]=useState<Record<string,Draft>>({});
  const [completedTripFinancialBusy,setCompletedTripFinancialBusy]=useState(false);
  const queues=useRef(new Map<string,Promise<void>>());
  const forms=useMemo(()=>{
    const copies=new RecordFormWorkingCopyRepository(platformRepository,getPlatformRecordSource());
    return new SharedFormRuntime(copies,{
      submit:async command=>{
        if(command.formId!==TRIP_COMPLETED_FINANCIALS_FORM_V1.id||command.action!=="submit")throw new Error("unsupported_trip_financial_form");
        const values=command.values as {farePaise:number;tollPaise?:number;tollPayer?:"driver"|"customer";parkingPaise?:number;parkingPayer?:"driver"|"customer"};
        return submitCompletedFinancials(platformRepository,getPlatformRecordSource(),command.instanceId,values,command.operationId);
      },
    });
  },[platformRepository]);

  const refresh=useCallback(async()=>{
    const rows=await platformRepository.list<CompletedTripFinancialObligation>();
    const obligations=rows.filter(row=>row.id.startsWith("work:trip-financial-obligation:")&&!row.deletedAt&&
      row.data?.kind==="completed_ride_financials"&&row.data.status==="pending");
    const drafts:Record<string,Draft>={};
    for(const row of obligations){
      const tripId=row.data.tripId;
      let copy=await forms.open(TRIP_COMPLETED_FINANCIALS_FORM_V1,tripId);
      if(copy.values.tripId!==tripId)copy=await forms.update(TRIP_COMPLETED_FINANCIALS_FORM_V1,copy,"tripId",tripId);
      drafts[tripId]=fromValues(copy.values as Record<string,unknown>);
    }
    setPendingCompletedTripFinancials(obligations.map(row=>({id:row.id,data:row.data})));
    setCompletedTripFinancialDrafts(drafts);
  },[platformRepository,forms]);

  useEffect(()=>{void refresh().catch(cause=>setDriverMessage(cause instanceof Error?cause.message:"Unable to restore Fare and trip financial forms"));},
    [refresh,refreshKey,setDriverMessage]);
  useEffect(()=>{
    const resume=()=>{if(document.visibilityState!=="hidden")void refresh();};
    window.addEventListener("focus",resume);document.addEventListener("visibilitychange",resume);
    return()=>{window.removeEventListener("focus",resume);document.removeEventListener("visibilitychange",resume);};
  },[refresh]);

  async function updateCompletedTripFinancialDraft(tripId:string,field:"fare"|"toll"|"tollPayer"|"parking"|"parkingPayer",raw:string){
    setCompletedTripFinancialDrafts(current=>({...current,[tripId]:{...(current[tripId]??emptyDraft()),[field]:raw}}));
    const value=field==="fare"||field==="toll"||field==="parking"?(raw===""?undefined:parsePaise(raw)):(raw===""?undefined:raw);
    if(raw!==""&&value===null)return;
    const fieldId=field==="fare"?"farePaise":field==="toll"?"tollPaise":field==="tollPayer"?"tollPayer":field==="parking"?"parkingPaise":"parkingPayer";
    const previous=queues.current.get(tripId)??Promise.resolve();
    const next=previous.then(async()=>{
      let copy=await forms.open(TRIP_COMPLETED_FINANCIALS_FORM_V1,tripId);
      if(copy.values.tripId!==tripId)copy=await forms.update(TRIP_COMPLETED_FINANCIALS_FORM_V1,copy,"tripId",tripId);
      await forms.update(TRIP_COMPLETED_FINANCIALS_FORM_V1,copy,fieldId,value);
    });
    queues.current.set(tripId,next);await next;
  }

  async function submitCompletedTripFinancials(tripId:string){
    if(completedTripFinancialBusy)return;
    const draft=completedTripFinancialDrafts[tripId]??emptyDraft();
    const fare=parsePaise(draft.fare);
    if(fare===null){setDriverMessage("Enter a valid Fare; ₹0 is allowed");return;}
    const toll=draft.toll===""?undefined:parsePaise(draft.toll),parking=draft.parking===""?undefined:parsePaise(draft.parking);
    if(draft.toll!==""&&toll===null){setDriverMessage("Enter Toll with up to two decimal places");return;}
    if(draft.parking!==""&&parking===null){setDriverMessage("Enter Parking with up to two decimal places");return;}
    const tollPaise=toll??undefined,parkingPaise=parking??undefined;
    setCompletedTripFinancialBusy(true);setDriverMessage("Submitting trip financials…");
    try{
      await queues.current.get(tripId);
      let copy=await forms.open(TRIP_COMPLETED_FINANCIALS_FORM_V1,tripId);
      if(copy.values.tripId!==tripId)copy=await forms.update(TRIP_COMPLETED_FINANCIALS_FORM_V1,copy,"tripId",tripId);
      for(const [field,value] of Object.entries({farePaise:fare,tollPaise,tollPayer:tollPaise===undefined?undefined:draft.tollPayer||undefined,
        parkingPaise,parkingPayer:parkingPaise===undefined?undefined:draft.parkingPayer||undefined})){
        if(copy.values[field]!==value)copy=await forms.update(TRIP_COMPLETED_FINANCIALS_FORM_V1,copy,field,value);
      }
      await forms.submit(TRIP_COMPLETED_FINANCIALS_FORM_V1,copy);
      await refresh();setDriverMessage("Fare and trip financials submitted");
    }catch(cause){setDriverMessage(cause instanceof Error?cause.message:"Trip financials not submitted");}
    finally{setCompletedTripFinancialBusy(false);}
  }

  const summaries=useMemo(()=>{
    const result:Record<string,{customerChargePaise:number;driverExpensesPaise:number;netTripEarningsBeforeFuelPaise:number}>={};
    for(const [tripId,draft] of Object.entries(completedTripFinancialDrafts)){
      const fare=parsePaise(draft.fare);if(fare===null)continue;
      const toll=draft.toll===""?undefined:parsePaise(draft.toll),parking=draft.parking===""?undefined:parsePaise(draft.parking);
      if((draft.toll!==""&&toll===null)||(draft.parking!==""&&parking===null))continue;
      const tollPaise=toll??undefined,parkingPaise=parking??undefined;
      if(tollPaise!==undefined&&!["driver","customer"].includes(draft.tollPayer))continue;
      if(parkingPaise!==undefined&&!["driver","customer"].includes(draft.parkingPayer))continue;
      result[tripId]=calculateTripFinancialSummary({farePaise:fare,...(tollPaise===undefined?{}:{tollPaise,tollPayer:draft.tollPayer as "driver"|"customer"}),
        ...(parkingPaise===undefined?{}:{parkingPaise,parkingPayer:draft.parkingPayer as "driver"|"customer"})});
    }
    return result;
  },[completedTripFinancialDrafts]);

  return {pendingCompletedTripFinancials,completedTripFinancialDrafts,completedTripFinancialBusy,
    completedTripFinancialSummaries:summaries,refreshCompletedTripFinancials:refresh,
    updateCompletedTripFinancialDraft,submitCompletedTripFinancials};
}
