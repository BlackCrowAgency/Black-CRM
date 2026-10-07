"use client";

import { useMemo } from "react";
import { CATEGORIES, HERO_SKU, SUPPLIERS } from "@/domain/catalog";
import { fmtDays, fmtMonth } from "@/domain/format";
import { getDataset } from "@/domain/generator";
import { categoryPerformance, revenueByDay } from "@/domain/growth";
import { positionAt } from "@/domain/ledger";
import type { ProductView } from "@/domain/simple";
import { HERO_KEY } from "@/domain/story";
import { DAY, NOW, STORY_START, dayIndex, dayStart } from "@/domain/time";
import type { Movement, ProductArt } from "@/domain/types";
import { useEngine } from "@/components/inventory/EngineProvider";

export interface Point {
  t: number;
  v: number;
}

export interface CinemaData {
  hero: ProductView;
  /** Pares disponibles al inicio de la historia (hace diez días). */
  heroStart: number;
  supplier: string;
  recQty: number;
  recPacks: number;
  packSize: number;
  recEta: number;
  recCost: number;
  /** Demanda estimada de los próximos 14 días. */
  demand14: number;
  /** Días que cubre el stock después de recibir el pedido. */
  coverAfter: number;
  forecast: { past: Point[]; future: Point[]; withOrder: Point[]; stockout: number | null };
  months: { label: string; revenue: number }[];
  growth6: number;
  kpis: { today: number; todayUnits: number; revenue7: number; revenueDelta: number; units: number; products: number; alerts: number; runningOut: number };
  /** Ventas recientes de toda la tienda para el teletipo de la barra superior. */
  ticker: Movement[];
  otherAlerts: { sku: string; name: string; detail: string }[];
  /** Crecimiento de cada categoría: 30 días frente a los 30 anteriores. */
  categories: { name: string; revenue30: number; growth: number }[];
  /** Producto con más valor inmovilizado (sin ventas o sobrestock). */
  idle: { sku: string; name: string; art: ProductArt; available: number; value: number; price: number; why: string } | null;
  /** El protagonista ya tiene un pedido en camino. */
  ordered: boolean;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

function idleOf(views: readonly ProductView[]): CinemaData["idle"] {
  const v = views.filter((x) => x.state === "sin_ventas" || x.state === "demasiado").sort((a, b) => b.a.value - a.a.value)[0];
  if (!v) return null;
  // Motivo exacto: sin ventas, o ventas tan lentas que el stock dura meses.
  const why = v.state === "sin_ventas" || v.daysLeft === null ? "sin ventas en 30 días" : `stock para ${fmtDays(v.daysLeft, 0)}`;
  return { sku: v.sku, name: v.product.name, art: v.product.art, available: v.available, value: v.a.value, price: v.product.price, why };
}

/** Todo lo que cuenta la escena sale del mismo motor que el resto del sistema. */
export function useCinemaData(): CinemaData {
  const { views, sales, summary, moves, engine, alerts } = useEngine();
  return useMemo(() => {
    const hero = views.find((v) => v.sku === HERO_SKU)!;
    const p = hero.product;
    const heroStart = positionAt(HERO_KEY, STORY_START).available;
    const recQty = hero.rec?.qty ?? hero.incoming?.qty ?? 40;
    const recEta = hero.rec?.eta ?? hero.incoming?.eta ?? NOW + p.leadTime * DAY;
    const demand14 = sum(hero.a.projected.slice(0, 14));

    // Pronóstico: stock real de los últimos días, proyección y proyección con el pedido.
    const past: Point[] = [];
    for (let d = dayIndex(STORY_START); d < dayIndex(NOW); d++) past.push({ t: dayStart(d + 1), v: positionAt(HERO_KEY, dayStart(d + 1)).available });
    past.push({ t: NOW, v: hero.available });
    const future: Point[] = [{ t: NOW, v: hero.available }];
    const withOrder: Point[] = [{ t: NOW, v: hero.available }];
    const etaDay = dayIndex(recEta);
    // Con un pedido en camino la proyección del motor ya incluye la llegada.
    const ordered = Boolean(hero.incoming);
    let extra = 0;
    hero.a.stockPath.slice(0, 14).forEach((v, h) => {
      const t = dayStart(dayIndex(NOW) + h + 1);
      if (!ordered && dayIndex(NOW) + h >= etaDay && !extra) extra = recQty;
      future.push({ t, v: Math.max(0, v) });
      withOrder.push({ t, v: Math.max(0, v + extra) });
    });

    const days = revenueByDay(moves, engine.asOf, 181).slice(0, -1);
    const months = [0, 1, 2, 3, 4, 5].map((m) => {
      const block = days.slice(m * 30, m * 30 + 30);
      return { label: fmtMonth(block[15]!.t), revenue: sum(block.map((d) => d.revenue)) };
    });

    const ticker: Movement[] = [];
    const list = getDataset().movements;
    for (let i = list.length - 1; i >= 0 && ticker.length < 6; i--) if (list[i]!.type === "venta" && list[i]!.t <= NOW) ticker.push(list[i]!);

    return {
      hero,
      heroStart,
      supplier: SUPPLIERS[p.supplierId]!.name,
      recQty,
      recPacks: Math.max(1, Math.round(recQty / p.packSize)),
      packSize: p.packSize,
      recEta,
      recCost: recQty * p.unitCost,
      demand14,
      coverAfter: hero.a.meanDaily > 0 ? (hero.available + recQty) / hero.a.meanDaily : Infinity,
      forecast: { past, future, withOrder, stockout: hero.runOutAt },
      months,
      growth6: months[0]!.revenue > 0 ? months[5]!.revenue / months[0]!.revenue - 1 : 0,
      kpis: {
        today: sales.todayRevenue,
        todayUnits: sales.todayUnits,
        revenue7: sales.revenue7,
        revenueDelta: sales.revenuePrev7 > 0 ? sales.revenue7 / sales.revenuePrev7 - 1 : 0,
        units: summary.units,
        products: summary.products,
        alerts: alerts.length,
        runningOut: summary.runningOut,
      },
      ticker,
      otherAlerts: alerts
        .filter((a) => a.sku !== HERO_SKU)
        .slice(0, 2)
        .map((a) => ({ sku: a.sku, name: views.find((v) => v.sku === a.sku)?.product.name ?? a.sku, detail: a.title })),
      categories: categoryPerformance(moves, engine, views)
        .map((c) => ({ name: CATEGORIES[c.category].name, revenue30: c.revenue30, growth: c.growth }))
        .sort((a, b) => b.growth - a.growth),
      idle: idleOf(views),
      ordered,
    };
  }, [views, sales, summary, moves, engine, alerts]);
}
