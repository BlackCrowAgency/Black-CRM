/**
 * Reloj de la demo.
 *
 * Todo el dataset vive en una línea de tiempo fija para que servidor y
 * navegador calculen exactamente lo mismo (sin Date.now() ni zonas horarias
 * del sistema). La operación ocurre en Lima (UTC−5, sin horario de verano).
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Desfase de Lima respecto de UTC. Perú no aplica horario de verano. */
export const LIMA_OFFSET = -5 * HOUR;

/** «Ahora» de la demo: martes 29 de septiembre de 2026, 10:20 en Lima. */
export const NOW = Date.UTC(2026, 8, 29, 15, 20);

/** Inicio de la historia que se reproduce con el scroll: sábado 19 de septiembre, 10:00. */
export const STORY_START = Date.UTC(2026, 8, 19, 15, 0);

/** Días completos de historial diario disponibles para pronóstico. */
export const HISTORY_DAYS = 182;

/** Días con movimientos individuales registrados (el resto es agregado diario). */
export const LEDGER_DAYS = 28;

/** Índice de día local (Lima) de un instante. */
export const dayIndex = (ts: number) => Math.floor((ts + LIMA_OFFSET) / DAY);

/** Instante UTC en que empieza (00:00 en Lima) el día local indicado. */
export const dayStart = (index: number) => index * DAY - LIMA_OFFSET;

/** Día local de hoy (parcial hasta NOW). */
export const TODAY = dayIndex(NOW);

/** Primer día del historial diario (índice local). */
export const HISTORY_FIRST_DAY = TODAY - HISTORY_DAYS;

/** Inicio del libro de movimientos detallado. */
export const LEDGER_START = dayStart(TODAY - LEDGER_DAYS);

/** Partes de calendario de un instante en hora de Lima. */
export function limaParts(ts: number) {
  const d = new Date(ts + LIMA_OFFSET);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
  };
}

/** Día del año (0–365) en Lima, para perfiles estacionales. */
export function dayOfYear(ts: number) {
  const p = limaParts(ts);
  const start = Date.UTC(p.year, 0, 1);
  return Math.floor((Date.UTC(p.year, p.month, p.day) - start) / DAY);
}
