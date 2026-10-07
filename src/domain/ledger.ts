import { getDataset } from "./generator";
import { HISTORY_FIRST_DAY, TODAY, dayIndex, dayStart } from "./time";
import type { Movement, SkuLoc } from "./types";

/**
 * Lecturas sobre el libro de movimientos: stock en un instante, demanda
 * diaria y movimientos de un SKU. Combina el histórico base con los
 * movimientos generados en vivo o por acciones del operador (`extra`).
 */

export type ExtraByKey = ReadonlyMap<SkuLoc, readonly Movement[]>;

export interface Position {
  onHand: number;
  reserved: number;
  available: number;
}

/** Último índice con t ≤ ts (búsqueda binaria), o −1. */
function lastIndexAtOrBefore(list: readonly Movement[], ts: number): number {
  let lo = 0;
  let hi = list.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.t <= ts) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

export function positionAt(key: SkuLoc, ts: number, extra?: ExtraByKey): Position {
  const ds = getDataset();
  const base = ds.byKey.get(key) ?? [];
  const open = ds.opening.get(key) ?? { onHand: 0, reserved: 0 };
  let onHand = open.onHand;
  let reserved = open.reserved;
  const i = lastIndexAtOrBefore(base, ts);
  if (i >= 0) {
    const m = base[i]!;
    onHand = m.onHandAfter;
    reserved = m.onHandAfter - m.availableAfter;
  }
  const more = extra?.get(key);
  if (more) {
    for (const m of more) {
      if (m.t > ts) break;
      onHand += m.dOnHand;
      reserved += m.dReserved;
    }
  }
  return { onHand, reserved, available: onHand - reserved };
}

/** Movimientos de un SKU-ubicación (base + extra), cronológicos. */
export function movementsOf(key: SkuLoc, extra?: ExtraByKey): Movement[] {
  const base = getDataset().byKey.get(key) ?? [];
  const more = extra?.get(key);
  return more?.length ? [...base, ...more] : [...base];
}

/**
 * Demanda diaria completa desde HISTORY_FIRST_DAY hasta `untilDay` (exclusivo).
 * Los días desde hoy se agregan a partir de los movimientos.
 */
export function dailySeries(key: SkuLoc, untilDay: number, extra?: ExtraByKey): number[] {
  const hist = getDataset().history.get(key) ?? [];
  const upto = Math.min(untilDay, TODAY) - HISTORY_FIRST_DAY;
  const out = hist.slice(0, Math.max(0, upto));
  if (untilDay > TODAY) {
    const days = new Array<number>(untilDay - TODAY).fill(0);
    for (const m of movementsOf(key, extra)) {
      if (m.demand === 0) continue;
      const d = dayIndex(m.t);
      if (d >= TODAY && d < untilDay) days[d - TODAY]! += m.demand;
    }
    out.push(...days);
  }
  return out;
}

/** Demanda registrada en [t0, t1). */
export function demandBetween(key: SkuLoc, t0: number, t1: number, extra?: ExtraByKey): number {
  let sum = 0;
  for (const m of movementsOf(key, extra)) {
    if (m.t >= t0 && m.t < t1) sum += m.demand;
  }
  return sum;
}

/** Fecha de la última demanda registrada hasta `ts` (busca en el libro y en el historial). */
export function lastDemandAt(key: SkuLoc, ts: number, extra?: ExtraByKey): number | null {
  const list = movementsOf(key, extra);
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]!;
    if (m.t <= ts && m.demand > 0) return m.t;
  }
  const hist = getDataset().history.get(key) ?? [];
  const upto = Math.min(dayIndex(ts), TODAY) - HISTORY_FIRST_DAY;
  for (let i = Math.min(upto, hist.length) - 1; i >= 0; i--) {
    if (hist[i]! > 0) return dayStart(HISTORY_FIRST_DAY + i) + 15 * 3600_000;
  }
  return null;
}
