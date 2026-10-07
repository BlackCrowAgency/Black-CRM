import { LOCATIONS, productOf } from "./catalog";
import { forecastDemand, Z, type Forecast, type ServiceLevel } from "./forecast";
import { dailySeries, demandBetween, lastDemandAt, positionAt, type ExtraByKey, type Position } from "./ledger";
import { DAY, dayIndex, dayStart } from "./time";
import type { LocationId, Product, PurchaseOrder, SkuLoc } from "./types";
import { parseSkuLoc } from "./types";

/**
 * Análisis de un SKU en una ubicación en un instante dado: velocidad,
 * pronóstico, cobertura, fecha probable de quiebre, riesgo y reposición.
 *
 * Es una función pura: la misma entrada da el mismo resultado en el
 * servidor, en el navegador, en la historia (instantes pasados) y en las
 * pruebas. Las simulaciones solo cambian las opciones.
 */

export type Risk = "critico" | "alto" | "medio" | "bajo";
export type StockStatus = "agotado" | "critico" | "bajo" | "saludable" | "exceso" | "sin_movimiento";
export type Rotation = "alta" | "normal" | "baja" | "sin_movimiento";

export const RISK_RANK: Record<Risk, number> = { critico: 3, alto: 2, medio: 1, bajo: 0 };

export interface AnalysisOptions {
  asOf: number;
  extra?: ExtraByKey;
  /** Órdenes de compra y transferencias (las no recibidas cuentan como entrantes). */
  orders?: readonly PurchaseOrder[];
  /** Multiplicador de la demanda proyectada (1 = escenario base). */
  demandAdj?: number;
  /** Lead time en días (por defecto, el del proveedor). */
  leadTime?: number;
  service?: ServiceLevel;
  /** Días proyectados. */
  horizon?: number;
  /** Periodo de revisión de compras (días). */
  review?: number;
}

export interface Inbound {
  id: string;
  qty: number;
  eta: number;
  transferFrom?: LocationId;
}

export interface Analysis {
  key: SkuLoc;
  sku: string;
  loc: LocationId;
  product: Product;
  asOf: number;
  position: Position;
  inbound: Inbound[];
  onOrder: number;
  /** Venta media diaria de los últimos 7 días completos. */
  rate7: number;
  /** Venta media diaria de los últimos 28 días completos. */
  rate28: number;
  /** Referencia: media diaria de los 28 días previos a la última semana. */
  baseline: number;
  /** Variación de la última semana frente a la referencia. */
  accel: number;
  /** Demanda registrada hoy hasta `asOf`. */
  todayDemand: number;
  lastDemandAt: number | null;
  daysSinceDemand: number;
  forecast: Forecast;
  /** Demanda diaria observada hasta ayer (desde el inicio del historial). */
  series: number[];
  adj: number;
  /** Demanda diaria proyectada (media del horizonte lead time + revisión, con ajuste). */
  meanDaily: number;
  /** Variación de la demanda proyectada frente a la venta media de 7 días. */
  projectedChange: number;
  /** Proyección diaria ajustada (horizonte completo). */
  projected: number[];
  projectedSigma: number[];
  /** Stock disponible proyectado al cierre de cada día del horizonte. */
  stockPath: number[];
  /** Días de cobertura a la venta media actual. */
  coverageNow: number;
  /** Días hasta el quiebre según el pronóstico (considera entradas programadas). */
  coverageForecast: number;
  stockoutAt: number | null;
  stockoutEarly: number | null;
  stockoutLate: number | null;
  leadTime: number;
  review: number;
  service: ServiceLevel;
  z: number;
  sigmaDaily: number;
  safetyStock: number;
  reorderPoint: number;
  orderUpTo: number;
  /** Disponible + en tránsito. */
  inventoryPosition: number;
  rawNeed: number;
  suggestedQty: number;
  packs: number;
  roundingDelta: number;
  risk: Risk;
  status: StockStatus;
  rotation: Rotation;
  value: number;
  excessUnits: number;
  excessValue: number;
  unitsAtRisk: number;
  revenueAtRisk: number;
  /** Días de inventario (stock físico / venta media 28 días). */
  dio: number;
}

const ROTATION_SCALE: Record<LocationId, number> = { LIM: 1, AQP: 0.35, CUS: 0.45 };

/**
 * Lead time de reposición de una ubicación: el CD Lurín compra al proveedor;
 * los almacenes regionales se reponen desde el CD (tránsito + 1 día de preparación).
 */
