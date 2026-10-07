import type { MovementDraft } from "./actions";
import { ACTORS, B2B_CLIENTS, WAREHOUSE_ACTOR, productOf } from "./catalog";
import { getDataset } from "./generator";
import type { Position } from "./ledger";
import { createRng, randInt, weightedIndex, type Rng } from "./random";
import { MINUTE, limaParts } from "./time";
import type { LocationId, SalesChannel, SkuLoc } from "./types";
import { parseSkuLoc } from "./types";

/**
 * Flujo en vivo: después de la historia la tienda sigue vendiendo. Cada
 * minuto simulado puede traer ventas en tienda, online o mayoristas,
 * devoluciones o ajustes, con probabilidades derivadas del ritmo esperado
 * de cada producto. Una venta nunca supera lo disponible.
 */

/** Peso relativo de las ventas por hora del día (suma 24). */
const HOUR_WEIGHT = (() => {
  const raw = [0.15, 0.08, 0.04, 0.04, 0.04, 0.08, 0.25, 0.5, 0.8, 1.1, 1.45, 1.55, 1.7, 1.6, 1.4, 1.35, 1.4, 1.55, 1.75, 1.8, 1.6, 1.2, 0.75, 0.35];
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((w) => (w * 24) / total);
})();

interface ChannelDef {
  channel: SalesChannel;
  label: string;
  actor: string;
  prefix: string;
  weight: number;
}

const CHANNELS: Record<LocationId, ChannelDef[]> = {
  LIM: [
    { channel: "tienda", label: "Tienda Miraflores", actor: ACTORS.posLim, prefix: "B", weight: 0.52 },
    { channel: "online", label: "Tienda online", actor: ACTORS.web, prefix: "WEB", weight: 0.44 },
    { channel: "mayorista", label: "Pedido mayorista", actor: ACTORS.b2b, prefix: "MAY", weight: 0.04 },
  ],
  AQP: [{ channel: "tienda", label: "Sucursal Arequipa", actor: ACTORS.posAqp, prefix: "B", weight: 1 }],
  CUS: [{ channel: "tienda", label: "Sucursal Cusco", actor: ACTORS.posCus, prefix: "B", weight: 1 }],
};

function maxDocNumbers() {
  const max: Record<string, number> = {};
  for (const m of getDataset().movements) {
    const match = /^(WEB|B|MAY|DV|AJ)-(\d+)$/.exec(m.doc);
    if (!match) continue;
    const n = Number(match[2]);
    if (n > (max[match[1]!] ?? 0)) max[match[1]!] = n;
  }
  return max;
}

export interface LiveContext {
  position(key: SkuLoc): Position;
}

export class LiveSimulator {
  private readonly rng: Rng;
  private readonly counters: Record<string, number>;

  constructor(
    private readonly rates: ReadonlyMap<SkuLoc, number>,
    seed = 20260929,
  ) {
    this.rng = createRng(seed);
    this.counters = maxDocNumbers();
  }

  private doc(prefix: string) {
    const n = (this.counters[prefix] ?? 1000) + 1;
    this.counters[prefix] = n;
    return `${prefix}-${n}`;
  }

  /** Eventos ocurridos en (from, to]. */
  step(from: number, to: number, ctx: LiveContext): MovementDraft[] {
    const out: MovementDraft[] = [];
    const minutes = Math.max(0, Math.round((to - from) / MINUTE));
    for (let i = 1; i <= minutes; i++) {
      const t = from + i * MINUTE;
      const hour = limaParts(t).hours;
      const w = HOUR_WEIGHT[hour]!;
      const storeOpen = hour >= 10 && hour < 21;
      for (const [key, daily] of this.rates) {
        const lambda = (daily / 1440) * w;
        if (lambda <= 0 || this.rng() > lambda) continue;
        const { sku, loc } = parseSkuLoc(key);
        const pending = out.filter((d) => d.sku === sku && d.loc === loc).reduce((a, d) => a + d.dOnHand, 0);
        const available = ctx.position(key).available + pending;
        if (available <= 0) continue;

        const defs = CHANNELS[loc];
        const weights = defs.map((c) => (c.channel === "tienda" && !storeOpen ? 0 : c.channel === "mayorista" && (!storeOpen || available < 6 || productOf(sku).price > 260) ? 0 : c.weight));
        const ch = defs[weightedIndex(this.rng, weights)]!;
        const qty = ch.channel === "mayorista" ? Math.min(available, randInt(this.rng, 3, 5)) : Math.min(available, this.rng() < 0.84 ? 1 : 2);
        out.push({
          t: t + randInt(this.rng, 0, 59) * 1000,
          type: "venta",
          sku,
          loc,
          qty,
          dOnHand: -qty,
          dReserved: 0,
          demand: qty,
          counterpart: ch.channel === "mayorista" ? B2B_CLIENTS[randInt(this.rng, 0, B2B_CLIENTS.length - 1)]! : ch.label,
          actor: ch.actor,
          doc: this.doc(ch.prefix),
          channel: ch.channel,
        });
      }

      // Devoluciones y ajustes, poco frecuentes.
      if (storeOpen && this.rng() < 0.01) {
        const keys = [...this.rates.keys()];
        const key = keys[randInt(this.rng, 0, keys.length - 1)]!;
        const { sku, loc } = parseSkuLoc(key);
        out.push({
          t,
          type: "devolucion",
          sku,
          loc,
          qty: 1,
          dOnHand: 1,
          dReserved: 0,
          demand: 0,
          counterpart: this.rng() < 0.5 ? "Tienda online" : "Tienda Miraflores",
          actor: WAREHOUSE_ACTOR[loc],
          doc: this.doc("DV"),
          note: "Cambio de talla",
        });
      } else if (this.rng() < 0.003) {
        const keys = [...this.rates.keys()];
        const key = keys[randInt(this.rng, 0, keys.length - 1)]!;
        const { sku, loc } = parseSkuLoc(key);
        if (ctx.position(key).available > 2) {
          out.push({
            t,
            type: "ajuste",
            sku,
            loc,
            qty: 1,
            dOnHand: -1,
            dReserved: 0,
            demand: 0,
            counterpart: "Inventario",
            actor: WAREHOUSE_ACTOR[loc],
            doc: this.doc("AJ"),
            note: "Unidad dañada",
          });
        }
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }
}
