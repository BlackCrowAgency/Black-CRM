import { DAY, HOUR, MINUTE, limaParts } from "./time";

/**
 * Formato determinista (sin Intl): servidor y navegador producen
 * exactamente el mismo texto, así no hay diferencias de hidratación.
 * Convención peruana: coma para miles, punto para decimales.
 */

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const WEEKDAYS_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function group(int: string) {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const r = Math.round(n);
  return (r < 0 ? "−" : "") + group(String(Math.abs(r)));
}

export function fmtDec(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  const fixed = Math.abs(n).toFixed(digits);
  const [i, d] = fixed.split(".");
  return (n < 0 && Number(fixed) !== 0 ? "−" : "") + group(i!) + (d ? `.${d}` : "");
}

export function fmtSigned(n: number, digits = 0): string {
  const body = digits ? fmtDec(Math.abs(n), digits) : fmtInt(Math.abs(n));
  if (Math.abs(n) < 0.5 * Math.pow(10, -digits)) return body;
  return (n > 0 ? "+" : "−") + body;
}

export function fmtPct(ratio: number, signed = false, digits = 0): string {
  if (!Number.isFinite(ratio)) return "—";
  const v = ratio * 100;
  return (signed ? fmtSigned(v, digits) : digits ? fmtDec(v, digits) : fmtInt(v)) + " %";
}

export function fmtMoney(n: number): string {
  return `S/ ${fmtInt(n)}`;
}

/** Moneda compacta: S/ 8,160 · S/ 27.4 mil · S/ 1.24 M */
export function fmtMoneyShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `S/ ${fmtDec(n / 1_000_000, 2)} M`;
  if (a >= 10_000) return `S/ ${fmtDec(n / 1000, 1)} mil`;
  return fmtMoney(n);
}

export function fmtUnits(n: number): string {
  return `${fmtInt(n)} u`;
}

/** Días con una decimal; sin consumo → «sin consumo». */
export function fmtDays(n: number, digits = 1): string {
  if (!Number.isFinite(n) || n > 999) return "sin consumo";
  if (n < 0.05) return "0 días";
  const text = fmtDec(n, n >= 100 ? 0 : digits);
  return `${text} ${text === "1.0" || text === "1" ? "día" : "días"}`;
}

export function fmtDate(ts: number): string {
  const p = limaParts(ts);
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month]}`;
}

export function fmtDateShort(ts: number): string {
  const p = limaParts(ts);
  return `${p.day} ${MONTHS[p.month]}`;
}

export function fmtWeekdayLong(ts: number): string {
  return WEEKDAYS_LONG[limaParts(ts).weekday]!;
}

/** Nombre corto del mes («sep»). */
export function fmtMonth(ts: number): string {
  return MONTHS[limaParts(ts).month]!;
}

export function fmtTime(ts: number): string {
  const p = limaParts(ts);
  return `${String(p.hours).padStart(2, "0")}:${String(p.minutes).padStart(2, "0")}`;
}

export function fmtDateTime(ts: number): string {
  return `${fmtDate(ts)}, ${fmtTime(ts)}`;
}

/** «hace 4 min», «hace 2 h», «hace 3 días», «en 2 días». */
export function fmtRelative(ts: number, now: number): string {
  const diff = now - ts;
  const abs = Math.abs(diff);
  const future = diff < 0;
  let body: string;
  if (abs < MINUTE) return future ? "en instantes" : "ahora";
  if (abs < HOUR) body = `${Math.round(abs / MINUTE)} min`;
  else if (abs < DAY) body = `${Math.round(abs / HOUR)} h`;
  else {
    const d = Math.round(abs / DAY);
    body = `${d} ${d === 1 ? "día" : "días"}`;
  }
  return future ? `en ${body}` : `hace ${body}`;
}

export function plural(n: number, one: string, many: string) {
  return `${fmtInt(n)} ${Math.round(n) === 1 ? one : many}`;
}
