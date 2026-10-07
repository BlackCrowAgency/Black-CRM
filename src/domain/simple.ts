import type { Analysis } from "./analysis";
import { CATEGORIES, PRODUCTS } from "./catalog";
import { demandZ, type Engine, type Recommendation } from "./engine";
import { fmtInt } from "./format";
import { DAY, dayIndex, dayStart, limaParts } from "./time";
import type { Product } from "./types";
import { skuLoc } from "./types";

/**
 * Capa de lenguaje sencillo. El motor calcula con conceptos técnicos
 * (cobertura, punto de reorden, lead time); aquí se traducen a lo que un
 * negocio entiende de inmediato: cuántas quedan, cuánto se vendió, cuándo
 * podría agotarse y qué conviene hacer.
 */

export type SimpleState = "agotado" | "reponer" | "pocas" | "en_camino" | "rapido" | "demasiado" | "sin_ventas" | "bien";

export interface ProductView {
  sku: string;
  product: Product;
  a: Analysis;
  available: number;
  /** Unidades vendidas en los últimos 7 días completos. */
  soldWeek: number;
  /** Unidades vendidas en los últimos 28 días completos. */
  soldMonth: number;
  /** Variación de la última semana frente a una semana típica. */
  weekChange: number;
  fast: boolean;
  /** Días hasta agotarse al ritmo esperado (null si no se vende). */
  daysLeft: number | null;
  runOutAt: number | null;
  incoming: { id: string; qty: number; eta: number } | null;
  state: SimpleState;
  rec: Recommendation | null;
  postponed: boolean;
}

export type AlertKind = "agotado" | "agotarse" | "pocas" | "rapido" | "demasiado" | "sin_ventas";

