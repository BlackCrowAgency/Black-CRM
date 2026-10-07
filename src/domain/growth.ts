import type { Analysis } from "./analysis";
import { CATEGORY_ORDER, PRODUCTS, productOf } from "./catalog";
import type { Engine } from "./engine";
import { getDataset } from "./generator";
import { needsRestock, type ProductView } from "./simple";
import { DAY, HISTORY_FIRST_DAY, TODAY, dayIndex, dayStart } from "./time";
import type { CategoryId, Movement } from "./types";
import { skuLoc } from "./types";

/**
 * Crecimiento y potencial comercial, calculados del mismo historial que el
 * stock: ingresos por día y semana, rendimiento por categoría, proyección de
 * ingresos y ventas que protege la reposición sugerida.
 */

export interface DayPoint {
  day: number;
  t: number;
  revenue: number;
  units: number;
}

const priceOf = (sku: string) => productOf(sku).price;

/** Ingresos diarios de los últimos `days` días (incluye hoy con lo vendido hasta ahora). */
export function revenueByDay(moves: readonly Movement[], asOf: number, days: number, filter?: (sku: string) => boolean): DayPoint[] {
  const ds = getDataset();
  const last = dayIndex(asOf);
  const first = last - days + 1;
  const out: DayPoint[] = [];
  for (let d = first; d <= last; d++) out.push({ day: d, t: dayStart(d) + DAY / 2, revenue: 0, units: 0 });
  // Días completos: historial agregado.
  for (const p of PRODUCTS) {
    if (filter && !filter(p.sku)) continue;
    const hist = ds.history.get(skuLoc(p.sku, "LIM")) ?? [];
    for (let d = first; d < Math.min(last + 1, TODAY); d++) {
      const v = hist[d - HISTORY_FIRST_DAY] ?? 0;
      const row = out[d - first]!;
      row.units += v;
      row.revenue += v * p.price;
    }
  }
  // Hoy y días en vivo: movimientos de venta.
  const from = dayStart(Math.max(first, TODAY));
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i]!;
    if (m.t > asOf) continue;
    if (m.t < from) break;
    if (m.type !== "venta" || m.dOnHand >= 0) continue;
    if (filter && !filter(m.sku)) continue;
    const row = out[dayIndex(m.t) - first];
    if (!row) continue;
    row.units += m.qty;
    row.revenue += m.qty * priceOf(m.sku);
  }
  return out;
}

export interface WeekPoint {
  index: number;
  start: number;
  end: number;
  revenue: number;
  units: number;
}

/** Semanas de 7 días completos que terminan ayer (la más reciente al final). */
export function revenueByWeek(moves: readonly Movement[], asOf: number, weeks: number, filter?: (sku: string) => boolean): WeekPoint[] {
  const days = revenueByDay(moves, asOf, weeks * 7 + 1, filter).slice(0, -1);
  const out: WeekPoint[] = [];
  for (let w = 0; w < weeks; w++) {
    const slice = days.slice(w * 7, w * 7 + 7);
    out.push({
      index: w,
      start: slice[0]!.t,
      end: slice[slice.length - 1]!.t,
      revenue: slice.reduce((a, d) => a + d.revenue, 0),
      units: slice.reduce((a, d) => a + d.units, 0),
    });
  }
  return out;
}

export interface CategoryRow {
  category: CategoryId;
  revenue30: number;
  revenuePrev30: number;
  growth: number;
  units30: number;
  margin: number;
  stockValue: number;
  daysOfStock: number;
  weekly: number[];
  atRisk: number;
}

export function categoryPerformance(moves: readonly Movement[], engine: Engine, views: readonly ProductView[]): CategoryRow[] {
  return CATEGORY_ORDER.map((category) => {
    const inCat = (sku: string) => productOf(sku).category === category;
    const days = revenueByDay(moves, engine.asOf, 61, inCat).slice(0, -1);
    const last30 = days.slice(-30);
    const prev30 = days.slice(0, 30);
    const revenue30 = last30.reduce((a, d) => a + d.revenue, 0);
    const revenuePrev30 = prev30.reduce((a, d) => a + d.revenue, 0);
    const units30 = last30.reduce((a, d) => a + d.units, 0);
    const products = PRODUCTS.filter((p) => p.category === category);
    let cost = 0;
    const analyses: Analysis[] = products.map((p) => engine.items.get(skuLoc(p.sku, "LIM"))!);
    products.forEach((p) => {
      const units = (getDataset().history.get(skuLoc(p.sku, "LIM")) ?? []).slice(-30).reduce((a, b) => a + b, 0);
      cost += units * p.unitCost;
    });
    const available = analyses.reduce((a, x) => a + Math.max(0, x.position.available), 0);
    const daily = analyses.reduce((a, x) => a + x.meanDaily, 0);
    return {
      category,
      revenue30,
      revenuePrev30,
      growth: revenuePrev30 > 0 ? revenue30 / revenuePrev30 - 1 : 0,
      units30,
      margin: revenue30 > 0 ? 1 - cost / revenue30 : 0,
      stockValue: analyses.reduce((a, x) => a + x.value, 0),
      daysOfStock: daily > 0.05 ? available / daily : Infinity,
      weekly: revenueByWeek(moves, engine.asOf, 12, inCat).map((w) => w.revenue),
      atRisk: views.filter((v) => v.product.category === category && (v.state === "reponer" || v.state === "agotado" || v.state === "pocas")).length,
    };
  });
}

/** Ingresos esperados en los próximos `days` días según el pronóstico de cada producto. */
export function projectedRevenue(engine: Engine, days: number): number {
  let total = 0;
  for (const a of engine.list) {
    const units = a.forecast.mean.slice(0, days).reduce((x, y) => x + y, 0);
    total += units * a.product.price;
  }
  return total;
}

/** Ventas de las próximas dos semanas que la reposición sugerida deja cubiertas. */
export function protectedSales(views: readonly ProductView[]): number {
  let total = 0;
  for (const v of views) {
    if (!needsRestock(v) || !v.rec) continue;
    const demand14 = v.a.projected.slice(0, 14).reduce((x, y) => x + y, 0);
    total += Math.min(v.rec.qty, demand14) * v.product.price;
  }
  return total;
}

/** Crecimiento por producto: últimos 30 días frente a los 30 anteriores. */
export function productGrowth(sku: string): number {
  const hist = getDataset().history.get(skuLoc(sku, "LIM")) ?? [];
  const last = hist.slice(-30).reduce((a, b) => a + b, 0);
  const prev = hist.slice(-60, -30).reduce((a, b) => a + b, 0);
  return prev > 0 ? last / prev - 1 : last > 0 ? 1 : 0;
}

