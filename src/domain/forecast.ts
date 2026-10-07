import { seasonIndex } from "./generator";
import { HOUR, dayStart } from "./time";
import type { SeasonId } from "./types";

/**
 * Pronóstico de demanda diaria.
 *
 * Holt-Winters aditivo con tendencia amortiguada y estacionalidad semanal,
 * ajustado sobre las últimas 12 semanas, más un ajuste anual tomado del
 * perfil estacional del año anterior. Es deliberadamente explicable: cada
 * componente (nivel, tendencia, semana, estación) se puede mostrar al
 * operador. Una implementación real puede reemplazarlo por un servicio
 * externo con la misma interfaz (ver src/server/adapters/forecast.ts).
 */

export interface ForecastOptions {
  /** Días a proyectar. */
  horizon: number;
  /** Índice de día local del primer día proyectado. */
  firstDay: number;
  season?: SeasonId;
  /** Ventana de ajuste en días. */
  window?: number;
}

export interface Forecast {
  /** Demanda media proyectada por día. */
  mean: number[];
  /** Desviación estándar por día proyectado. */
  sigma: number[];
  /** Ajuste dentro de la ventana (un paso adelante), alineado con el final de la serie. */
  fitted: number[];
  level: number;
  trend: number;
  /** Error típico (desviación de residuos un paso adelante). */
  residualSigma: number;
  /** Índices semanales relativos (domingo = 0). */
  weekly: number[];
  /** Factor anual aplicado al horizonte (media). */
  seasonalShift: number;
}

const ALPHA = 0.32;
const BETA = 0.05;
const GAMMA = 0.12;
const PHI = 0.78;
const BASE_WEEK = [1.05, 0.85, 0.85, 0.9, 0.95, 1.1, 1.3];

const weekdayOf = (day: number) => new Date(dayStart(day) + 12 * HOUR - 5 * HOUR).getUTCDay();

export function forecastDemand(series: readonly number[], opts: ForecastOptions): Forecast {
  const window = Math.min(series.length, opts.window ?? 84);
  const data = series.slice(series.length - window);
  const firstDataDay = opts.firstDay - data.length;
  const n = data.length;

  if (n < 14) {
    const avg = n ? data.reduce((a, b) => a + b, 0) / n : 0;
    return {
      mean: new Array(opts.horizon).fill(avg),
      sigma: new Array(opts.horizon).fill(Math.sqrt(Math.max(avg, 0.25))),
      fitted: data.map(() => avg),
      level: avg,
      trend: 0,
      residualSigma: Math.sqrt(Math.max(avg, 0.25)),
      weekly: [...BASE_WEEK],
      seasonalShift: 1,
    };
  }

  // Inicialización robusta: nivel con las dos primeras semanas, estacionalidad
  // semanal a partir del patrón típico del comercio (evita índices ruidosos en SKU lentos).
  const firstWeeks = data.slice(0, 14);
  let level = firstWeeks.reduce((a, b) => a + b, 0) / 14;
  const w1 = data.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
  const w2 = data.slice(7, 14).reduce((a, b) => a + b, 0) / 7;
  let trend = (w2 - w1) / 7;
  const season = new Array<number>(7).fill(0);
  for (let w = 0; w < 7; w++) season[w] = level * (BASE_WEEK[w]! - 1);

  const fitted: number[] = [];
  const errors: number[] = [];
  for (let i = 0; i < n; i++) {
    const wd = weekdayOf(firstDataDay + i);
    const predicted = Math.max(0, level + PHI * trend + season[wd]!);
    fitted.push(predicted);
    const x = data[i]!;
    if (i >= 14) errors.push(x - predicted);
    const prevLevel = level;
    level = ALPHA * (x - season[wd]!) + (1 - ALPHA) * (level + PHI * trend);
    trend = BETA * (level - prevLevel) + (1 - BETA) * PHI * trend;
    season[wd] = GAMMA * (x - level) + (1 - GAMMA) * season[wd]!;
  }

  // Dispersión robusta (MAD) de los errores recientes: un pico aislado no infla el stock de seguridad.
  const recentErrors = errors.slice(-70);
  const residualSigma = Math.max(robustSigma(recentErrors), 0.35);

  const nowTs = dayStart(opts.firstDay) + 12 * HOUR;
  const anchor = seasonIndex(opts.season, nowTs - 7 * 24 * HOUR);
  const mean: number[] = [];
  const sigma: number[] = [];
  let damp = 0;
  let shiftSum = 0;
  for (let h = 1; h <= opts.horizon; h++) {
    damp += Math.pow(PHI, h);
    const day = opts.firstDay + h - 1;
    const wd = weekdayOf(day);
    const shift = seasonIndex(opts.season, dayStart(day) + 12 * HOUR) / anchor;
    shiftSum += shift;
    const base = Math.max(0, level + damp * trend + season[wd]!);
    mean.push(base * shift);
    sigma.push(residualSigma * Math.sqrt(1 + 0.06 * (h - 1)) * Math.max(0.6, shift));
  }

  const weekly = season.map((s) => (level > 0 ? 1 + s / level : 1));
  return { mean, sigma, fitted, level, trend, residualSigma, weekly, seasonalShift: shiftSum / opts.horizon };
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Desviación estándar estimada con la mediana de desviaciones absolutas. */
export function robustSigma(errors: number[]): number {
  if (errors.length < 4) return Math.sqrt(errors.reduce((a, e) => a + e * e, 0) / Math.max(1, errors.length));
  const m = median(errors);
  return 1.4826 * median(errors.map((e) => Math.abs(e - m)));
}

/** Error porcentual absoluto ponderado de un pronóstico frente a lo observado. */
export function wape(actual: readonly number[], predicted: readonly number[]): number | null {
  let err = 0;
  let total = 0;
  for (let i = 0; i < Math.min(actual.length, predicted.length); i++) {
    err += Math.abs(actual[i]! - predicted[i]!);
    total += actual[i]!;
  }
  return total > 0 ? err / total : null;
}

/** Cuantiles normales usados para niveles de servicio e intervalos. */
export const Z = { 80: 1.2816, 90: 1.2816, 95: 1.6449, 98: 2.0537, 99: 2.3263 } as const;
export type ServiceLevel = 90 | 95 | 98 | 99;
