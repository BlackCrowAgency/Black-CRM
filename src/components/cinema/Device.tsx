"use client";

import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import { Bell, Boxes, LayoutGrid, LineChart, PackageCheck, Search, Settings, Sparkles, TriangleAlert, Truck } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { CATEGORIES, productOf } from "@/domain/catalog";
import { fmtDate, fmtDateShort, fmtDays, fmtInt, fmtMoney, fmtMoneyShort, fmtPct, fmtRelative } from "@/domain/format";
import { whenText } from "@/domain/simple";
import { DAY, NOW, STORY_START } from "@/domain/time";
import { Logo } from "@/components/chrome/Logo";
import { ProductArt } from "@/components/product/ProductArt";
import { movementTitle } from "@/components/inventory/words";
import type { CinemaData, Point } from "./data";
import { DEPTH, DEVICE, MODULES, type ModuleId } from "./layout";
import styles from "./cinema.module.css";

/** Nodos que la escena actualiza en cada fotograma sin re-renderizar React (marcados con `data-scrub`). */
export type ScrubKey = "count" | "when" | "units" | "lastSale" | "orderQty" | "packs";

/** Cambios que el asistente aplica sobre el panel en el capítulo final. */
export interface PanelState {
  growthView: "meses" | "categorias";
  /** SKU con promoción activa (se muestra en el módulo de stock). */
  promo: string | null;
  /** Piezas que el asistente acaba de tocar: se resaltan unos segundos. */
  spotlight: ModuleId[];
}

export const PANEL_INITIAL: PanelState = { growthView: "meses", promo: null, spotlight: [] };

function Module({ id, children, className, tone, spot }: { id: ModuleId; children: ReactNode; className?: string; tone?: "warn" | "mint" | "violet"; spot?: boolean }) {
  const b = MODULES[id];
  return (
    <div
      className={`${styles.module} ${className ?? ""}`}
      data-m={id}
      data-tone={tone}
      data-spot={spot || undefined}
      style={{ left: b.x, top: b.y, width: b.w, height: b.h, "--z": `${DEPTH[id]}px` } as CSSProperties}
    >
      {children}
    </div>
  );
}

/**
 * El panel de Crow CRM tal como lo usa el equipo: barra superior, indicadores,
 * stock del producto, pronóstico, alerta, pedido sugerido y crecimiento.
 */
