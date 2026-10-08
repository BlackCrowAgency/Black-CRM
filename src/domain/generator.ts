import { ACTORS, B2B_CLIENTS, HERO_LOC, HERO_SKU, LOCATION_ORDER, LOCATIONS, PRODUCTS, SUPPLIERS, WAREHOUSE_ACTOR } from "./catalog";
import { createRng, hashSeed, poisson, randInt, weightedIndex, type Rng } from "./random";
import { DAY, HISTORY_FIRST_DAY, HOUR, LEDGER_DAYS, MINUTE, NOW, STORY_START, TODAY, dayIndex, dayOfYear, dayStart, limaParts } from "./time";
import type { LocationId, Movement, MovementType, Product, PurchaseOrder, SalesChannel, SeasonId, SkuLoc } from "./types";
import { skuLoc } from "./types";

/**
 * Generador determinista del dataset de la demo.
 *
 * Produce, para cada SKU y ubicación:
 * - 182 días de demanda diaria (base del pronóstico);
 * - un libro de movimientos detallado de los últimos 28 días (ventas,
 *   reservas, despachos, recepciones, transferencias, ajustes, devoluciones)
 *   simulado con restricciones reales de stock y una política de reposición;
 * - órdenes de compra y transferencias, abiertas o recibidas.
 *
 * Los últimos 8 días son la historia que se reproduce con el scroll. El stock
 * actual no está escrito en ningún sitio: es el resultado de recorrer el libro.
 */

// ---------------------------------------------------------------------------
// Demanda esperada
// ---------------------------------------------------------------------------

/** Crecimiento mensual de la tienda durante el semestre. */
export const STORE_GROWTH = 0.05;

/** Peso por día de la semana (domingo = 0). Media = 1. */
const WEEKDAY = [1.05, 0.85, 0.85, 0.9, 0.95, 1.1, 1.3] as const;

/** Índices mensuales (ene–dic) del año anterior, por perfil estacional. */
const SEASON_TABLE: Record<Exclude<SeasonId, "none">, readonly number[]> = {
  summer: [1.45, 1.4, 1.15, 0.85, 0.7, 0.6, 0.66, 0.7, 0.85, 1.0, 1.18, 1.45],
  winter: [0.5, 0.5, 0.6, 0.85, 1.2, 1.6, 1.7, 1.4, 0.95, 0.7, 0.55, 0.5],
  rain: [1.5, 1.5, 1.25, 0.85, 0.6, 0.55, 0.55, 0.6, 0.75, 0.95, 1.2, 1.4],
};

/** Índice estacional suavizado (interpolación coseno entre meses). */
export function seasonIndex(season: SeasonId | undefined, ts: number): number {
  if (!season || season === "none") return 1;
  const table = SEASON_TABLE[season];
  const pos = dayOfYear(ts) / 30.44 - 0.5;
  const m0 = Math.floor(pos);
  const f = pos - m0;
  const a = table[(m0 + 12) % 12]!;
  const b = table[(m0 + 13) % 12]!;
  return a + (b - a) * ((1 - Math.cos(Math.PI * f)) / 2);
}

export const weekdayWeight = (d: number) => WEEKDAY[limaParts(dayStart(d) + 12 * HOUR).weekday]!;

/** Demanda media esperada para un día local y ubicación (sin ruido). */
export function expectedDemand(p: Product, li: number, d: number, withWeekday = true): number {
  const spec = p.demand;
  const ts = dayStart(d) + 12 * HOUR;
  const dormant = spec.dormant?.[li] ?? 0;
  let base = spec.base[li]!;
  if (dormant > 0) {
    if (d >= TODAY - dormant) return 0;
    base = Math.max(base, 0.55);
  }
  const season = seasonIndex(spec.season, ts) / seasonIndex(spec.season, NOW);
  // Tendencia propia del producto más el crecimiento general de la tienda.
  const trend = Math.pow((1 + (spec.trend ?? 0)) * (1 + STORE_GROWTH), (d - TODAY) / 30);
  let surge = 1;
  const s = spec.surge;
  if (s && s.locs.includes(LOCATION_ORDER[li]!) && d > TODAY - s.days) {
    surge = 1 + (s.factor - 1) * ((d - (TODAY - s.days)) / s.days);
  }
  return base * season * trend * surge * (withWeekday ? weekdayWeight(d) : 1);
}

