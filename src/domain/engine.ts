import { fmtDec, fmtInt } from "./format";
import { analyze, RISK_RANK, type Analysis, type Risk } from "./analysis";
import { CATEGORIES, CATEGORY_ORDER, LOCATION_ORDER, LOCATIONS, PRODUCTS, SUPPLIERS } from "./catalog";
import type { ServiceLevel } from "./forecast";
import { getDataset } from "./generator";
import { dailySeries, type ExtraByKey } from "./ledger";
import { DAY, HOUR, dayIndex, dayStart } from "./time";
import type { CategoryId, LocationId, Movement, PurchaseOrder, SkuLoc } from "./types";
import { skuLoc } from "./types";

/**
 * Motor de la demo: un único cálculo del que leen todas las vistas.
 * Recibe el estado (instante, movimientos extra, órdenes y decisiones del
 * operador) y devuelve análisis, excepciones, recomendaciones y agregados.
 * Si cambia el stock de un SKU, cambia todo lo que depende de él.
 */

export type Severity = "critica" | "alta" | "media" | "baja";
export const SEVERITY_RANK: Record<Severity, number> = { critica: 3, alta: 2, media: 1, baja: 0 };

export type ExceptionType =
  | "stock_critico"
  | "riesgo_quiebre"
  | "alta_demanda"
  | "rotacion_acelerando"
  | "exceso"
  | "sin_movimiento"
  | "reposicion";

export interface OpsException {
  id: string;
  type: ExceptionType;
  severity: Severity;
  key: SkuLoc;
  sku: string;
  loc: LocationId;
  /** Frase breve con el dato decisivo. */
  headline: string;
  impact: { label: string; value: number } | null;
  detectedAt: number;
}

export type DecisionStatus = "sugerida" | "en_revision" | "aprobada" | "orden_creada" | "transferencia_creada" | "pospuesta";

export interface Decision {
  status: DecisionStatus;
  at: number;
  until?: number;
  qty?: number;
  orderId?: string;
}

export interface TransferOption {
  from: LocationId;
  qty: number;
  transitDays: number;
  eta: number;
  /** Días de cobertura que añade en destino. */
  coversDays: number;
}

export interface Recommendation {
  key: SkuLoc;
  sku: string;
  loc: LocationId;
  kind: "compra" | "transferencia";
  qty: number;
  packs: number;
  cost: number;
  supplierId: string;
  from?: LocationId;
  /** Llegada estimada si se ejecuta ahora. */
  eta: number;
  urgency: Severity;
  reason: string;
  /** Transferencia sugerida para cubrir el hueco hasta que llegue la compra. */
  bridge: TransferOption | null;
  status: DecisionStatus;
  decision: Decision | null;
}

export interface EngineInput {
  asOf: number;
  extra?: ExtraByKey;
  orders: readonly PurchaseOrder[];
  decisions?: Readonly<Record<string, Decision>>;
  service?: ServiceLevel;
}

export interface ProductRollup {
  sku: string;
  onHand: number;
  reserved: number;
  available: number;
  onOrder: number;
  rate7: number;
  baseline: number;
  meanDaily: number;
  coverage: number;
  value: number;
  worst: Analysis;
  risk: Risk;
}

export interface GroupRollup {
  units: number;
  available: number;
  reserved: number;
  value: number;
  rate7: number;
  baseline: number;
  meanDaily: number;
  coverage: number;
  exceptions: number;
  critical: number;
}

