import { productOf } from "./catalog";
import { DAY, dayIndex, dayStart } from "./time";
import type { Movement, SalesChannel } from "./types";

/**
 * Rendimiento comercial a partir del mismo libro de movimientos: ventas por
 * día y canal, ingresos, unidades y productos más vendidos. Lo que ve el
 * administrador cuadra con el stock porque sale de los mismos eventos.
 */

export interface DaySales {
  day: number;
  t: number;
  revenue: number;
  units: number;
  byChannel: Record<SalesChannel, number>;
}

const isSale = (m: Movement) => m.type === "venta" && m.dOnHand < 0;
const channelOf = (m: Movement): SalesChannel => m.channel ?? "tienda";

/** Ingresos por día y canal en los últimos `days` días (incluye hoy). */
export function salesByDay(moves: readonly Movement[], asOf: number, days: number): DaySales[] {
  const last = dayIndex(asOf);
  const first = last - days + 1;
  const out: DaySales[] = [];
  for (let d = first; d <= last; d++) out.push({ day: d, t: dayStart(d) + DAY / 2, revenue: 0, units: 0, byChannel: { tienda: 0, online: 0, mayorista: 0 } });
  const from = dayStart(first);
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i]!;
    if (m.t > asOf) continue;
    if (m.t < from) break;
    if (!isSale(m)) continue;
    const row = out[dayIndex(m.t) - first];
    if (!row) continue;
    const revenue = m.qty * productOf(m.sku).price;
    row.revenue += revenue;
    row.units += m.qty;
    row.byChannel[channelOf(m)] += revenue;
  }
  return out;
}

export interface SalesSummary {
  todayRevenue: number;
  todayUnits: number;
  revenue7: number;
  revenuePrev7: number;
  units7: number;
  unitsPrev7: number;
  orders7: number;
  top: { sku: string; units: number; revenue: number }[];
  daily: DaySales[];
}

/** Resumen de los últimos 7 días completos más hoy, frente a los 7 anteriores. */
export function salesSummary(moves: readonly Movement[], asOf: number): SalesSummary {
  const daily = salesByDay(moves, asOf, 15);
  const today = daily[daily.length - 1]!;
  const last7 = daily.slice(-8, -1);
  const prev7 = daily.slice(-15, -8);
  const sum = (rows: DaySales[], k: "revenue" | "units") => rows.reduce((a, r) => a + r[k], 0);

  const from = dayStart(dayIndex(asOf) - 7);
  const bySku = new Map<string, { units: number; revenue: number }>();
  let orders7 = 0;
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i]!;
    if (m.t > asOf) continue;
    if (m.t < from) break;
    if (!isSale(m)) continue;
    orders7++;
    const row = bySku.get(m.sku) ?? { units: 0, revenue: 0 };
    row.units += m.qty;
    row.revenue += m.qty * productOf(m.sku).price;
    bySku.set(m.sku, row);
  }
  const top = [...bySku.entries()]
    .map(([sku, r]) => ({ sku, ...r }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return {
    todayRevenue: today.revenue,
    todayUnits: today.units,
    revenue7: sum(last7, "revenue"),
    revenuePrev7: sum(prev7, "revenue"),
    units7: sum(last7, "units"),
    unitsPrev7: sum(prev7, "units"),
    orders7,
    top,
    daily: daily.slice(-14),
  };
}