// ---------------------------------------------------------------------------
// Guion del protagonista (CD Lurín)
// ---------------------------------------------------------------------------

/** Pares vendidos por día durante la historia (sáb 19 sep → mar 29 sep, hoy aún sin ventas). */
const HERO_STORY_DEMAND = [2, 3, 2, 3, 3, 2, 4, 3, 5, 4, 0] as const;
const HERO_STORY_FIRST_DAY = dayIndex(STORY_START);
/** Stock del protagonista al empezar la historia. */
export const HERO_STORY_OPENING = 42;
/** Reposición previa del protagonista (antes de la historia). */
const HERO_PREVIOUS_RECEIPT = { day: TODAY - 15, qty: 40 };

function heroPreStoryRate(d: number) {
  // Ritmo normal estable, con un leve crecimiento durante el semestre.
  const months = (d - TODAY) / 30;
  return 2.85 * Math.pow(1.05, months);
}

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

type Channel = "web" | "marketplace" | "pos" | "b2b";
type DocKind = "WEB" | "MKP" | "TK" | "B2B" | "OC" | "TR" | "AJ" | "DV";

interface RawEvent {
  t: number;
  seq: number;
  type: MovementType;
  sku: string;
  loc: LocationId;
  qty: number;
  dOnHand: number;
  dReserved: number;
  demand: number;
  counterpart: string;
  actor: string;
  docKind: DocKind;
  docRef: string;
  note?: string;
  direction?: "in" | "out";
  channel?: SalesChannel;
}

interface Candidate {
  t: number;
  loc: LocationId;
  channel: Channel;
  qty: number;
  client?: string;
  dispatchAt?: number;
}

interface Scheduled {
  t: number;
  kind: "dispatch" | "receipt" | "transfer_in" | "return";
  loc: LocationId;
  qty: number;
  ref: string;
  counterpart: string;
  note?: string;
  orderQty?: number;
}

interface PoRecord {
  ref: string;
  sku: string;
  loc: LocationId;
  supplierId: string;
  qty: number;
  createdAt: number;
  eta: number;
  received: boolean;
  transferFrom?: LocationId;
}

export interface Dataset {
  /** Demanda diaria por clave, días HISTORY_FIRST_DAY … TODAY−1. */
  history: Map<SkuLoc, number[]>;
  /** Movimientos de los últimos 28 días, en orden cronológico. */
  movements: Movement[];
  /** Movimientos por clave (mismas referencias, orden cronológico). */
  byKey: Map<SkuLoc, Movement[]>;
  /** Stock al comenzar el libro detallado. */
  opening: Map<SkuLoc, { onHand: number; reserved: number }>;
  purchaseOrders: PurchaseOrder[];
  /** Ventas que no pudieron atenderse por falta de stock (u). */
  lostSales: Map<SkuLoc, number>;
  /** Reservas abiertas al cierre del histórico y su despacho programado. */
  pendingDispatches: PendingDispatch[];
}

export interface PendingDispatch {
  key: SkuLoc;
  sku: string;
  loc: LocationId;
  qty: number;
  doc: string;
  at: number;
  counterpart: string;
}

// ---------------------------------------------------------------------------
// Utilidades de generación
// ---------------------------------------------------------------------------

const WEB_HOURS = [0.2, 0.1, 0.05, 0.05, 0.05, 0.1, 0.3, 0.6, 0.9, 1, 1, 1.1, 1.2, 1.1, 1, 1, 1, 1.1, 1.2, 1.4, 1.5, 1.3, 0.9, 0.5];
const POS_HOURS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0.9, 1.2, 1.3, 1.0, 0.9, 1.0, 1.2, 1.4, 1.3, 0.8, 0, 0, 0];
const B2B_HOURS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.8, 1.2, 1.1, 0.6, 0.5, 0.9, 1.1, 1.0, 0.6, 0, 0, 0, 0, 0, 0];