export function replenishLeadTime(product: Product, loc: LocationId): number {
  return loc === "LIM" ? product.leadTime : LOCATIONS[loc].transitToLim + 1;
}

/** Frecuencia de revisión: compras semanales en el CD, transferencias dos veces por semana. */
export const reviewPeriod = (loc: LocationId) => (loc === "LIM" ? 7 : 3);
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

export function openOrdersFor(key: SkuLoc, orders: readonly PurchaseOrder[] | undefined, asOf: number): Inbound[] {
  if (!orders) return [];
  const { sku, loc } = parseSkuLoc(key);
  return orders
    .filter((o) => o.sku === sku && o.loc === loc && o.status !== "recibida" && o.status !== "borrador" && o.createdAt <= asOf)
    .map((o) => ({ id: o.id, qty: o.qty, eta: o.eta, transferFrom: o.transferFrom }))
    .sort((a, b) => a.eta - b.eta);
}

export function analyze(key: SkuLoc, opts: AnalysisOptions): Analysis {
  const { sku, loc } = parseSkuLoc(key);
  const product = productOf(sku);
  const asOf = opts.asOf;
  const today = dayIndex(asOf);
  const horizon = opts.horizon ?? 28;
  const review = opts.review ?? reviewPeriod(loc);
  const service = opts.service ?? 95;
  const z = Z[service];
  const leadTime = opts.leadTime ?? replenishLeadTime(product, loc);
  const adj = opts.demandAdj ?? 1;

  const position = positionAt(key, asOf, opts.extra);
  const inbound = openOrdersFor(key, opts.orders, asOf);
  const onOrder = sum(inbound.map((i) => i.qty));

  const series = dailySeries(key, today, opts.extra);
  const last = (n: number, skip = 0) => series.slice(series.length - n - skip, series.length - skip);
  const rate7 = sum(last(7)) / 7;
  const rate28 = sum(last(28)) / 28;
  const baseline = sum(last(28, 7)) / 28;
  const accel = baseline > 0.05 ? rate7 / baseline - 1 : rate7 > 0 ? 1 : 0;
  const todayDemand = demandBetween(key, dayStart(today), asOf + 1, opts.extra);
  const lastAt = lastDemandAt(key, asOf, opts.extra);
  const daysSinceDemand = lastAt === null ? 999 : (asOf - lastAt) / DAY;

  const forecast = forecastDemand(series, { horizon, firstDay: today, season: product.demand.season });
  const projected = forecast.mean.map((m) => m * adj);
  const projectedSigma = forecast.sigma.map((s) => s * Math.sqrt(adj));
  const span = Math.min(horizon, leadTime + review);
  const meanDaily = sum(projected.slice(0, span)) / span;
  const projectedChange = rate7 > 0.05 ? meanDaily / rate7 - 1 : 0;

  // --- Proyección de stock y fecha de quiebre ---
  const dayFraction = (dayStart(today + 1) - asOf) / DAY;
  const arrivalsByDay = new Array<number>(horizon).fill(0);
  for (const i of inbound) {
    const d = Math.max(0, dayIndex(i.eta) - today);
    if (d < horizon) arrivalsByDay[d]! += i.qty;
  }
  const stockPath: number[] = [];
  let stock = position.available;
  let stockoutAt: number | null = null;
  let cumMean = 0;
  let cumVar = 0;
  let cumArrivals = 0;
  let stockoutEarly: number | null = null;
  let stockoutLate: number | null = null;
  const zRange = Z[80];
  for (let h = 0; h < horizon; h++) {
    const frac = h === 0 ? dayFraction : 1;
    const dayDemand = projected[h]! * frac;
    const dayVar = projectedSigma[h]! ** 2 * frac;
    const dayBegin = h === 0 ? asOf : dayStart(today + h);
    const dayLen = frac * DAY;
    stock += arrivalsByDay[h]!;
    cumArrivals += arrivalsByDay[h]!;
    if (stockoutAt === null && dayDemand > 0 && stock - dayDemand < 0) {
      stockoutAt = dayBegin + Math.max(0, stock / dayDemand) * dayLen;
    }
    const prevMean = cumMean;
    const prevSd = Math.sqrt(cumVar);
    cumMean += dayDemand;
    cumVar += dayVar;
    const sd = Math.sqrt(cumVar);
    const target = position.available + cumArrivals;
    if (stockoutEarly === null && cumMean + zRange * sd >= target) {
      const a = prevMean + zRange * prevSd;
      const b = cumMean + zRange * sd;
      stockoutEarly = dayBegin + Math.min(1, Math.max(0, (target - a) / Math.max(1e-6, b - a))) * dayLen;
    }
    if (stockoutLate === null && cumMean - zRange * sd >= target) {
      const a = Math.max(0, prevMean - zRange * prevSd);
      const b = cumMean - zRange * sd;
      stockoutLate = dayBegin + Math.min(1, Math.max(0, (target - a) / Math.max(1e-6, b - a))) * dayLen;
    }
    stock -= dayDemand;
    stockPath.push(stock);
  }
  if (position.available <= 0 && rate7 > 0) {
    stockoutAt = asOf;
    stockoutEarly = asOf;
    stockoutLate = asOf;
  }

  const coverageNow = rate7 > 0.01 ? position.available / rate7 : Infinity;
  const coverageForecast = stockoutAt !== null ? (stockoutAt - asOf) / DAY : meanDaily > 0.01 ? Math.max(horizon, position.available / meanDaily) : Infinity;

  // --- Reposición ---
  const sigmaDaily = forecast.residualSigma * Math.sqrt(adj);
  const safetyStock = z * sigmaDaily * Math.sqrt(leadTime);
  const reorderPoint = meanDaily * leadTime + safetyStock;
  const orderUpTo = meanDaily * (leadTime + review) + safetyStock;
  const inventoryPosition = position.available + onOrder;
  const rawNeed = orderUpTo - inventoryPosition;

  let risk: Risk = "bajo";
  if (meanDaily > 0.05 || rate7 > 0.05) {
    if (coverageForecast < 3) risk = "critico";
    else if (coverageForecast < leadTime) risk = "alto";
    else if (coverageForecast < leadTime + review) risk = "medio";
  }

  const shouldOrder = rawNeed > 0 && (inventoryPosition <= reorderPoint || RISK_RANK[risk] >= 1);
  const packs = shouldOrder ? Math.max(1, Math.round(rawNeed / product.packSize)) : 0;
  const suggestedQty = packs * product.packSize;
  const roundingDelta = shouldOrder ? suggestedQty - rawNeed : 0;

  // --- Clasificación ---
  const coverageForExcess = position.available / Math.max(meanDaily, 0.02);
  let status: StockStatus;
  if (position.available <= 0 && rate28 > 0) status = "agotado";
  else if (daysSinceDemand >= 30 && position.onHand > 0) status = "sin_movimiento";
  else if (risk === "critico") status = "critico";
  else if (risk === "alto" || risk === "medio") status = "bajo";
  else if (coverageForExcess > 120) status = "exceso";
  else status = "saludable";

  const velocity = rate28 / ROTATION_SCALE[loc];
  const rotation: Rotation = daysSinceDemand >= 30 ? "sin_movimiento" : velocity >= 5 ? "alta" : velocity >= 1.2 ? "normal" : "baja";

  const value = position.onHand * product.unitCost;
  let excessUnits = 0;
  if (status === "sin_movimiento") excessUnits = Math.max(0, position.available);
  else if (status === "exceso") excessUnits = Math.max(0, Math.round(position.available - (orderUpTo + meanDaily * 30)));
  const excessValue = excessUnits * product.unitCost;

  // Ventas en riesgo si se pidiera hoy: demanda del lead time que no alcanza a cubrirse.
  const leadDemand = sum(projected.slice(0, Math.min(horizon, leadTime)));
  const arrivalsInLead = inbound.filter((i) => i.eta <= asOf + leadTime * DAY).reduce((a, i) => a + i.qty, 0);
  const unitsAtRisk = Math.max(0, Math.round(leadDemand - position.available - arrivalsInLead));
  const revenueAtRisk = unitsAtRisk * product.price;

  return {
    key,
    sku,
    loc,
    product,
    asOf,
    position,
    inbound,
    onOrder,
    rate7,
    rate28,
    baseline,
    accel,
    todayDemand,
    lastDemandAt: lastAt,
    daysSinceDemand,
    forecast,
    series,
    adj,
    meanDaily,
    projectedChange,
    projected,
    projectedSigma,
    stockPath,
    coverageNow,
    coverageForecast,
    stockoutAt,
    stockoutEarly,
    stockoutLate,
    leadTime,
    review,
    service,
    z,
    sigmaDaily,
    safetyStock,
    reorderPoint,
    orderUpTo,
    inventoryPosition,
    rawNeed,
    suggestedQty,
    packs,
    roundingDelta,
    risk,
    status,
    rotation,
    value,
    excessUnits,
    excessValue,
    unitsAtRisk,
    revenueAtRisk,
    dio: rate28 > 0.01 ? position.onHand / rate28 : Infinity,
  };
}