export interface Engine {
  asOf: number;
  items: Map<SkuLoc, Analysis>;
  list: Analysis[];
  products: Map<string, ProductRollup>;
  exceptions: OpsException[];
  exceptionsByKey: Map<SkuLoc, OpsException[]>;
  recommendations: Recommendation[];
  recByKey: Map<SkuLoc, Recommendation>;
  openOrders: PurchaseOrder[];
  categories: Map<CategoryId, GroupRollup>;
  locations: Map<LocationId, GroupRollup & { capacity: number; occupancy: number; inboundUnits: number }>;
  totals: GroupRollup & { onOrderUnits: number; onOrderValue: number; skuCount: number; atRiskRevenue: number; idleValue: number };
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

export const EXCEPTION_LABEL: Record<ExceptionType, string> = {
  stock_critico: "Stock crítico",
  riesgo_quiebre: "Riesgo de quiebre",
  alta_demanda: "Alta demanda detectada",
  rotacion_acelerando: "Rotación acelerándose",
  exceso: "Exceso de inventario",
  sin_movimiento: "Sin movimiento",
  reposicion: "Reposición recomendada",
};

export const EXCEPTION_ORDER: readonly ExceptionType[] = [
  "stock_critico",
  "riesgo_quiebre",
  "alta_demanda",
  "rotacion_acelerando",
  "reposicion",
  "exceso",
  "sin_movimiento",
];


/** Puntaje de Poisson: cuánto se aparta la última semana de la referencia. */
export function demandZ(a: Analysis) {
  const expected = 7 * a.baseline;
  return (7 * a.rate7 - expected) / Math.sqrt(Math.max(1, expected));
}

/**
 * Desde cuándo se sostiene una señal de demanda: recorre los días hacia atrás
 * recalculando la última semana frente a su referencia.
 */
export function demandSignalSince(a: Analysis, series: readonly number[], minAccel: number, minZ: number): number {
  let since = a.asOf;
  for (let back = 0; back < 10; back++) {
    const end = series.length - back;
    if (end < 35) break;
    const last7 = series.slice(end - 7, end).reduce((x, y) => x + y, 0);
    const base = series.slice(end - 35, end - 7).reduce((x, y) => x + y, 0) / 28;
    const expected = 7 * base;
    const accel = base > 0.05 ? last7 / 7 / base - 1 : 0;
    const z = (last7 - expected) / Math.sqrt(Math.max(1, expected));
    if (accel >= minAccel && z >= minZ) since = a.asOf - back * DAY - 6 * HOUR;
    else break;
  }
  return since;
}

/** Momento aproximado en que la disponibilidad cruzó un umbral (recorriendo el libro hacia atrás). */
function crossedAt(a: Analysis, threshold: number, extra: ExtraByKey | undefined): number {
  const base = getDataset().byKey.get(a.key) ?? [];
  const more = extra?.get(a.key) ?? [];
  const list = [...base, ...more].filter((m) => m.t <= a.asOf);
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i]!.availableBefore > threshold && list[i]!.availableAfter <= threshold) return list[i]!.t;
  }
  return list.length ? list[Math.max(0, list.length - 1)]!.t : a.asOf;
}

function buildExceptions(a: Analysis, extra: ExtraByKey | undefined): OpsException[] {
  const out: OpsException[] = [];
  const p = a.product;
  const base = { key: a.key, sku: a.sku, loc: a.loc };
  const days = (n: number) => (n < 1 ? "menos de 1 día" : `${fmtDec(n, 1)} días`);

  if (a.status === "agotado" || a.risk === "critico") {
    out.push({
      ...base,
      id: `${a.key}:stock_critico`,
      type: "stock_critico",
      severity: "critica",
      headline: a.position.available <= 0 ? "Sin stock disponible" : `Quedan ${a.position.available} u · se agota en ${days(a.coverageForecast)}`,
      impact: a.revenueAtRisk > 0 ? { label: "Ventas en riesgo", value: a.revenueAtRisk } : null,
      detectedAt: crossedAt(a, Math.max(1, a.meanDaily * 3), extra),
    });
  } else if (a.risk === "alto") {
    out.push({
      ...base,
      id: `${a.key}:riesgo_quiebre`,
      type: "riesgo_quiebre",
      severity: "alta",
      headline: `Cobertura ${days(a.coverageForecast)} · reposición tarda ${a.leadTime} días`,
      impact: a.revenueAtRisk > 0 ? { label: "Ventas en riesgo", value: a.revenueAtRisk } : null,
      detectedAt: crossedAt(a, a.meanDaily * a.leadTime, extra),
    });
  } else if (a.risk === "medio" && a.suggestedQty > 0) {
    out.push({
      ...base,
      id: `${a.key}:reposicion`,
      type: "reposicion",
      severity: "media",
      headline: `Bajo el punto de reorden · sugerido ${a.suggestedQty} u`,
      impact: null,
      detectedAt: crossedAt(a, a.reorderPoint, extra),
    });
  }

  const z = demandZ(a);
  const series = () => dailySeries(a.key, dayIndex(a.asOf), extra);
  if (a.accel >= 0.35 && a.rate7 >= 1.5 && z >= 2.5) {
    out.push({
      ...base,
      id: `${a.key}:alta_demanda`,
      type: "alta_demanda",
      severity: RISK_RANK[a.risk] >= 2 ? "alta" : "media",
      headline: `+${fmtInt(a.accel * 100)} % vs. 4 semanas · ${fmtDec(a.rate7, 1)} u/día`,
      impact: null,
      detectedAt: demandSignalSince(a, series(), 0.35, 2.5),
    });
  } else if (a.accel >= 0.15 && a.rate7 >= 1.5 && a.projectedChange >= 0.05 && z >= 2) {
    out.push({
      ...base,
      id: `${a.key}:rotacion_acelerando`,
      type: "rotacion_acelerando",
      severity: "media",
      headline: `+${fmtInt(a.accel * 100)} % en 7 días, tendencia sostenida`,
      impact: null,
      detectedAt: demandSignalSince(a, series(), 0.15, 2),
    });
  }

  if (a.status === "sin_movimiento" && a.value >= 300) {
    out.push({
      ...base,
      id: `${a.key}:sin_movimiento`,
      type: "sin_movimiento",
      severity: a.excessValue >= 1500 ? "media" : "baja",
      headline: `${Math.floor(a.daysSinceDemand)} días sin ventas · ${a.position.onHand} u`,
      impact: { label: "Capital inmovilizado", value: a.position.available * p.unitCost },
      detectedAt: (a.lastDemandAt ?? a.asOf) + 30 * DAY,
    });
  } else if (a.status === "exceso" && a.excessValue >= 1200) {
    out.push({
      ...base,
      id: `${a.key}:exceso`,
      type: "exceso",
      severity: a.excessValue >= 5000 ? "media" : "baja",
      headline: `${Math.round(Math.min(a.position.available / Math.max(a.meanDaily, 0.02), 999))} días de cobertura · ${a.excessUnits} u sobre objetivo`,
      impact: { label: "Capital inmovilizado", value: a.excessValue },
      detectedAt: a.asOf - 9 * DAY,
    });
  }
  return out;
}