function timeIn(rng: Rng, d: number, hours: readonly number[], after = 0) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const h = weightedIndex(rng, hours);
    const t = dayStart(d) + h * HOUR + Math.floor(rng() * 60) * MINUTE;
    if (t >= after) return t;
  }
  return Math.max(after + Math.floor(rng() * 50) * MINUTE, dayStart(d) + 8 * HOUR);
}

/** Siguiente día hábil (lunes a sábado) a una hora dada. */
function nextBusiness(d: number, rng: Rng, fromHour: number, toHour: number) {
  let day = d + 1;
  while (limaParts(dayStart(day) + 12 * HOUR).weekday === 0) day++;
  return dayStart(day) + (fromHour + rng() * (toHour - fromHour)) * HOUR;
}

const CHANNEL_WEIGHTS: Record<LocationId, readonly number[]> = {
  // web, marketplace, pos, b2b
  LIM: [0.42, 0, 0.5, 0.08],
  AQP: [0.2, 0, 0.8, 0],
  CUS: [0.22, 0, 0.78, 0],
};
const CHANNELS: readonly Channel[] = ["web", "marketplace", "pos", "b2b"];

const POS_LABEL: Record<LocationId, string> = { LIM: "Tienda Miraflores", AQP: "Sucursal Arequipa", CUS: "Sucursal Cusco" };
const POS_ACTOR: Record<LocationId, string> = { LIM: ACTORS.posLim, AQP: ACTORS.posAqp, CUS: ACTORS.posCus };

function channelLabel(c: Channel, loc: LocationId, client?: string) {
  if (c === "web") return "Tienda online";
  if (c === "marketplace") return "Marketplace";
  if (c === "pos") return POS_LABEL[loc];
  return client ?? "Cliente B2B";
}

function channelActor(c: Channel, loc: LocationId) {
  if (c === "web") return ACTORS.web;
  if (c === "marketplace") return ACTORS.marketplace;
  if (c === "pos") return POS_ACTOR[loc];
  return ACTORS.b2b;
}

const DOC_FOR: Record<Channel, DocKind> = { web: "WEB", marketplace: "MKP", pos: "TK", b2b: "B2B" };
const SALES_CHANNEL: Record<Channel, SalesChannel> = { web: "online", marketplace: "online", pos: "tienda", b2b: "mayorista" };

