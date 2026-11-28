export function indiaDateOffsetDays(offset) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const base = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
  return new Date(base + offset * 86_400_000).toISOString().slice(0, 10);
}
export function proratedTargetPaise(monthlyTargetPaise, from, to) {
  let total = 0;
  let cursor = from;
  while (cursor <= to) {
    const [year, month] = cursor.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const end = monthEnd < to ? monthEnd : to;
    const days = Math.round((Date.parse(end + "T00:00:00Z") - Date.parse(cursor + "T00:00:00Z")) / 86_400_000) + 1;
    total += Math.floor((monthlyTargetPaise * days * 2 + daysInMonth) / (2 * daysInMonth));
    cursor = new Date(Date.parse(end + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
  }
  return total;
}
export function moneyFromPaise(paise) {
  return "₹" + (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function monthTargetPaise(month, from, to, monthlyTargetPaise) {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthStart = month + "-01";
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  const start = from > monthStart ? from : monthStart;
  const end = to < monthEnd ? to : monthEnd;
  return start > end ? 0 : proratedTargetPaise(monthlyTargetPaise, start, end);
}
export function previousMonthDate(day) {
  const today = indiaDateOffsetDays(0);
  const [year, month] = today.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return previous.toISOString().slice(0, 7) + "-" + String(day).padStart(2, "0");
}
