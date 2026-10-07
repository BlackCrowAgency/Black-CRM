"use client";

import { create } from "zustand";
import { createPurchaseOrder, receiptFor, toMovement, type MovementDraft } from "@/domain/actions";
import { HERO_SKU, productOf } from "@/domain/catalog";
import { groupExtra, type Decision } from "@/domain/engine";
import { getDataset } from "@/domain/generator";
import { positionAt } from "@/domain/ledger";
import { HOUR, MINUTE, NOW } from "@/domain/time";
import type { CategoryId, Movement, PurchaseOrder } from "@/domain/types";
import { skuLoc } from "@/domain/types";

/**
 * Estado compartido de la demo. Tarjetas, alertas, actividad, ficha de
 * producto, simulación y reposición leen y escriben aquí; el motor
 * recalcula todo a partir de este estado, así que un cambio de stock se
 * refleja en todas partes a la vez.
 */

export type StockFilter = "todos" | "bajo" | "rapido" | "sin_mov";
export type Scenario = "normal" | "mas" | "promo";
export type ActivityFilter = "todo" | "ventas" | "entradas" | "devoluciones";

/** Cuánto más se vendería en cada escenario de la simulación. */
export const SCENARIO_FACTOR: Record<Scenario, number> = { normal: 1, mas: 1.3, promo: 1.7 };

export interface Toast {
  id: number;
  tone: "info" | "ok" | "warn";
  title: string;
  body?: string;
  sku?: string;
}

interface BlackCrmState {
  simNow: number;
  asOf: number;
  live: boolean;
  liveStarted: boolean;
  extra: Movement[];
  orders: PurchaseOrder[];
  decisions: Record<string, Decision>;
  toasts: Toast[];
  nextId: number;
  toastSeq: number;

  filter: StockFilter;
  category: CategoryId | "all";
  query: string;
  productOpen: string | null;
  replenishOpen: string | null;
  /** Cantidad propuesta al abrir la reposición (p. ej., desde la simulación). */
  replenishQty: number | null;
  whatIf: { sku: string; scenario: Scenario };
  activity: ActivityFilter;

  setFilter(f: StockFilter): void;
  setCategory(c: CategoryId | "all"): void;
  setQuery(q: string): void;
  openProduct(sku: string): void;
  closeProduct(): void;
  openReplenish(sku: string, qty?: number): void;
  closeReplenish(): void;
  setWhatIf(patch: Partial<{ sku: string; scenario: Scenario }>): void;
  setActivity(a: ActivityFilter): void;

  startLive(): void;
  setLive(on: boolean): void;
  advance(to: number, drafts: MovementDraft[]): void;

  /** Prepara la reposición: genera el pedido al proveedor con la cantidad elegida. */
  prepareReplenishment(sku: string, qty: number): PurchaseOrder;
  /** «Recordármelo después»: oculta la alerta durante 24 h simuladas. */
  remindLater(sku: string): void;
  /** Marca como recibida una reposición en camino (entra el stock). */
  receive(orderId: string): void;
  /** Deshace pedidos creados en la sesión: el producto vuelve a pedir reposición. */
  cancelOrders(ids: readonly string[]): void;

  notify(toast: Omit<Toast, "id">): void;
  dismiss(id: number): void;
}

const dataset = getDataset();
const BASE_ID = 310400 + dataset.movements.length;

function applyDrafts(state: Pick<BlackCrmState, "extra" | "nextId">, drafts: MovementDraft[]) {
  const extra = [...state.extra];
  let nextId = state.nextId;
  const applied: Movement[] = [];
  for (const d of drafts) {
    const key = skuLoc(d.sku, d.loc);
    const pos = positionAt(key, d.t, groupExtra(extra));
    if (d.dOnHand < 0 && pos.onHand + d.dOnHand < 0) continue;
    if (d.demand > 0 && pos.available < d.qty) continue;
    const m = toMovement(d, `MV-${nextId++}`, pos);
    extra.push(m);
    applied.push(m);
  }
  return { extra, nextId, applied };
}

const pushToast = (s: BlackCrmState, toast: Omit<Toast, "id">) => ({
  toasts: [...s.toasts, { ...toast, id: s.toastSeq }].slice(-3),
  toastSeq: s.toastSeq + 1,
});