export interface SimpleAlert {
  id: string;
  kind: AlertKind;
  sku: string;
  title: string;
  detail: string;
  rank: number;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

export function viewOf(a: Analysis, rec: Recommendation | null): ProductView {
  const soldWeek = sum(a.series.slice(-7));
  const soldMonth = sum(a.series.slice(-28));
  const fast = a.accel >= 0.25 && soldWeek >= 7 && demandZ(a) >= 1.2;
  const selling = a.meanDaily > 0.05 || a.rate7 > 0.05;
  const daysLeft = selling ? Math.max(0, a.coverageForecast) : null;
  const first = a.inbound[0];
  const incoming = first ? { id: first.id, qty: first.qty, eta: first.eta } : null;
  const postponed = rec?.status === "pospuesta";

  let state: SimpleState = "bien";
  if (a.position.available <= 0 && soldMonth > 0) state = "agotado";
  else if (incoming && (a.risk === "alto" || a.risk === "critico" || a.risk === "medio")) state = "en_camino";
  else if (a.risk === "alto" || a.risk === "critico") state = "reponer";
  // «Quedan pocas»: ya está en el punto en que conviene pedir (no solo «podría pedir»).
  else if (a.risk !== "bajo" && a.position.available <= a.reorderPoint) state = "pocas";
  else if (fast) state = "rapido";
  else if (a.status === "sin_movimiento") state = "sin_ventas";
  else if (a.status === "exceso") state = "demasiado";

  return {
    sku: a.sku,
    product: a.product,
    a,
    available: a.position.available,
    soldWeek,
    soldMonth,
    weekChange: a.accel,
    fast,
    daysLeft,
    runOutAt: selling ? a.stockoutAt : null,
    incoming,
    state,
    rec,
    postponed,
  };
}

export function productViews(engine: Engine): ProductView[] {
  return PRODUCTS.map((p) => {
    const key = skuLoc(p.sku, "LIM");
    return viewOf(engine.items.get(key)!, engine.recByKey.get(key) ?? null);
  });
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «hoy», «mañana», «el viernes», «en 12 días». */
export function whenText(ts: number, now: number): string {
  const days = Math.floor((ts - 5 * 3600_000) / DAY) - Math.floor((now - 5 * 3600_000) / DAY);
  if (days <= 0) return "hoy";
  if (days === 1) return "mañana";
  if (days < 7) return `el ${WEEKDAYS[limaParts(ts).weekday]}`;
  return `en ${days} días`;
}

/** «menos de 1 día», «aprox. 1 día», «aprox. 4 días». */
export function daysText(days: number): string {
  if (days < 1) return "menos de 1 día";
  const n = Math.round(days);
  return n === 1 ? "aprox. 1 día" : `aprox. ${n} días`;
}

export function unitsText(n: number, p?: Product) {
  const word = p?.category === "ZAP" ? (n === 1 ? "par" : "pares") : n === 1 ? "unidad" : "unidades";
  return `${fmtInt(n)} ${word}`;
}

export function alertsOf(views: readonly ProductView[]): SimpleAlert[] {
  const out: SimpleAlert[] = [];
  for (const v of views) {
    if (v.postponed) continue;
    const base = { sku: v.sku };
    if (v.state === "agotado") out.push({ ...base, id: `${v.sku}:agotado`, kind: "agotado", title: "Producto agotado", detail: "Sin unidades disponibles", rank: 0 });
    else if (v.state === "reponer" && v.daysLeft !== null)
      out.push({ ...base, id: `${v.sku}:agotarse`, kind: "agotarse", title: "Riesgo de quiebre", detail: `Se agota en ${daysText(v.daysLeft)}`, rank: 1 });
    else if (v.state === "pocas") out.push({ ...base, id: `${v.sku}:pocas`, kind: "pocas", title: "Stock bajo", detail: `${unitsText(v.available, v.product)} disponibles`, rank: 2 });
    if (v.fast) out.push({ ...base, id: `${v.sku}:rapido`, kind: "rapido", title: "Alta demanda", detail: `+${fmtInt(v.weekChange * 100)} % frente a una semana típica`, rank: 3 });
    if (v.state === "demasiado") out.push({ ...base, id: `${v.sku}:demasiado`, kind: "demasiado", title: "Sobrestock", detail: "Ventas bajas en el último mes", rank: 4 });
    if (v.state === "sin_ventas")
      out.push({ ...base, id: `${v.sku}:sin_ventas`, kind: "sin_ventas", title: "Sin ventas", detail: `${fmtInt(Math.floor(v.a.daysSinceDemand))} días sin ventas`, rank: 5 });
  }
  return out.sort((x, y) => x.rank - y.rank || (views.find((v) => v.sku === x.sku)?.daysLeft ?? 99) - (views.find((v) => v.sku === y.sku)?.daysLeft ?? 99));
}

/** Producto con una reposición sugerida pendiente (lo que muestra la tarjeta y la ficha). */
export function needsRestock(v: ProductView): boolean {
  return (v.state === "agotado" || v.state === "reponer" || v.state === "pocas") && Boolean(v.rec && v.rec.qty > 0 && v.rec.status !== "orden_creada" && v.rec.status !== "pospuesta");
}

export interface Summary {
  products: number;
  attention: number;
  runningOut: number;
  suggested: number;
  units: number;
}

export function summaryOf(views: readonly ProductView[]): Summary {
  return {
    products: views.length,
    attention: views.filter((v) => ["agotado", "reponer", "pocas", "demasiado", "sin_ventas"].includes(v.state)).length,
    runningOut: views.filter((v) => v.state === "agotado" || v.state === "reponer").length,
    suggested: views.filter((v) => needsRestock(v)).length,
    units: sum(views.map((v) => Math.max(0, v.a.position.onHand))),
  };
}

/** Frase que resume la situación de un producto en lenguaje de negocio. */
export function situation(v: ProductView, now: number): string {
  switch (v.state) {
    case "agotado":
      return "Producto agotado: cada día sin stock son ventas perdidas.";
    case "reponer":
      return v.runOutAt ? `Al ritmo actual se agota ${whenText(v.runOutAt, now)}. Conviene reponer hoy.` : "Conviene reponer hoy.";
    case "pocas":
      return "El stock llegó al punto de pedido. Es momento de reponer.";
    case "en_camino":
      if (!v.incoming) return "Reposición en camino.";
      if (v.runOutAt && v.runOutAt < v.incoming.eta) return `La reposición llega ${whenText(v.incoming.eta, now)}; el stock podría agotarse antes (${whenText(v.runOutAt, now)}).`;
      return `La reposición llega ${whenText(v.incoming.eta, now)}.`;
    case "rapido":
      return "La demanda está por encima de lo habitual. Stock suficiente por ahora.";
    case "demasiado":
      return "Hay más stock del que se vende. Evalúa una promoción o pausar compras.";
    case "sin_ventas":
      return "Sin ventas en los últimos 30 días.";
    default:
      return "Stock suficiente para las próximas semanas.";
  }
}

export const categoryName = (p: Product) => CATEGORIES[p.category].name;

export interface StockProjection {
  points: { t: number; units: number }[];
  runOutAt: number | null;
}

/** Stock proyectado día a día con un multiplicador de ventas (escenario). */
export function projectStock(a: Analysis, factor: number, days = 14): StockProjection {
  const today = dayIndex(a.asOf);
  const fraction = (dayStart(today + 1) - a.asOf) / DAY;
  const arrivals = new Map<number, number>();
  for (const i of a.inbound) arrivals.set(dayIndex(i.eta), (arrivals.get(dayIndex(i.eta)) ?? 0) + i.qty);
  let units = a.position.available;
  let runOutAt: number | null = units <= 0 ? a.asOf : null;
  const points = [{ t: a.asOf, units }];
  for (let h = 0; h < days; h++) {
    const day = today + h;
    const begin = h === 0 ? a.asOf : dayStart(day);
    const len = (h === 0 ? fraction : 1) * DAY;
    const sales = (a.forecast.mean[h] ?? 0) * factor * (h === 0 ? fraction : 1);
    units += arrivals.get(day) ?? 0;
    if (runOutAt === null && sales > 0 && units - sales <= 0) runOutAt = begin + (units / sales) * len;
    units = Math.max(0, units - sales);
    points.push({ t: dayStart(day + 1), units });
  }
  return { points, runOutAt };
}

