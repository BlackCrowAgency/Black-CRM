import { ACTORS, LOCATIONS, SUPPLIERS, WAREHOUSE_ACTOR, productOf } from "./catalog";
import type { Position } from "./ledger";
import { DAY, HOUR, dayIndex, dayStart } from "./time";
import type { LocationId, Movement, MovementType, PurchaseOrder, SalesChannel } from "./types";

/**
 * Acciones del operador y eventos en vivo como funciones puras: reciben la
 * posición actual y devuelven movimientos u órdenes nuevas con su stock
 * antes/después. El estado compartido solo los agrega.
 */

export interface MovementDraft {
  t: number;
  type: MovementType;
  sku: string;
  loc: LocationId;
  qty: number;
  dOnHand: number;
  dReserved: number;
  demand: number;
  counterpart: string;
  actor: string;
  doc: string;
  note?: string;
  direction?: "in" | "out";
  channel?: SalesChannel;
}

export function toMovement(draft: MovementDraft, id: string, position: Position): Movement {
  const onHandAfter = position.onHand + draft.dOnHand;
  const reservedAfter = position.reserved + draft.dReserved;
  return {
    ...draft,
    id,
    onHandBefore: position.onHand,
    onHandAfter,
    availableBefore: position.available,
    availableAfter: onHandAfter - reservedAfter,
    live: true,
  };
}

/** Siguiente número de documento a partir de los existentes (OC-2026-0451 → 0452). */
export function nextDocNumber(existing: readonly string[], prefix: "OC-2026-" | "TR-"): string {
  let max = 0;
  for (const id of existing) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

/** Llegada estimada: lead time en días, a media mañana; los proveedores no entregan en domingo. */
export function etaFor(asOf: number, days: number) {
  let day = dayIndex(asOf) + Math.max(1, Math.round(days));
  if (new Date(dayStart(day) + 12 * HOUR - 5 * HOUR).getUTCDay() === 0) day += 1;
  return dayStart(day) + 11 * HOUR;
}

export function createPurchaseOrder(params: { sku: string; loc: LocationId; qty: number; asOf: number; orders: readonly PurchaseOrder[] }): PurchaseOrder {
  const p = productOf(params.sku);
  const lead = params.loc === "LIM" ? p.leadTime : p.leadTime + LOCATIONS[params.loc].transitToLim;
  return {
    id: nextDocNumber(
      params.orders.map((o) => o.id),
      "OC-2026-",
    ),
    sku: params.sku,
    loc: params.loc,
    supplierId: p.supplierId,
    qty: params.qty,
    createdAt: params.asOf,
    eta: etaFor(params.asOf, lead),
    status: "enviada",
    userCreated: true,
  };
}

export function createTransfer(params: { sku: string; from: LocationId; to: LocationId; qty: number; asOf: number; orders: readonly PurchaseOrder[] }) {
  const p = productOf(params.sku);
  const days = params.to === "LIM" ? LOCATIONS[params.from].transitToLim : params.from === "LIM" ? LOCATIONS[params.to].transitToLim : 3;
  const id = nextDocNumber(
    params.orders.map((o) => o.id),
    "TR-",
  );
  const order: PurchaseOrder = {
    id,
    sku: params.sku,
    loc: params.to,
    supplierId: p.supplierId,
    qty: params.qty,
    createdAt: params.asOf,
    eta: etaFor(params.asOf, days),
    status: "en_transito",
    userCreated: true,
    transferFrom: params.from,
  };
  const out: MovementDraft = {
    t: params.asOf,
    type: "transferencia",
    sku: params.sku,
    loc: params.from,
    qty: params.qty,
    dOnHand: -params.qty,
    dReserved: 0,
    demand: 0,
    counterpart: LOCATIONS[params.to].name,
    actor: ACTORS.operator,
    doc: id,
    direction: "out",
    note: "Transferencia aprobada desde Black CRM",
  };
  return { order, out };
}

/** Movimiento de entrada al confirmar la recepción de una OC o transferencia. */
export function receiptFor(order: PurchaseOrder, asOf: number, qty = order.qty): MovementDraft {
  if (order.transferFrom) {
    return {
      t: asOf,
      type: "transferencia",
      sku: order.sku,
      loc: order.loc,
      qty,
      dOnHand: qty,
      dReserved: 0,
      demand: 0,
      counterpart: LOCATIONS[order.transferFrom].name,
      actor: WAREHOUSE_ACTOR[order.loc],
      doc: order.id,
      direction: "in",
      note: "Transferencia recibida",
    };
  }
  return {
    t: asOf,
    type: "recepcion",
    sku: order.sku,
    loc: order.loc,
    qty,
    dOnHand: qty,
    dReserved: 0,
    demand: 0,
    counterpart: SUPPLIERS[order.supplierId]?.name ?? "Proveedor",
    actor: order.loc === "LIM" ? ACTORS.rcvLim : WAREHOUSE_ACTOR[order.loc],
    doc: order.id,
    note: qty < order.qty ? `Recepción parcial: ${qty} de ${order.qty} u` : "Recepción completa",
  };
}

/** Días entre dos instantes, redondeado a una décima. */
export const daysBetween = (a: number, b: number) => Math.round(((b - a) / DAY) * 10) / 10;
