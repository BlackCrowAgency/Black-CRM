/**
 * Modelo de dominio de Crow CRM.
 *
 * Es el mismo contrato que usaría la versión real: los adaptadores de
 * e-commerce, POS o ERP normalizan sus datos a estas formas (ver src/server).
 */

export type LocationId = "LIM" | "AQP" | "CUS";
export type CategoryId = "ZAP" | "POL" | "MOC" | "ACC";
export type SeasonId = "none" | "summer" | "winter" | "rain";

export interface Location {
  id: LocationId;
  name: string;
  short: string;
  city: string;
  kind: string;
  /** Capacidad de almacenamiento en unidades (referencial para ocupación). */
  capacity: number;
  /** Días de tránsito para transferencias hacia CD Lurín. */
  transitToLim: number;
}

export interface Category {
  id: CategoryId;
  name: string;
  /** Nombre en singular para frases («una zapatilla»). */
  singular: string;
  supplierId: string;
}

export interface Supplier {
  id: string;
  name: string;
  /** Lead time típico en días. */
  leadTime: number;
  /** Variación observada del lead time (± días). */
  leadTimeSpread: number;
  /** Porcentaje de órdenes completas y a tiempo en los últimos 6 meses. */
  fillRate: number;
  contact: string;
  email: string;
  /** Canal por el que recibe órdenes de compra. */
  channel: string;
  terms: string;
  origin: string;
  /** Pedido mínimo en soles. */
  minOrder: number;
}

export type ReplenishPolicy = "auto" | "none";

export interface DemandSpec {
  /** Demanda diaria típica actual por ubicación (u/día) [LIM, AQP, CUS]. */
  base: readonly [number, number, number];
  season?: SeasonId;
  /** Crecimiento relativo por cada 30 días (0.2 = +20 %/mes). */
  trend?: number;
  /** Días desde la última venta (producto sin movimiento) por ubicación. */
  dormant?: readonly [number, number, number];
  /** Aceleración reciente: multiplica la demanda de forma creciente en los últimos `days` días. */
  surge?: { days: number; factor: number; locs: readonly LocationId[] };
}

export type ArtKind =
  | "sneaker"
  | "runner"
  | "court"
  | "trail"
  | "hightop"
  | "slide"
  | "boot"
  | "tee"
  | "tee-stripes"
  | "tee-print"
  | "longsleeve"
  | "hoodie"
  | "backpack"
  | "rolltop"
  | "laptopbag"
  | "minibag"
  | "tote"
  | "fannypack"
  | "duffel"
  | "headphones"
  | "cap"
  | "socks"
  | "bottle"
  | "sunglasses"
  | "watch"
  | "wallet"
  | "beanie"
  | "belt";

/** Ilustración del producto: tipo de objeto y sus colores. */
export interface ProductArt {
  kind: ArtKind;
  main: string;
  accent: string;
  detail?: string;
  /** Fondo de estudio (tinte suave). */
  bg: string;
}

export interface Product {
  sku: string;
  name: string;
  category: CategoryId;
  art: ProductArt;
  supplierId: string;
  unitCost: number;
  price: number;
  /** Unidades por caja máster del proveedor (múltiplo de compra). */
  packSize: number;
  /** Lead time del proveedor para este producto (días). */
  leadTime: number;
  demand: DemandSpec;
  /** Cobertura inicial (días) al comenzar el libro de movimientos, por ubicación. */
  startCover: readonly [number, number, number];
  /** Stock inicial explícito (reemplaza la cobertura; para productos sin demanda). */
  startStock?: readonly [number, number, number];
  policy: readonly [ReplenishPolicy, ReplenishPolicy, ReplenishPolicy];
}

export type SalesChannel = "tienda" | "online" | "mayorista";

export type MovementType = "venta" | "recepcion" | "ajuste" | "transferencia" | "devolucion" | "reserva";

export interface Movement {
  id: string;
  /** Instante (ms UTC). */
  t: number;
  type: MovementType;
  sku: string;
  loc: LocationId;
  /** Magnitud (siempre positiva). */
  qty: number;
  /** Variación del stock físico. */
  dOnHand: number;
  /** Variación del stock comprometido. */
  dReserved: number;
  /** Unidades que cuentan como demanda (venta directa o reserva). */
  demand: number;
  /** Origen o destino legible (canal, proveedor, otra ubicación). */
  counterpart: string;
  /** Persona o sistema responsable. */
  actor: string;
  /** Documento de respaldo (pedido, OC, guía, acta). */
  doc: string;
  note?: string;
  /** Dirección de una transferencia respecto de esta ubicación. */
  direction?: "in" | "out";
  /** Canal de venta (tienda, online o mayorista). */
  channel?: SalesChannel;
  onHandBefore: number;
  onHandAfter: number;
  availableBefore: number;
  availableAfter: number;
  /** Generado en vivo o por una acción del operador (no forma parte del histórico). */
  live?: boolean;
}

export type PurchaseStatus = "borrador" | "enviada" | "confirmada" | "en_transito" | "recibida";

export interface PurchaseOrder {
  id: string;
  sku: string;
  loc: LocationId;
  supplierId: string;
  qty: number;
  createdAt: number;
  eta: number;
  status: PurchaseStatus;
  /** Creada por el operador desde la demo. */
  userCreated?: boolean;
  /** Transferencia interna en lugar de compra. */
  transferFrom?: LocationId;
}

/** Clave estable de un SKU en una ubicación. */
export type SkuLoc = `${string}@${LocationId}`;
export const skuLoc = (sku: string, loc: LocationId): SkuLoc => `${sku}@${loc}`;
export function parseSkuLoc(key: SkuLoc): { sku: string; loc: LocationId } {
  const at = key.lastIndexOf("@");
  return { sku: key.slice(0, at), loc: key.slice(at + 1) as LocationId };
}