export function Device({ data, interactive, panel, onOrder }: { data: CinemaData; interactive: boolean; panel: PanelState; onOrder(): void }) {
  const { hero, kpis, ordered } = data;
  const cells = Math.max(data.heroStart, 42);
  const spot = (id: ModuleId) => interactive && panel.spotlight.includes(id);
  const promo = interactive && panel.promo && data.idle?.sku === panel.promo ? data.idle : null;
  const byCategory = interactive && panel.growthView === "categorias";

  return (
    <div className={styles.deviceInner} style={{ width: DEVICE.w, height: DEVICE.h }}>
      <div className={styles.base} />

      <Module id="topbar" className={styles.topbar}>
        <Logo size={22} />
        <span className={styles.appName}>Crow</span>
        <span className={styles.crmTag}>CRM</span>
        <span className={styles.store}>Tienda Miraflores</span>
        <span className={styles.searchPill}>
          <Search size={15} aria-hidden="true" /> Buscar producto o pedido
        </span>
        <Ticker data={data} />
        <span className={styles.avatar} aria-hidden="true">
          TM
        </span>
      </Module>

      <Module id="sidebar" className={styles.sidebar}>
        {[LayoutGrid, Boxes, Bell, LineChart, Truck].map((Icon, i) => (
          <span key={i} className={styles.sideIcon} data-on={i === 0}>
            <Icon size={20} aria-hidden="true" />
            {i === 2 && kpis.alerts > 0 && <b>{kpis.alerts}</b>}
          </span>
        ))}
        <span className={styles.sideIcon} style={{ marginTop: "auto" }}>
          <Settings size={20} aria-hidden="true" />
        </span>
      </Module>

      <Module id="kpi0" className={styles.kpi}>
        <span>Ventas de hoy</span>
        <strong>{fmtMoney(kpis.today)}</strong>
        <small>{fmtInt(kpis.todayUnits)} unidades</small>
      </Module>
      <Module id="kpi1" className={styles.kpi}>
        <span>Ventas de 7 días</span>
        <strong>{fmtMoney(kpis.revenue7)}</strong>
        <small data-dir={kpis.revenueDelta >= 0 ? "up" : "down"}>{fmtPct(kpis.revenueDelta, true)} frente a la semana anterior</small>
      </Module>
      <Module id="kpi2" className={styles.kpi}>
        <span>Unidades en stock</span>
        <strong>{fmtInt(kpis.units)}</strong>
        <small>{kpis.products} productos</small>
      </Module>
      <Module id="kpi3" className={styles.kpi} tone="warn" spot={spot("kpi3")}>
        <span>Alertas activas</span>
        <strong>{kpis.alerts}</strong>
        <small>{kpis.runningOut} por agotarse</small>
      </Module>

      {/* Stock del producto: la cifra y las piezas se mueven con el scroll. */}
      <Module id="stock" className={styles.stock} spot={spot("stock")} tone={promo ? "violet" : undefined}>
        {promo ? (
          <PromoView idle={promo} />
        ) : (
          <>
            <div className={styles.cardHead}>
              <ProductArt art={hero.product.art} label="" className={styles.thumb} />
              <div>
                <p className={styles.cardTitle}>{hero.product.name}</p>
                <p className={styles.cardSub}>
                  {CATEGORIES[hero.product.category].name}, {hero.sku}
                </p>
              </div>
            </div>
            <div className={styles.countRow}>
              <strong data-scrub="count" className={styles.count}>
                {hero.available}
              </strong>
              <span>
                pares disponibles
                <em data-scrub="when">Hoy, 10:20</em>
              </span>
            </div>
            <div className={styles.units} data-scrub="units" data-low={hero.available <= Math.round(hero.a.reorderPoint)} aria-hidden="true">
              {Array.from({ length: cells }, (_, i) => (
                <i key={i} data-on={i < hero.available} />
              ))}
            </div>
            <p className={styles.lastSale} data-scrub="lastSale">
              Última venta: online, 2 pares
            </p>
          </>
        )}
      </Module>

      <Module id="forecast" className={styles.forecast} spot={spot("forecast")}>
        <div className={styles.cardHeadRow}>
          <div>
            <p className={styles.cardTitle}>Pronóstico de stock</p>
            <p className={styles.cardSub}>
              {hero.product.name}. Demanda estimada en 14 días: <b>{fmtInt(data.demand14)} pares</b>
            </p>
          </div>
          <div className={styles.legend}>
            <span>
              <i data-k="real" /> Stock real
            </span>
            {!ordered && (
              <span>
                <i data-k="proj" /> Sin reponer
              </span>
            )}
            <span>
              <i data-k="order" /> Con el pedido
            </span>
          </div>
        </div>
        <ForecastChart data={data} />
      </Module>

      <Module id="alert" className={styles.alert} tone={ordered ? "mint" : "warn"} spot={spot("alert")}>
        <div className={styles.alertHead}>
          <span className={styles.alertIcon} aria-hidden="true">
            {ordered ? <PackageCheck size={18} /> : <TriangleAlert size={18} />}
          </span>
          <p className={styles.cardTitle}>{ordered ? "Reposición en camino" : "Riesgo de quiebre"}</p>
          <span className={styles.pulse} aria-hidden="true" />
        </div>
        <p className={styles.alertBig}>
          {ordered ? `Llega ${fmtDate(hero.incoming?.eta ?? data.recEta)}` : hero.runOutAt ? `Se agota ${whenText(hero.runOutAt, NOW)}` : "Stock bajo"}
        </p>
        <p className={styles.alertSub}>
          {hero.product.name}: {hero.available} pares, {hero.daysLeft !== null ? fmtDays(hero.daysLeft, 0) : "sin ventas"} de stock.
        </p>
        <div className={styles.weekBars}>
          <span>
            Ventas esta semana <b>{hero.soldWeek}</b>
          </span>
          <i style={{ "--w": 1 } as CSSProperties} />
          <span>
            Semana normal <b>{Math.round(hero.soldWeek / (1 + hero.weekChange))}</b>
          </span>
          <i data-k="normal" style={{ "--w": 1 / (1 + hero.weekChange) } as CSSProperties} />
        </div>
        <ul className={styles.otherAlerts}>
          {data.otherAlerts.map((a) => (
            <li key={a.sku}>
              <b>{a.name}</b> {a.detail.toLowerCase()}
            </li>
          ))}
        </ul>
      </Module>

      <Module id="order" className={styles.order} spot={spot("order")}>
        <div className={styles.alertHead}>
          <span className={styles.orderIcon} aria-hidden="true">
            <Truck size={18} />
          </span>
          <p className={styles.cardTitle}>{ordered ? "Pedido creado" : "Pedido sugerido"}</p>
        </div>
        <p className={styles.cardSub}>
          {data.supplier}
          {ordered && hero.incoming ? `, ${hero.incoming.id}` : ""}
        </p>
        <p className={styles.orderQty}>
          <strong data-scrub="orderQty">{data.recQty}</strong> pares
        </p>
        <div className={styles.packs} data-scrub="packs" aria-hidden="true">
          {Array.from({ length: data.recPacks }, (_, i) => (
            <i key={i} data-on="true" />
          ))}
          <span>
            {data.recPacks} cajas de {data.packSize}
          </span>
        </div>
        <dl className={styles.orderFacts}>
          <div>
            <dt>Llega</dt>
            <dd>{fmtDateShort(data.recEta)}</dd>
          </div>
          <div>
            <dt>Inversión</dt>
            <dd>{fmtMoney(data.recCost)}</dd>
          </div>
          <div>
            <dt>Cubre</dt>
            <dd>{Number.isFinite(data.coverAfter) ? fmtDays(data.coverAfter, 0) : "—"}</dd>
          </div>
        </dl>
        <button type="button" className={styles.orderButton} data-done={ordered} disabled={!interactive || ordered} tabIndex={interactive ? 0 : -1} onClick={onOrder}>
          {ordered ? "Pedido en camino" : `Crear pedido de ${data.recQty}`}
        </button>
      </Module>

      <Module id="growth" className={styles.growth} spot={spot("growth")}>
        <div className={styles.cardHeadRow}>
          <div>
            <p className={styles.cardTitle}>{byCategory ? "Crecimiento por categoría" : "Ventas mensuales"}</p>
            <p className={styles.cardSub}>{byCategory ? "30 días frente a los 30 anteriores" : "Últimos 6 meses"}</p>
          </div>
          {!byCategory && <span className={styles.growthChip}>{fmtPct(data.growth6, true)}</span>}
        </div>
        {byCategory ? <CategoryBars rows={data.categories} /> : <GrowthBars months={data.months} />}
      </Module>
    </div>
  );
}