function splitOrders(rng: Rng, p: Product, loc: LocationId, d: number, total: number, notBefore = 0, notAfter = Infinity): Candidate[] {
  const out: Candidate[] = [];
  let remaining = total;
  let guard = 0;
  while (remaining > 0 && guard++ < 400) {
    let channel = CHANNELS[weightedIndex(rng, CHANNEL_WEIGHTS[loc])]!;
    if (channel === "b2b" && (remaining < 3 || p.price > 260)) channel = "pos";
    let qty: number;
    if (channel === "b2b") qty = Math.min(remaining, randInt(rng, 3, 6));
    else {
      const r = rng();
      qty = Math.min(remaining, r < 0.76 ? 1 : r < 0.95 ? 2 : 3);
    }
    const hours = channel === "pos" ? POS_HOURS : channel === "b2b" ? B2B_HOURS : WEB_HOURS;
    let t = timeIn(rng, d, hours, notBefore);
    if (t > notAfter) t = notBefore + Math.floor(rng() * Math.max(1, (notAfter - notBefore) / MINUTE)) * MINUTE;
    const cand: Candidate = { t, loc, channel, qty };
    if (channel === "b2b") {
      cand.client = B2B_CLIENTS[randInt(rng, 0, B2B_CLIENTS.length - 1)];
      cand.dispatchAt = nextBusiness(d, rng, 9, 12);
    }
    out.push(cand);
    remaining -= qty;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Generación
// ---------------------------------------------------------------------------

const LEDGER_FIRST_DAY = TODAY - LEDGER_DAYS;
const REVIEW_PERIOD = 7;

export function generateDataset(): Dataset {
  const history = new Map<SkuLoc, number[]>();
  const opening = new Map<SkuLoc, { onHand: number; reserved: number }>();
  const lostSales = new Map<SkuLoc, number>();
  const raw: RawEvent[] = [];
  const pos: PoRecord[] = [];
  const pendingRaw: { sku: string; loc: LocationId; qty: number; ref: string; at: number; counterpart: string }[] = [];
  let seq = 0;
  let refCounter = 0;
  const nextRef = (kind: string) => `${kind}:${refCounter++}`;

  for (const p of PRODUCTS) {
    const rng = createRng(hashSeed(p.sku));
    const supplier = SUPPLIERS[p.supplierId]!;

    // --- Historial agregado previo al libro detallado ---
    const pre: Record<LocationId, number[]> = { LIM: [], AQP: [], CUS: [] };
    LOCATION_ORDER.forEach((loc, li) => {
      const isHero = p.sku === HERO_SKU && loc === HERO_LOC;
      for (let d = HISTORY_FIRST_DAY; d < LEDGER_FIRST_DAY; d++) {
        const mean = isHero ? heroPreStoryRate(d) * weekdayWeight(d) : expectedDemand(p, li, d);
        const noisy = mean * Math.max(0.3, 1 + 0.16 * (rng() + rng() + rng() - 1.5));
        const units = poisson(rng, noisy);
        pre[loc].push(units);
      }
    });

    // --- Candidatos de demanda del libro detallado ---
    const candidatesByDay = new Map<number, Candidate[]>();
    const pushCand = (d: number, c: Candidate) => {
      const list = candidatesByDay.get(d);
      if (list) list.push(c);
      else candidatesByDay.set(d, [c]);
    };

    LOCATION_ORDER.forEach((loc, li) => {
      const isHero = p.sku === HERO_SKU && loc === HERO_LOC;
      for (let d = LEDGER_FIRST_DAY; d <= TODAY; d++) {
        if (isHero && d >= HERO_STORY_FIRST_DAY) {
          const total = HERO_STORY_DEMAND[d - HERO_STORY_FIRST_DAY] ?? 0;
          const direct = total;
          const notBefore = d === HERO_STORY_FIRST_DAY ? STORY_START + 20 * MINUTE : dayStart(d);
          const notAfter = d === TODAY ? NOW - 15 * MINUTE : dayStart(d) + 23 * HOUR + 50 * MINUTE;
          const directOrders = splitHeroDirect(rng, loc, d, direct, notBefore, notAfter);
          directOrders.forEach((c) => pushCand(d, c));
          continue;
        }
        const mean = isHero ? heroPreStoryRate(d) * weekdayWeight(d) : expectedDemand(p, li, d);
        const noisy = mean * Math.max(0.3, 1 + 0.16 * (rng() + rng() + rng() - 1.5));
        const total = poisson(rng, noisy);
        if (total === 0) continue;
        const cands = splitOrders(rng, p, loc, d, total).filter((c) => c.t <= NOW);
        // El protagonista no tiene pedidos B2B antes de la historia (sin reservas abiertas al inicio).
        cands.forEach((c) => {
          if (isHero && c.channel === "b2b") c.channel = "web";
          pushCand(d, c);
        });
      }
    });

    // --- Estado inicial ---
    const state = {} as Record<LocationId, { onHand: number; reserved: number; onOrder: number; lost: number }>;
    const startStock = (li: number) => {
      const loc = LOCATION_ORDER[li]!;
      const startMean = expectedDemand(p, li, LEDGER_FIRST_DAY, false);
      let cover = p.startCover[li]!;
      if (p.policy[li] === "auto") {
        // Un negocio que repone con regularidad arranca con al menos un ciclo de compra cubierto.
        const lead = loc === "LIM" ? p.leadTime : LOCATIONS[loc].transitToLim + 1;
        cover = Math.max(cover, lead + (loc === "LIM" ? REVIEW_PERIOD : 3) + 4);
      }
      return p.startStock?.[li] ?? Math.round(cover * startMean);
    };
    LOCATION_ORDER.forEach((loc, li) => {
      state[loc] = { onHand: startStock(li), reserved: 0, onOrder: 0, lost: 0 };
    });
    const heroKey = p.sku === HERO_SKU;
    if (heroKey) state[HERO_LOC].onHand = 1000; // se corrige al final para anclar 84 u al inicio de la historia

    const scheduled = new Map<number, Scheduled[]>();
    const schedule = (s: Scheduled) => {
      if (s.t > NOW) return false;
      const d = dayIndex(s.t);
      const list = scheduled.get(d);
      if (list) list.push(s);
      else scheduled.set(d, [s]);
      return true;
    };

    const emit = (e: Omit<RawEvent, "seq" | "sku">) => {
      raw.push({ ...e, sku: p.sku, seq: seq++ });
    };

    // Recepción previa del protagonista (OC creada antes de la historia).
    if (heroKey) {
      const ref = nextRef("OC");
      const createdAt = dayStart(HERO_PREVIOUS_RECEIPT.day - p.leadTime) + 10 * HOUR + 12 * MINUTE;
      const eta = dayStart(HERO_PREVIOUS_RECEIPT.day) + 11 * HOUR + 20 * MINUTE;
      pos.push({ ref, sku: p.sku, loc: HERO_LOC, supplierId: p.supplierId, qty: HERO_PREVIOUS_RECEIPT.qty, createdAt, eta, received: true });
      schedule({ t: eta, kind: "receipt", loc: HERO_LOC, qty: HERO_PREVIOUS_RECEIPT.qty, ref, counterpart: supplier.name, orderQty: HERO_PREVIOUS_RECEIPT.qty });
      state[HERO_LOC].onOrder += HERO_PREVIOUS_RECEIPT.qty;
    }

    // Parámetros de la política de reposición simulada (lo que el negocio hacía antes de Crow CRM).
    const policyParams = (loc: LocationId, li: number, d: number) => {
      const rate = expectedDemand(p, li, d, false);
      const lead = loc === "LIM" ? p.leadTime : LOCATIONS[loc].transitToLim + 1;
      const review = loc === "LIM" ? REVIEW_PERIOD : 3;
      const safety = Math.max(1, 1.65 * Math.sqrt(Math.max(rate, 0.2) * lead));
      return { rate, lead, rop: rate * (lead + review) + safety, upTo: rate * (lead + review + 14) + safety };
    };

    const sellerReturns = (c: Candidate, d: number) => {
      if (c.channel === "b2b" || rng() > 0.022) return;
      if (heroKey && c.loc === HERO_LOC) return;
      const back = dayStart(d + randInt(rng, 2, 6)) + randInt(rng, 10, 18) * HOUR + randInt(rng, 0, 59) * MINUTE;
      const reasons = ["Cambio de talla", "No le quedó", "Cambio por otro color"];
      schedule({ t: back, kind: "return", loc: c.loc, qty: 1, ref: "", counterpart: channelLabel(c.channel, c.loc), note: reasons[randInt(rng, 0, 2)] });
    };

    // --- Simulación día a día ---
    for (let d = LEDGER_FIRST_DAY; d <= TODAY; d++) {
      type Item = { t: number; run: () => void };
      const items: Item[] = [];

      for (const c of candidatesByDay.get(d) ?? []) {
        items.push({
          t: c.t,
          run: () => {
            const s = state[c.loc];
            const available = s.onHand - s.reserved;
            if (available < c.qty) {
              s.lost += c.qty;
              return;
            }
            const counterpart = channelLabel(c.channel, c.loc, c.client);
            const actor = channelActor(c.channel, c.loc);
            // Los pedidos mayoristas se despachan en el momento (la demo no usa reservas).
            s.onHand -= c.qty;
            emit({
              t: c.t,
              type: "venta",
              loc: c.loc,
              qty: c.qty,
              dOnHand: -c.qty,
              dReserved: 0,
              demand: c.qty,
              counterpart,
              actor,
              docKind: DOC_FOR[c.channel],
              docRef: nextRef(DOC_FOR[c.channel]),
              channel: SALES_CHANNEL[c.channel],
            });
            sellerReturns(c, d);
          },
        });
      }

      for (const s of scheduled.get(d) ?? []) {
        items.push({
          t: s.t,
          run: () => {
            const st = state[s.loc];
            if (s.kind === "dispatch") {
              st.onHand -= s.qty;
              st.reserved -= s.qty;
              emit({ t: s.t, type: "venta", loc: s.loc, qty: s.qty, dOnHand: -s.qty, dReserved: -s.qty, demand: 0, counterpart: s.counterpart, actor: WAREHOUSE_ACTOR[s.loc], docKind: "B2B", docRef: s.ref, note: "Despacho de pedido reservado" });
            } else if (s.kind === "receipt") {
              const ordered = s.orderQty ?? s.qty;
              st.onOrder -= ordered;
              st.onHand += s.qty;
              const po = pos.find((x) => x.ref === s.ref);
              if (po) po.received = true;
              emit({ t: s.t, type: "recepcion", loc: s.loc, qty: s.qty, dOnHand: s.qty, dReserved: 0, demand: 0, counterpart: s.counterpart, actor: s.loc === "LIM" ? ACTORS.rcvLim : WAREHOUSE_ACTOR[s.loc], docKind: "OC", docRef: s.ref, note: s.qty < ordered ? `Recepción parcial: ${s.qty} de ${ordered} u` : "Recepción completa" });
            } else if (s.kind === "transfer_in") {
              st.onOrder -= s.qty;
              st.onHand += s.qty;
              const po = pos.find((x) => x.ref === s.ref);
              if (po) po.received = true;
              emit({ t: s.t, type: "transferencia", loc: s.loc, qty: s.qty, dOnHand: s.qty, dReserved: 0, demand: 0, counterpart: s.counterpart, actor: WAREHOUSE_ACTOR[s.loc], docKind: "TR", docRef: s.ref, direction: "in", note: "Transferencia recibida" });
            } else if (s.kind === "return") {
              st.onHand += s.qty;
              emit({ t: s.t, type: "devolucion", loc: s.loc, qty: s.qty, dOnHand: s.qty, dReserved: 0, demand: 0, counterpart: s.counterpart, actor: WAREHOUSE_ACTOR[s.loc], docKind: "DV", docRef: nextRef("DV"), note: s.note });
            }
          },
        });
      }

      // Ajustes de conteo cíclico antes de abrir (nunca sobre el protagonista en Lurín).
      LOCATION_ORDER.forEach((loc) => {
        if (heroKey && loc === HERO_LOC) return;
        if (rng() > 0.012) return;
        const t = dayStart(d) + 7 * HOUR + randInt(rng, 10, 55) * MINUTE;
        if (t > NOW) return;
        items.push({
          t,
          run: () => {
            const st = state[loc];
            const r = rng();
            const delta = r < 0.45 ? -1 : r < 0.7 ? -2 : 1;
            if (st.onHand + delta < st.reserved) return;
            st.onHand += delta;
            const note = delta > 0 ? "Conteo cíclico: sobrante" : r < 0.45 ? "Conteo cíclico: faltante" : "Unidades dañadas en almacén";
            emit({ t, type: "ajuste", loc, qty: Math.abs(delta), dOnHand: delta, dReserved: 0, demand: 0, counterpart: "Inventario", actor: WAREHOUSE_ACTOR[loc], docKind: "AJ", docRef: nextRef("AJ"), note });
          },
        });
      });

      // Revisión de reposición diaria a las 10:00 (lunes a sábado).
      const reviewAt = dayStart(d) + 10 * HOUR;
      if (limaParts(reviewAt).weekday !== 0 && reviewAt <= NOW) {
        items.push({
          t: reviewAt,
          run: () => {
            LOCATION_ORDER.forEach((loc, li) => {
              if (p.policy[li] !== "auto") return;
              const st = state[loc];
              const { rop, upTo, lead } = policyParams(loc, li, d);
              const position = st.onHand - st.reserved + st.onOrder;
              if (position > rop) return;
              const need = upTo - position;
              const lim = state.LIM;
              const limParams = policyParams("LIM", 0, d);
              // El CD prioriza a sus almacenes: cede stock mientras conserve unos días de venta propia.
              const limSpare = lim.onHand - lim.reserved - (limParams.rate * 5 + 2);
              if (loc !== "LIM" && p.policy[0] === "auto" && limSpare >= need) {
                const qty = Math.max(1, Math.round(need));
                const ref = nextRef("TR");
                lim.onHand -= qty;
                st.onOrder += qty;
                const departAt = reviewAt + randInt(rng, 60, 240) * MINUTE;
                emit({ t: departAt, type: "transferencia", loc: "LIM", qty, dOnHand: -qty, dReserved: 0, demand: 0, counterpart: LOCATIONS[loc].name, actor: ACTORS.whLim, docKind: "TR", docRef: ref, direction: "out", note: "Reposición a almacén regional" });
                const eta = dayStart(d + LOCATIONS[loc].transitToLim) + randInt(rng, 11, 16) * HOUR + randInt(rng, 0, 59) * MINUTE;
                pos.push({ ref, sku: p.sku, loc, supplierId: p.supplierId, qty, createdAt: reviewAt, eta, received: false, transferFrom: "LIM" });
                schedule({ t: Math.max(eta, departAt + 3 * HOUR), kind: "transfer_in", loc, qty, ref, counterpart: LOCATIONS.LIM.name });
                return;
              }
              const qty = Math.max(p.packSize, Math.ceil(need / p.packSize) * p.packSize);
              const ref = nextRef("OC");
              const supplierLead = loc === "LIM" ? lead : p.leadTime + LOCATIONS[loc].transitToLim;
              const leadDays = supplierLead + randInt(rng, -supplier.leadTimeSpread, supplier.leadTimeSpread);
              const eta = dayStart(d + Math.max(1, leadDays)) + randInt(rng, 9, 15) * HOUR + randInt(rng, 0, 59) * MINUTE;
              st.onOrder += qty;
              pos.push({ ref, sku: p.sku, loc, supplierId: p.supplierId, qty, createdAt: reviewAt + randInt(rng, 5, 40) * MINUTE, eta, received: false });
              const partial = rng() > supplier.fillRate;
              const received = partial ? Math.max(1, Math.round(qty * (0.7 + rng() * 0.2))) : qty;
              schedule({ t: eta, kind: "receipt", loc, qty: received, ref, counterpart: supplier.name, orderQty: qty });
            });
          },
        });
      }

      items.sort((a, b) => a.t - b.t);
      for (const it of items) it.run();
    }

    // --- Historial diario completo ---
    LOCATION_ORDER.forEach((loc) => {
      const key = skuLoc(p.sku, loc);
      const ledgerDaily = new Array<number>(LEDGER_DAYS).fill(0);
      for (const e of raw) {
        if (e.sku !== p.sku || e.loc !== loc || e.demand === 0) continue;
        const di = dayIndex(e.t) - LEDGER_FIRST_DAY;
        if (di >= 0 && di < LEDGER_DAYS) ledgerDaily[di]! += e.demand;
      }
      history.set(key, [...pre[loc], ...ledgerDaily]);
      lostSales.set(key, state[loc].lost);
    });

    // --- Apertura ---
    LOCATION_ORDER.forEach((loc, li) => {
      opening.set(skuLoc(p.sku, loc), { onHand: startStock(li), reserved: 0 });
    });
    if (heroKey) {
      // Ancla: el protagonista tiene exactamente 84 u al empezar la historia.
      let onHand = 1000;
      for (const e of raw) if (e.sku === p.sku && e.loc === HERO_LOC && e.t < STORY_START) onHand += e.dOnHand;
      opening.set(skuLoc(p.sku, HERO_LOC), { onHand: 1000 - (onHand - HERO_STORY_OPENING), reserved: 0 });
    }
  }

  // --- Orden cronológico, documentos e identificadores ---
  raw.sort((a, b) => a.t - b.t || a.seq - b.seq);

  const docCounters: Record<DocKind, number> = { WEB: 20410, MKP: 1730, TK: 58300, B2B: 1180, OC: 214, TR: 86, AJ: 310, DV: 420 };
  const docNames = new Map<string, string>();
  const formatDoc = (kind: DocKind, n: number) => {
    if (kind === "OC") return `OC-2026-${String(n).padStart(4, "0")}`;
    if (kind === "TR") return `TR-${String(n).padStart(4, "0")}`;
    if (kind === "TK") return `B-${n}`;
    if (kind === "B2B") return `MAY-${n}`;
    return `${kind}-${n}`;
  };
  // Las OC y transferencias se numeran por fecha de creación (incluidas las abiertas).
  [...pos]
    .sort((a, b) => a.createdAt - b.createdAt)
    .forEach((po) => {
      const kind: DocKind = po.transferFrom ? "TR" : "OC";
      docNames.set(po.ref, formatDoc(kind, docCounters[kind]++));
    });
  const docFor = (e: RawEvent) => {
    let name = docNames.get(e.docRef);
    if (!name) {
      name = formatDoc(e.docKind, docCounters[e.docKind]++);
      docNames.set(e.docRef, name);
    }
    return name;
  };

  const running = new Map<SkuLoc, { onHand: number; reserved: number }>();
  for (const [k, v] of opening) running.set(k, { ...v });

  const movements: Movement[] = [];
  const byKey = new Map<SkuLoc, Movement[]>();
  raw.forEach((e, i) => {
    const key = skuLoc(e.sku, e.loc);
    const st = running.get(key)!;
    const onHandBefore = st.onHand;
    const availableBefore = st.onHand - st.reserved;
    st.onHand += e.dOnHand;
    st.reserved += e.dReserved;
    const m: Movement = {
      id: `MV-${310400 + i}`,
      t: e.t,
      type: e.type,
      sku: e.sku,
      loc: e.loc,
      qty: e.qty,
      dOnHand: e.dOnHand,
      dReserved: e.dReserved,
      demand: e.demand,
      counterpart: e.counterpart,
      actor: e.actor,
      doc: docFor(e),
      note: e.note,
      direction: e.direction,
      channel: e.channel,
      onHandBefore,
      onHandAfter: st.onHand,
      availableBefore,
      availableAfter: st.onHand - st.reserved,
    };
    movements.push(m);
    const list = byKey.get(key);
    if (list) list.push(m);
    else byKey.set(key, [m]);
  });

  const purchaseOrders: PurchaseOrder[] = pos
    .map((po) => ({
      id: docNames.get(po.ref)!,
      sku: po.sku,
      loc: po.loc,
      supplierId: po.supplierId,
      qty: po.qty,
      createdAt: po.createdAt,
      eta: po.eta,
      status: po.received ? ("recibida" as const) : NOW - po.createdAt > DAY ? ("en_transito" as const) : ("confirmada" as const),
      transferFrom: po.transferFrom,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);

  const pendingDispatches: PendingDispatch[] = pendingRaw.map((r) => ({
    key: skuLoc(r.sku, r.loc),
    sku: r.sku,
    loc: r.loc,
    qty: r.qty,
    doc: docNames.get(r.ref) ?? r.ref,
    at: r.at,
    counterpart: r.counterpart,
  }));

  return { history, movements, byKey, opening, purchaseOrders, lostSales, pendingDispatches };
}

/** Pedidos directos del protagonista durante la historia (sin B2B, que va guionado). */
function splitHeroDirect(rng: Rng, loc: LocationId, d: number, total: number, notBefore: number, notAfter: number): Candidate[] {
  const out: Candidate[] = [];
  let remaining = total;
  const span = Math.max(1, (notAfter - notBefore) / MINUTE);
  while (remaining > 0) {
    const qty = Math.min(remaining, rng() < 0.82 ? 1 : 2);
    const channel: Channel = rng() < 0.45 ? "web" : "pos";
    let t = channel === "pos" ? dayStart(d) + randInt(rng, 10, 20) * HOUR + randInt(rng, 0, 59) * MINUTE : timeIn(rng, d, WEB_HOURS, notBefore);
    if (t < notBefore || t > notAfter) t = notBefore + Math.floor(rng() * span) * MINUTE;
    out.push({ t, loc, channel, qty });
    remaining -= qty;
  }
  return out;
}

let cached: Dataset | null = null;

/** Dataset base (se genera una sola vez por proceso o pestaña). */
export function getDataset(): Dataset {
  cached ??= generateDataset();
  return cached;
}