export const useBlackCrm = create<BlackCrmState>()((set, get) => ({
  simNow: NOW,
  asOf: NOW,
  live: true,
  liveStarted: false,
  extra: [],
  orders: dataset.purchaseOrders,
  decisions: {},
  toasts: [],
  nextId: BASE_ID,
  toastSeq: 1,

  filter: "todos",
  category: "all",
  query: "",
  productOpen: null,
  replenishOpen: null,
  replenishQty: null,
  whatIf: { sku: "MOC-ESS", scenario: "normal" },
  activity: "todo",

  setFilter: (filter) => set({ filter }),
  setCategory: (category) => set({ category }),
  setQuery: (query) => set({ query }),
  openProduct: (productOpen) => set({ productOpen, replenishOpen: null }),
  closeProduct: () => set({ productOpen: null }),
  openReplenish: (replenishOpen, qty) => set({ replenishOpen, replenishQty: qty ?? null, productOpen: null }),
  closeReplenish: () => set({ replenishOpen: null }),
  setWhatIf: (patch) => set((s) => ({ whatIf: { ...s.whatIf, ...patch } })),
  setActivity: (activity) => set({ activity }),

  startLive: () => {
    if (!get().liveStarted) set({ liveStarted: true });
  },
  setLive: (live) => set({ live }),

  advance: (to, drafts) => {
    const s = get();
    const from = s.simNow;
    const all: MovementDraft[] = [...drafts];
    // Reposiciones del histórico que llegan en este intervalo.
    const arriving = s.orders.filter((o) => o.status !== "recibida" && !o.userCreated && o.eta > from && o.eta <= to);
    for (const o of arriving) all.push(receiptFor(o, o.eta));
    if (!all.length) {
      set(to - s.asOf >= 30 * MINUTE ? { simNow: to, asOf: to } : { simNow: to });
      return;
    }
    all.sort((a, b) => a.t - b.t);
    const { extra, nextId, applied } = applyDrafts(s, all);
    const arrived = new Set(arriving.filter((o) => applied.some((m) => m.doc === o.id)).map((o) => o.id));
    let next: Partial<BlackCrmState> = {};
    for (const o of arriving) {
      if (!arrived.has(o.id)) continue;
      next = { ...next, ...pushToast({ ...s, ...next } as BlackCrmState, { tone: "ok", title: "Recepción registrada", body: `+${o.qty} ${productOf(o.sku).name}`, sku: o.sku }) };
    }
    set({
      ...next,
      simNow: to,
      asOf: to,
      extra,
      nextId,
      orders: arrived.size ? s.orders.map((o) => (arrived.has(o.id) ? { ...o, status: "recibida" as const } : o)) : s.orders,
    });
  },

  prepareReplenishment: (sku, qty) => {
    const s = get();
    const order = createPurchaseOrder({ sku, loc: "LIM", qty, asOf: s.simNow, orders: s.orders });
    const key = skuLoc(sku, "LIM");
    set({
      orders: [order, ...s.orders],
      decisions: { ...s.decisions, [key]: { status: "orden_creada", at: s.simNow, qty, orderId: order.id } },
      replenishOpen: null,
      asOf: s.simNow,
      ...pushToast(s, { tone: "ok", title: "Pedido de reposición creado", body: `${order.id} · ${qty} ${productOf(sku).name}`, sku }),
    });
    return order;
  },

  cancelOrders: (ids) => {
    const s = get();
    const drop = new Set(ids);
    const decisions = Object.fromEntries(Object.entries(s.decisions).filter(([, d]) => !(d.orderId && drop.has(d.orderId))));
    set({ orders: s.orders.filter((o) => !drop.has(o.id)), decisions, asOf: s.simNow });
  },

  remindLater: (sku) => {
    const s = get();
    const key = skuLoc(sku, "LIM");
    set({
      decisions: { ...s.decisions, [key]: { status: "pospuesta", at: s.simNow, until: s.simNow + 24 * HOUR } },
      replenishOpen: null,
      asOf: s.simNow,
      ...pushToast(s, { tone: "info", title: "Recordatorio programado en 24 h", body: productOf(sku).name, sku }),
    });
  },

  receive: (orderId) => {
    const s = get();
    const order = s.orders.find((o) => o.id === orderId);
    if (!order || order.status === "recibida") return;
    const at = s.simNow + 1000;
    const { extra, nextId } = applyDrafts(s, [receiptFor(order, at)]);
    const key = skuLoc(order.sku, order.loc);
    const decisions = { ...s.decisions };
    delete decisions[key];
    set({
      extra,
      nextId,
      decisions,
      orders: s.orders.map((o) => (o.id === orderId ? { ...o, status: "recibida" as const } : o)),
      asOf: at,
      simNow: Math.max(s.simNow, at),
      ...pushToast(s, { tone: "ok", title: "Recepción registrada", body: `+${order.qty} ${productOf(order.sku).name}`, sku: order.sku }),
    });
  },

  notify: (toast) => set((s) => pushToast(s, toast)),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const HERO = HERO_SKU;
