import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { calculateTripFinancialSummary, type CompletedTripFinancialObligation } from "../../../../packages/application/src/trip-financial-service";
import type { TripFinancialFormRuntimeV1 } from "../../../../packages/application/src/trip-financial-form-runtime";

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
  tripFinancialForms:TripFinancialFormRuntimeV1,
  refreshKey:number|undefined,
  setDriverMessage:Dispatch<SetStateAction<string>>,
) {
  const [pendingCompletedTripFinancials,setPendingCompletedTripFinancials]=useState<Array<{id:string;data:CompletedTripFinancialObligation}>>([]);
  const [completedTripFinancialDrafts,setCompletedTripFinancialDrafts]=useState<Record<string,Draft>>({});
  const [completedTripFinancialBusy,setCompletedTripFinancialBusy]=useState(false);
  const queues=useRef(new Map<string,Promise<void>>());
    const refresh=useCallback(async()=>{
    const obligations=await tripFinancialForms.listPendingCompletedTripFinancials();
    const drafts:Record<string,Draft>={};
    for(const row of obligations){
      const tripId=row.data.tripId;
      drafts[tripId]=fromValues(await tripFinancialForms.openCompletedTripFinancialDraft(tripId) as Record<string,unknown>);
    }
    setPendingCompletedTripFinancials(obligations.map(row=>({id:row.id,data:row.data})));
    setCompletedTripFinancialDrafts(drafts);
  },[tripFinancialForms]);

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
      await tripFinancialForms.updateCompletedTripFinancialDraft(tripId,fieldId,value);
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
      await tripFinancialForms.submitCompletedTripFinancialDraft(tripId,{farePaise:fare,tollPaise,tollPayer:tollPaise===undefined?undefined:draft.tollPayer as "driver"|"customer"|undefined,parkingPaise,parkingPayer:parkingPaise===undefined?undefined:draft.parkingPayer as "driver"|"customer"|undefined});
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