/** Stock que otra ubicación puede ceder sin comprometer su propia cobertura. */
function spareUnits(a: Analysis) {
  return Math.floor(a.position.available - a.orderUpTo);
}

function transitDays(from: LocationId, to: LocationId) {
  if (from === to) return 0;
  if (to === "LIM") return LOCATIONS[from].transitToLim;
  if (from === "LIM") return LOCATIONS[to].transitToLim;
  return LOCATIONS[from].transitToLim + LOCATIONS[to].transitToLim;
}

/**
 * Unidades que faltarán antes de la próxima entrada (o del lead time si no hay
 * ninguna en camino): el hueco que una transferencia puede cubrir.
 */
export function gapUnits(a: Analysis): number {
  const first = a.inbound[0];
  const days = first ? Math.max(1, Math.ceil((first.eta - a.asOf) / DAY)) : a.leadTime;
  const demand = a.projected.slice(0, Math.min(a.projected.length, days)).reduce((x, y) => x + y, 0);
  return Math.max(0, Math.round(demand - Math.max(0, a.position.available)));
}

export function bestTransfer(target: Analysis, items: Map<SkuLoc, Analysis>, need: number, asOf: number): TransferOption | null {
  let best: TransferOption | null = null;
  for (const loc of LOCATION_ORDER) {
    if (loc === target.loc) continue;
    const other = items.get(skuLoc(target.sku, loc));
    if (!other || RISK_RANK[other.risk] >= 1) continue;
    // El CD puede ceder más: repone desde proveedor; los regionales conservan su ciclo completo.
    const spare = loc === "LIM" ? Math.floor(other.position.available - other.reorderPoint * 0.6) : spareUnits(other);
    const qty = Math.min(spare, Math.ceil(need));
    if (qty < 4) continue;
    const days = transitDays(loc, target.loc);
    const option: TransferOption = {
      from: loc,
      qty,
      transitDays: days,
      eta: dayStart(dayIndex(asOf) + Math.max(1, days)) + 11 * HOUR,
      coversDays: target.meanDaily > 0 ? qty / target.meanDaily : 0,
    };
    if (!best || option.qty > best.qty || (option.qty === best.qty && option.transitDays < best.transitDays)) best = option;
  }
  return best;
}