function Ticker({ data }: { data: CinemaData }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (data.ticker.length < 2) return;
    const id = window.setInterval(() => setI((x) => (x + 1) % data.ticker.length), 3200);
    return () => window.clearInterval(id);
  }, [data.ticker.length]);
  const m = data.ticker[i];
  if (!m) return null;
  return (
    <span className={styles.ticker} key={m.id}>
      <i aria-hidden="true" />
      {movementTitle(m)}: {productOf(m.sku).name}, {fmtRelative(m.t, NOW)}
    </span>
  );
}

function PromoView({ idle }: { idle: NonNullable<CinemaData["idle"]> }) {
  const promoPrice = Math.round(idle.price * 0.8);
  return (
    <div className={styles.promo}>
      <div className={styles.cardHead}>
        <ProductArt art={idle.art} label="" className={styles.thumb} />
        <div>
          <p className={styles.cardTitle}>{idle.name}</p>
          <p className={styles.cardSub}>{idle.why.charAt(0).toUpperCase() + idle.why.slice(1)}</p>
        </div>
      </div>
      <span className={styles.promoBadge}>
        <Sparkles size={14} aria-hidden="true" /> Promoción −20 % activa
      </span>
      <p className={styles.promoPrice}>
        <s>{fmtMoney(idle.price)}</s> <strong>{fmtMoney(promoPrice)}</strong>
      </p>
      <dl className={styles.orderFacts}>
        <div>
          <dt>En stock</dt>
          <dd>{fmtInt(idle.available)}</dd>
        </div>
        <div>
          <dt>Inmovilizado</dt>
          <dd>{fmtMoney(idle.value)}</dd>
        </div>
        <div>
          <dt>Vigencia</dt>
          <dd>14 días</dd>
        </div>
      </dl>
    </div>
  );
}

