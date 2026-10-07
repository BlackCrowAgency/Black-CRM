import { analyze, type Analysis } from "./analysis";
import { HERO_LOC, HERO_SKU } from "./catalog";
import { computeEngine, groupExtra, type Recommendation } from "./engine";
import { getDataset } from "./generator";
import { positionAt } from "./ledger";
import { NOW, STORY_START } from "./time";
import type { Movement } from "./types";
import { skuLoc } from "./types";

/**
 * Datos de la historia: diez días de Zapatillas Urban en la tienda, del
 * sábado 19 de septiembre al «ahora» de la demo. Sale del mismo libro de
 * movimientos que el inventario, así que el final de la historia es
 * exactamente el estado con el que abre la vista general.
 */

export const HERO_KEY = skuLoc(HERO_SKU, HERO_LOC);

/** Productos que aparecen en la estantería inicial. */
export const SHELF_SKUS = ["ZAP-URB", "POL-BAS", "MOC-ESS", "ACC-AUD", "ACC-GOR", "MOC-CAN"] as const;

let heroMoves: Movement[] | null = null;
/** Movimientos del protagonista durante la historia. */
export function heroMovements(): Movement[] {
  heroMoves ??= (getDataset().byKey.get(HERO_KEY) ?? []).filter((m) => m.t >= STORY_START && m.t <= NOW);
  return heroMoves;
}

export function heroAvailableAt(t: number) {
  return positionAt(HERO_KEY, t).available;
}

/** Último movimiento del protagonista hasta t (para la señal de venta). */
export function heroRecentSales(t: number, n: number): Movement[] {
  const list = heroMovements();
  const out: Movement[] = [];
  for (let i = list.length - 1; i >= 0 && out.length < n; i--) if (list[i]!.t <= t) out.push(list[i]!);
  return out;
}

const cache = new Map<number, Analysis>();
/** Análisis del protagonista en t (cacheado por hora). */
export function heroAt(t: number): Analysis {
  const k = Math.round(t / 600_000);
  let a = cache.get(k);
  if (!a) {
    a = analyze(HERO_KEY, { asOf: t, orders: getDataset().purchaseOrders });
    cache.set(k, a);
  }
  return a;
}

/** Instante en que el disponible del protagonista llega por primera vez a `units` o menos. */
export function heroReaches(units: number): number {
  for (const m of heroMovements()) if (m.availableAfter <= units) return m.t;
  return NOW;
}

export function shelfAt(t: number) {
  return SHELF_SKUS.map((sku) => ({ sku, available: positionAt(skuLoc(sku, "LIM"), t).available }));
}

let rec: Recommendation | null | undefined;
/** Recomendación del protagonista al final de la historia. */
export function heroRecommendation(): Recommendation | null {
  if (rec !== undefined) return rec;
  const engine = computeEngine({ asOf: NOW, extra: groupExtra([]), orders: getDataset().purchaseOrders });
  rec = engine.recByKey.get(HERO_KEY) ?? null;
  return rec;
}
