// Date/time helpers to ensure consistent UTC storage and local display
// - formatLocalInput: format Date to 'YYYY-MM-DDTHH:MM' in the user's local time (for <input type="datetime-local">)
// - parseLocalInputToUTC: convert a 'YYYY-MM-DDTHH:MM' local string to UTC ISO string with Z
// - startOfLocalDayISO / startOfNextLocalDayISO: local day boundaries expressed as UTC ISO strings

function pad(n: number): string { return n < 10 ? `0${n}` : `${n}`; }

export function formatLocalInput(d: Date): string {
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function parseLocalInputToUTC(localStr: string): string {
  // localStr expected 'YYYY-MM-DDTHH:MM' (no timezone)
  // Construct as local time then convert to UTC ISO with Z
  if (!localStr) return new Date().toISOString();
  // Safari requires full seconds for Date parsing when using hyphen format, so split manually
  const [datePart, timePart] = localStr.split('T');
  const [y, m, d] = datePart.split('-').map((v) => parseInt(v, 10));
  const [hh = '0', mm = '0'] = (timePart || '').split(':');
  const dt = new Date(y, (m - 1), d, parseInt(hh, 10), parseInt(mm, 10), 0, 0);
  return dt.toISOString();
}

export function startOfLocalDayISO(d: Date = new Date()): string {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s.toISOString();
}

export function startOfNextLocalDayISO(d: Date = new Date()): string {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() + 1);
  return s.toISOString();
}