export function computeEngine(input: EngineInput): Engine {
  const { asOf, extra, orders, decisions = {}, service } = input;
  const items = new Map<SkuLoc, Analysis>();
  const list: Analysis[] = [];
  for (const p of PRODUCTS) {
    for (const loc of LOCATION_ORDER) {
      const key = skuLoc(p.sku, loc);
      const a = analyze(key, { asOf, extra, orders, service });
      items.set(key, a);
      list.push(a);
    }
  }

  // --- Excepciones ---
  const exceptions: OpsException[] = [];
  const exceptionsByKey = new Map<SkuLoc, OpsException[]>();
  for (const a of list) {
    const ex = buildExceptions(a, extra);
    if (ex.length) exceptionsByKey.set(a.key, ex);
    exceptions.push(...ex);
  }
  exceptions.sort(
    (x, y) =>
      SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity] ||
      (y.impact?.value ?? 0) - (x.impact?.value ?? 0) ||
      EXCEPTION_ORDER.indexOf(x.type) - EXCEPTION_ORDER.indexOf(y.type),
  );

  // --- Recomendaciones ---
  const recommendations: Recommendation[] = [];
  const recByKey = new Map<SkuLoc, Recommendation>();
  for (const a of list) {
    const decision = decisions[a.key] ?? null;
    const p = a.product;
    const supplier = SUPPLIERS[p.supplierId]!;
    const atRisk = RISK_RANK[a.risk] >= 2;
    const gap = atRisk ? gapUnits(a) : 0;
    const bridge = gap > 0 ? bestTransfer(a, items, gap, asOf) : null;
    const needsAction = a.suggestedQty > 0 || bridge !== null || (decision && decision.status !== "sugerida");
    if (!needsAction) continue;

    let kind: Recommendation["kind"] = "compra";
    let from: LocationId | undefined;
    let qty = a.suggestedQty;
    let packs = a.packs;
    let eta = asOf + p.leadTime * DAY;

    if (a.loc !== "LIM") {
      // Almacenes regionales: primero intentar desde el CD Lurín.
      const lim = items.get(skuLoc(a.sku, "LIM"));
      const need = Math.max(1, Math.ceil(a.rawNeed));
      if (lim && lim.position.available - lim.reorderPoint * 0.6 >= need && RISK_RANK[lim.risk] < 2) {
        kind = "transferencia";
        from = "LIM";
        qty = need;
        packs = 0;
        eta = asOf + LOCATIONS[a.loc].transitToLim * DAY + 4 * HOUR;
      } else {
        eta = asOf + (p.leadTime + LOCATIONS[a.loc].transitToLim) * DAY;
      }
    }

    let mainBridge = bridge;
    if (a.suggestedQty === 0 && bridge) {
      // Ya hay una compra en camino: la acción es cubrir el hueco con stock de otra ubicación.
      kind = "transferencia";
      from = bridge.from;
      qty = bridge.qty;
      packs = 0;
      eta = bridge.eta;
      mainBridge = null;
    } else if (kind === "transferencia") {
      mainBridge = null;
    }

    const urgency: Severity = a.risk === "critico" ? "critica" : a.risk === "alto" ? "alta" : a.risk === "medio" ? "media" : "baja";
    let reason: string;
    if (a.suggestedQty === 0 && bridge) reason = `Hay una compra en camino, pero llega después del quiebre`;
    else if (a.position.available <= 0) reason = "Sin stock disponible";
    else if (a.risk === "critico") reason = `Se agota antes de que pueda llegar una reposición`;
    else if (a.risk === "alto") reason = `La cobertura no alcanza el lead time de ${a.leadTime} días`;
    else reason = "Posición de inventario bajo el punto de reorden";

    let status: DecisionStatus = "sugerida";
    if (decision) {
      status = decision.status === "pospuesta" && decision.until !== undefined && decision.until <= asOf ? "sugerida" : decision.status;
    }
    if (a.suggestedQty === 0 && !bridge && status === "sugerida") continue;
    // Sin riesgo y sin decisión previa no se recomienda nada (evita ruido de 1–2 unidades).
    if (a.risk === "bajo" && !decision) continue;

    const rec: Recommendation = {
      key: a.key,
      sku: a.sku,
      loc: a.loc,
      kind,
      qty: decision?.qty ?? qty,
      packs: kind === "compra" ? Math.round((decision?.qty ?? qty) / p.packSize) : packs,
      cost: (decision?.qty ?? qty) * p.unitCost,
      supplierId: supplier.id,
      from,
      eta,
      urgency,
      reason,
      bridge: mainBridge,
      status,
      decision,
    };
    recommendations.push(rec);
    recByKey.set(a.key, rec);
  }
  recommendations.sort((x, y) => SEVERITY_RANK[y.urgency] - SEVERITY_RANK[x.urgency] || y.cost - x.cost);

  // --- Agregados por producto ---
  const products = new Map<string, ProductRollup>();
  for (const p of PRODUCTS) {
    const parts = LOCATION_ORDER.map((loc) => items.get(skuLoc(p.sku, loc))!);
    const worst = [...parts].sort((x, y) => RISK_RANK[y.risk] - RISK_RANK[x.risk] || x.coverageForecast - y.coverageForecast)[0]!;
    const available = sum(parts.map((x) => x.position.available));
    const meanDaily = sum(parts.map((x) => x.meanDaily));
    products.set(p.sku, {
      sku: p.sku,
      onHand: sum(parts.map((x) => x.position.onHand)),
      reserved: sum(parts.map((x) => x.position.reserved)),
      available,
      onOrder: sum(parts.map((x) => x.onOrder)),
      rate7: sum(parts.map((x) => x.rate7)),
      baseline: sum(parts.map((x) => x.baseline)),
      meanDaily,
      coverage: meanDaily > 0.01 ? available / meanDaily : Infinity,
      value: sum(parts.map((x) => x.value)),
      worst,
      risk: worst.risk,
    });
  }

  const rollup = (subset: Analysis[]): GroupRollup => {
    const available = sum(subset.map((x) => x.position.available));
    const meanDaily = sum(subset.map((x) => x.meanDaily));
    const keys = new Set(subset.map((x) => x.key));
    const ex = exceptions.filter((e) => keys.has(e.key));
    return {
      units: sum(subset.map((x) => x.position.onHand)),
      available,
      reserved: sum(subset.map((x) => x.position.reserved)),
      value: sum(subset.map((x) => x.value)),
      rate7: sum(subset.map((x) => x.rate7)),
      baseline: sum(subset.map((x) => x.baseline)),
      meanDaily,
      coverage: meanDaily > 0.01 ? available / meanDaily : Infinity,
      exceptions: ex.length,
      critical: ex.filter((e) => e.severity === "critica").length,
    };
  };

  const categories = new Map<CategoryId, GroupRollup>();
  for (const c of CATEGORY_ORDER) categories.set(c, rollup(list.filter((a) => a.product.category === c)));

  const openOrders = orders.filter((o) => o.status !== "recibida" && o.createdAt <= asOf);
  const locations: Engine["locations"] = new Map();
  for (const loc of LOCATION_ORDER) {
    const r = rollup(list.filter((a) => a.loc === loc));
    const capacity = LOCATIONS[loc].capacity;
    locations.set(loc, {
      ...r,
      capacity,
      occupancy: r.units / capacity,
      inboundUnits: sum(openOrders.filter((o) => o.loc === loc).map((o) => o.qty)),
    });
  }

  const purchases = openOrders.filter((o) => !o.transferFrom);
  const totals = {
    ...rollup(list),
    onOrderUnits: sum(purchases.map((o) => o.qty)),
    onOrderValue: sum(purchases.map((o) => o.qty * (PRODUCTS.find((p) => p.sku === o.sku)?.unitCost ?? 0))),
    skuCount: PRODUCTS.length,
    atRiskRevenue: sum(exceptions.filter((e) => e.impact?.label === "Ventas en riesgo").map((e) => e.impact!.value)),
    idleValue: sum(exceptions.filter((e) => e.impact?.label === "Capital inmovilizado").map((e) => e.impact!.value)),
  };

  return { asOf, items, list, products, exceptions, exceptionsByKey, recommendations, recByKey, openOrders, categories, locations, totals };
}

/** Agrupa movimientos extra por clave para las lecturas del libro. */
export function groupExtra(extra: readonly Movement[]): Map<SkuLoc, Movement[]> {
  const map = new Map<SkuLoc, Movement[]>();
  for (const m of extra) {
    const key = skuLoc(m.sku, m.loc);
    const list = map.get(key);
    if (list) list.push(m);
    else map.set(key, [m]);
  }
  return map;
}

export const CATEGORY_NAME = (id: CategoryId) => CATEGORIES[id].name;
