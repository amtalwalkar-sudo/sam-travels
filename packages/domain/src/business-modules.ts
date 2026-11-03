export const BUSINESS_SCHEMA_VERSION=1 as const;
export type BusinessModuleId="logbook"|"finance"|"vehicle"|"maintenance"|"compliance"|"loans"|"admin";
export type TripRecord={kind:"trip";businessDate:string;origin:string;destination:string;status:"completed"|"cancelled";farePaise:number;cancellationFeePaise:number;distanceMetres:number;notes?:string};
export type FinanceRecord={kind:"finance";businessDate:string;direction:"income"|"expense";category:"fare"|"cancellation_fee"|"fuel"|"maintenance"|"other";amountPaise:number;description:string;linkedTripId?:string};
export type VehicleRecord={kind:"vehicle";registrationNumber:string;makeModel:string;fuelType:"petrol"|"diesel"|"cng"|"electric"|"other";odometerKm:number};
export type MaintenanceRecord={kind:"maintenance";businessDate:string;category:string;amountPaise:number;odometerKm?:number;notes?:string};
export type ComplianceRecord={kind:"compliance";documentType:string;referenceNumber?:string;issueDate?:string;expiryDate:string;notes?:string};
export type LoanRecord={kind:"loan";lender:string;principalPaise:number;annualInterestRateBps:number;tenureMonths:number;startDate:string;emiPaise?:number};
export type AdminRecord={kind:"admin";businessName:string;currency:"INR";businessTimeZone:"Asia/Kolkata"};
export type BusinessRecord=TripRecord|FinanceRecord|VehicleRecord|MaintenanceRecord|ComplianceRecord|LoanRecord|AdminRecord;
export type ValidationIssue={field:string;code:"required"|"invalid_date"|"invalid_number"|"negative"|"invalid_range"|"invalid_format"};
const datePattern=/^\\d{4}-\\d{2}-\\d{2}$/;
export function isBusinessDate(value:string){if(!datePattern.test(value))return false;const d=new Date(value+"T00:00:00Z");return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value}
function required(value:string){return value.trim().length>0}
function nonNegative(value:number){return Number.isSafeInteger(value)&&value>=0}
export function validateBusinessRecord(record:BusinessRecord):ValidationIssue[]{
 const issues:ValidationIssue[]=[];const add=(field:string,code:ValidationIssue["code"])=>issues.push({field,code});
 if(record.kind==="trip"){if(!isBusinessDate(record.businessDate))add("businessDate","invalid_date");if(!required(record.origin))add("origin","required");if(!required(record.destination))add("destination","required");if(!nonNegative(record.farePaise))add("farePaise","invalid_number");if(!nonNegative(record.cancellationFeePaise))add("cancellationFeePaise","invalid_number");if(!nonNegative(record.distanceMetres))add("distanceMetres","invalid_number");if(record.status==="cancelled"&&record.distanceMetres!==0)add("distanceMetres","invalid_range")}
 if(record.kind==="finance"){if(!isBusinessDate(record.businessDate))add("businessDate","invalid_date");if(!required(record.description))add("description","required");if(!Number.isSafeInteger(record.amountPaise)||record.amountPaise<=0)add("amountPaise","invalid_number")}
 if(record.kind==="vehicle"){if(!required(record.registrationNumber))add("registrationNumber","required");if(!required(record.makeModel))add("makeModel","required");if(!Number.isFinite(record.odometerKm)||record.odometerKm<0)add("odometerKm","invalid_number")}
 if(record.kind==="maintenance"){if(!isBusinessDate(record.businessDate))add("businessDate","invalid_date");if(!required(record.category))add("category","required");if(!nonNegative(record.amountPaise))add("amountPaise","invalid_number");if(record.odometerKm!==undefined&&(!Number.isFinite(record.odometerKm)||record.odometerKm<0))add("odometerKm","invalid_number")}
 if(record.kind==="compliance"){if(!required(record.documentType))add("documentType","required");if(!isBusinessDate(record.expiryDate))add("expiryDate","invalid_date");if(record.issueDate&&!isBusinessDate(record.issueDate))add("issueDate","invalid_date");if(record.issueDate&&isBusinessDate(record.issueDate)&&isBusinessDate(record.expiryDate)&&record.expiryDate<record.issueDate)add("expiryDate","invalid_range")}
 if(record.kind==="loan"){if(!required(record.lender))add("lender","required");if(!Number.isSafeInteger(record.principalPaise)||record.principalPaise<=0)add("principalPaise","invalid_number");if(!Number.isFinite(record.annualInterestRateBps)||record.annualInterestRateBps<0||record.annualInterestRateBps>100000)add("annualInterestRateBps","invalid_range");if(!Number.isInteger(record.tenureMonths)||record.tenureMonths<1||record.tenureMonths>600)add("tenureMonths","invalid_range");if(!isBusinessDate(record.startDate))add("startDate","invalid_date");if(record.emiPaise!==undefined&&(!Number.isSafeInteger(record.emiPaise)||record.emiPaise<=0))add("emiPaise","invalid_number")}
 if(record.kind==="admin"&&!required(record.businessName))add("businessName","required");
 return issues;
}
export function calculateMonthlyEmi(principalPaise:number,annualInterestRateBps:number,tenureMonths:number):number{
 if(!Number.isSafeInteger(principalPaise)||principalPaise<=0||!Number.isFinite(annualInterestRateBps)||annualInterestRateBps<0||!Number.isInteger(tenureMonths)||tenureMonths<1)throw new Error("invalid_loan_terms");
 const monthlyRate=annualInterestRateBps/10000/12;
 const raw=monthlyRate===0?principalPaise/tenureMonths:principalPaise*monthlyRate/(1-Math.pow(1+monthlyRate,-tenureMonths));
 return Math.round(raw);
}
export function buildLoanSchedule(input:{principalPaise:number;annualInterestRateBps:number;tenureMonths:number;emiPaise?:number;prepayments?:Array<{month:number;amountPaise:number}>}){
 const emi=input.emiPaise??calculateMonthlyEmi(input.principalPaise,input.annualInterestRateBps,input.tenureMonths);
 if(!Number.isSafeInteger(emi)||emi<=0)throw new Error("invalid_emi");
 for(const payment of input.prepayments??[])if(!Number.isInteger(payment.month)||payment.month<1||payment.month>input.tenureMonths||!Number.isSafeInteger(payment.amountPaise)||payment.amountPaise<=0)throw new Error("invalid_prepayment");
 const prepayments=new Map<number,number>();for(const payment of input.prepayments??[])prepayments.set(payment.month,(prepayments.get(payment.month)??0)+payment.amountPaise);
 const rate=input.annualInterestRateBps/10000/12;let balance=input.principalPaise;const rows:Array<{month:number;openingPaise:number;interestPaise:number;principalPaise:number;emiPaise:number;prepaymentPaise:number;closingPaise:number}>=[];
 for(let month=1;month<=input.tenureMonths&&balance>0;month++){const opening=balance;const interest=Math.round(balance*rate);const paid=Math.min(emi,balance+interest);const principal=Math.min(balance,paid-interest);balance=Math.max(0,balance-principal);const prepayment=Math.min(balance,prepayments.get(month)??0);balance=Math.max(0,balance-prepayment);rows.push({month,openingPaise:opening,interestPaise:interest,principalPaise:principal,emiPaise:paid,prepaymentPaise:prepayment,closingPaise:balance})}
 if(balance>0)throw new Error("emi_does_not_amortize_within_tenure");
 return rows;
}
export function calculatePerformance(input:{trips:TripRecord[];expenses:FinanceRecord[];from:string;to:string}){
 if(!isBusinessDate(input.from)||!isBusinessDate(input.to)||input.from>input.to)throw new Error("invalid_date_range");
 const trips=input.trips.filter(t=>t.businessDate>=input.from&&t.businessDate<=input.to);
 const expenses=input.expenses.filter(e=>e.direction==="expense"&&e.businessDate>=input.from&&e.businessDate<=input.to);
 const completedTrips=trips.filter(t=>t.status==="completed").length;
 const tripFares=trips.filter(t=>t.status==="completed").reduce((s,t)=>s+t.farePaise,0);
 const cancellationFees=trips.reduce((s,t)=>s+t.cancellationFeePaise,0);
 const fuelExpenses=expenses.filter(e=>e.category==="fuel").reduce((s,e)=>s+e.amountPaise,0);
 const totalExpenses=expenses.reduce((s,e)=>s+e.amountPaise,0);
 return{completedTrips,tripFaresPaise:tripFares,cancellationFeesPaise:cancellationFees,grossIncomePaise:tripFares+cancellationFees,fuelExpensesPaise:fuelExpenses,incomeAfterFuelPaise:tripFares+cancellationFees-fuelExpenses,totalExpensesPaise:totalExpenses};
}