function CategoryBars({ rows }: { rows: CinemaData["categories"] }) {
  const max = Math.max(...rows.map((r) => r.revenue30), 1);
  return (
    <ul className={styles.catBars}>
      {rows.map((r, i) => (
        <li key={r.name} style={{ "--i": i } as CSSProperties}>
          <span className={styles.catName}>{r.name}</span>
          <span className={styles.catTrack}>
            <i style={{ width: `${(r.revenue30 / max) * 100}%` }} />
          </span>
          <span className={styles.catGrowth} data-dir={r.growth >= 0 ? "up" : "down"}>
            {fmtPct(r.growth, true)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function GrowthBars({ months }: { months: CinemaData["months"] }) {
  const max = Math.max(...months.map((m) => m.revenue), 1);
  return (
    <div className={styles.bars}>
      {months.map((m, i) => (
        <div key={i} className={styles.barCol} style={{ "--i": i } as CSSProperties}>
          {(i === 0 || i === months.length - 1) && <span className={styles.barValue}>{fmtMoneyShort(m.revenue)}</span>}
          <i style={{ height: `${(m.revenue / max) * 100}%` }} data-last={i === months.length - 1} />
          <span className={styles.barLabel}>{m.label}</span>
        </div>
      ))}
    </div>
  );
}

const CW = 728;
const CH = 200;
const PAD = { l: 34, r: 16, t: 14, b: 26 };

function ForecastChart({ data }: { data: CinemaData }) {
  const { past, future, withOrder, stockout } = data.forecast;
  const t0 = STORY_START;
  const t1 = NOW + 14 * DAY;
  const x = scaleLinear()
    .domain([t0, t1])
    .range([PAD.l, CW - PAD.r]);
  const maxV = Math.max(data.heroStart, ...withOrder.map((p) => p.v), 10);
  const y = scaleLinear()
    .domain([0, maxV * 1.08])
    .nice(4)
    .range([CH - PAD.b, PAD.t]);
  const path = (pts: Point[]) =>
    line<Point>()
      .x((p) => x(p.t))
      .y((p) => y(p.v))
      .curve(curveMonotoneX)(pts) ?? "";
  const today = x(NOW);
  const eta = x(data.recEta);
  const etaPoint = withOrder.find((p) => p.t >= data.recEta) ?? withOrder[withOrder.length - 1]!;
  const at = (px: number, py: number) => ({ left: `${(px / CW) * 100}%`, top: `${(py / CH) * 100}%` });
  return (
    <div className={styles.chartWrap}>
      <svg className={styles.chart} viewBox={`0 0 ${CW} ${CH}`} aria-hidden="true">
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={CW - PAD.r} y1={y(t)} y2={y(t)} className={t === 0 ? styles.axis0 : styles.gridLine} />
            <text x={PAD.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className={styles.axisText}>
              {t}
            </text>
          </g>
        ))}
        <text x={x(t0)} y={CH - 6} className={styles.axisText}>
          {fmtDateShort(t0)}
        </text>
        <text x={CW - PAD.r} y={CH - 6} textAnchor="end" className={styles.axisText}>
          {fmtDateShort(t1)}
        </text>
        <path d={path(past)} className={styles.lineReal} />
        <line x1={today} x2={today} y1={PAD.t - 4} y2={CH - PAD.b} className={styles.todayLine} />
        <text x={today} y={PAD.t - 4} dy="-0.2em" textAnchor="middle" className={styles.todayText}>
          Hoy
        </text>
        <path d={path(withOrder)} className={styles.lineOrder} />
        {!data.ordered && <path d={path(future)} className={styles.lineProj} />}
        {!data.ordered && stockout && <circle cx={x(stockout)} cy={y(0)} r={5} className={styles.dotWarn} />}
        <circle cx={eta} cy={y(etaPoint.v)} r={5} className={styles.dotMint} />
      </svg>
      {/* Etiquetas y velo en HTML: se rasterizan nítidos dentro de la transformación 3D. */}
      {!data.ordered && stockout && (
        <span className={styles.mark} data-tone="warn" style={at(x(stockout), y(0) - 10)}>
          Quiebre {fmtDateShort(stockout)}
        </span>
      )}
      <span className={styles.mark} data-tone="mint" style={at(eta, y(etaPoint.v) - 10)}>
        Llega el pedido
      </span>
      <span className={styles.veil} style={{ left: `${((today + 12) / CW) * 100}%` }} aria-hidden="true" />
    </div>
  );
}
