"use client";

import { ArrowDown, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { HERO_SKU } from "@/domain/catalog";
import { fmtDate, fmtTime } from "@/domain/format";
import { needsRestock } from "@/domain/simple";
import { heroAvailableAt, heroRecentSales } from "@/domain/story";
import { NOW, STORY_START } from "@/domain/time";
import { useReducedMotion } from "@/hooks/useMediaQuery";
import { useEngine } from "@/components/inventory/EngineProvider";
import { movementTitle, unitsWord } from "@/components/inventory/words";
import { useBlackCrm } from "@/store/blackCrm";
import { Assistant, type QuestionId } from "./Assistant";
import { useCinemaData } from "./data";
import { Device, PANEL_INITIAL, type PanelState, type ScrubKey } from "./Device";
import { FOCUS, STACKED_QUERY, cameraAt, camerasFor, regionOf, stageLayout, transformOf, type Camera, type ModuleId } from "./layout";
import styles from "./cinema.module.css";

const CHAPTERS = ["Inventario", "Ventas", "Alertas", "Pronóstico", "Reposición", "Estadísticas"] as const;
const LAST = CHAPTERS.length - 1;
/** Tono del ambiente por capítulo (r g b). */
const TINTS: [number, number, number][] = [
  [91, 91, 214],
  [91, 91, 214],
  [247, 107, 21],
  [18, 165, 148],
  [91, 91, 214],
  [110, 86, 207],
];
/** Rigidez del seguimiento del scroll: más baja = movimiento más pausado. */
const FOLLOW = 3.6;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** Arranque y frenado suaves (smootherstep). */
const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
/** Meseta: la cámara se queda quieta en el centro de cada capítulo y se mueve entre ellos. */
const plateau = (raw: number) => {
  const base = Math.floor(raw);
  return Math.min(LAST, base + smooth(clamp01((raw - base - 0.25) / 0.5)));
};
/** Tramo de scroll [a, b] → 0..1. */
const span = (raw: number, a: number, b: number) => clamp01((raw - a) / (b - a));

/**
 * Una sola escena fija: el panel de Black CRM en el centro se transforma
 * capítulo a capítulo (despiece, acercamientos, giros) mientras el texto
 * cuenta qué hace cada parte.
 */
export function Cinema() {
  const data = useCinemaData();
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const deviceRef = useRef<HTMLDivElement>(null);
  const capRefs = useRef<(HTMLDivElement | null)[]>([]);
  const railRef = useRef<HTMLDivElement>(null);
  const safeRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef(data);
  const [chapter, setChapter] = useState(0);
  const [panel, setPanel] = useState<PanelState>(PANEL_INITIAL);
  const reduce = useReducedMotion();
  const { views } = useEngine();
  const prepareReplenishment = useBlackCrm((s) => s.prepareReplenishment);
  const cancelOrders = useBlackCrm((s) => s.cancelOrders);
  const spotTimer = useRef(0);
  /** Pedidos creados en la sesión: los de la IA y el del botón del panel (para poder deshacerlos). */
  const [aiOrders, setAiOrders] = useState<string[]>([]);
  const [manualOrders, setManualOrders] = useState<string[]>([]);
  const dirty = aiOrders.length + manualOrders.length > 0 || panel.growthView !== "meses" || panel.promo !== null;

  useEffect(() => () => window.clearTimeout(spotTimer.current), []);

  /** Resalta unos segundos las piezas del panel que acaban de cambiar. */
  const spotlight = useCallback((ids: ModuleId[]) => {
    setPanel((p) => ({ ...p, spotlight: ids }));
    window.clearTimeout(spotTimer.current);
    spotTimer.current = window.setTimeout(() => setPanel((p) => ({ ...p, spotlight: [] })), 2800);
  }, []);

  /** Acciones de la IA: cambian el panel de la derecha y devuelven el mensaje final. */
  const act = useCallback(
    (q: QuestionId): string => {
      if (q === "reponer") {
        const restock = views.filter(needsRestock);
        const ids = restock.map((v) => prepareReplenishment(v.sku, v.rec!.qty).id);
        setAiOrders((list) => [...list, ...ids]);
        spotlight(["order", "alert", "forecast", "kpi3"]);
        return ids.length === 1 ? "Pedido creado. El panel ya muestra la reposición en camino." : `${ids.length} pedidos creados. El panel ya muestra la reposición en camino.`;
      }
      if (q === "crece") {
        setPanel((p) => ({ ...p, growthView: "categorias" }));
        spotlight(["growth"]);
        return "Listo: el panel muestra el crecimiento por categoría.";
      }
      const idle = dataRef.current.idle;
      setPanel((p) => ({ ...p, promo: idle?.sku ?? null }));
      spotlight(["stock"]);
      return idle ? `Promoción activa en ${idle.name} durante 14 días.` : "No hay productos para promocionar.";
    },
    [views, prepareReplenishment, spotlight],
  );

  /** Deshace una acción de la IA (o todas con "all") y devuelve el mensaje para el asistente. */
  const undo = useCallback(
    (q: QuestionId | "all"): string => {
      if (q === "reponer") {
        cancelOrders(aiOrders);
        setAiOrders([]);
        spotlight(["order", "alert", "forecast", "kpi3"]);
        return aiOrders.length === 1
          ? "Pedido cancelado. El panel volvió a mostrar la reposición pendiente."
          : `${aiOrders.length} pedidos cancelados. El panel volvió a mostrar la reposición pendiente.`;
      }
      if (q === "crece") {
        setPanel((p) => ({ ...p, growthView: "meses" }));
        spotlight(["growth"]);
        return "El panel volvió a las ventas mensuales.";
      }
      if (q === "quieto") {
        setPanel((p) => ({ ...p, promo: null }));
        spotlight(["stock"]);
        return "Promoción retirada: el precio volvió a la normalidad.";
      }
      cancelOrders([...aiOrders, ...manualOrders]);
      setAiOrders([]);
      setManualOrders([]);
      setPanel((p) => ({ ...p, growthView: "meses", promo: null }));
      spotlight(["order", "alert", "forecast", "kpi3", "growth", "stock"]);
      return "Panel restablecido: está como al principio.";
    },
    [aiOrders, manualOrders, cancelOrders, spotlight],
  );

  const orderHero = useCallback(() => {
    const qty = dataRef.current.recQty;
    const order = prepareReplenishment(HERO_SKU, qty);
    setManualOrders((list) => [...list, order.id]);
    spotlight(["order", "alert", "forecast"]);
  }, [prepareReplenishment, spotlight]);

  /** Pide un fotograma aunque el scroll esté quieto (cambian los datos del panel). */
  const repaint = useRef(true);

  useEffect(() => {
    dataRef.current = data;
    repaint.current = true;
  }, [data]);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    const device = deviceRef.current;
    if (!section || !stage || !device) return;

    let cams: Camera[] = [];
    let target = 0;
    let shown = 0;
    let last = performance.now();
    let frame = 0;
    let running = false;
    let lastChapter = -1;
    let lastKey = "";
    // Paralaje con el puntero (escritorio): el panel sigue levemente al cursor.
    let px = 0;
    let py = 0;
    let tx = 0;
    let ty = 0;
    const nodes = new Map<ScrubKey, HTMLElement>();
    const node = (k: ScrubKey) => {
      let el = nodes.get(k);
      if (!el?.isConnected) {
        el = device.querySelector<HTMLElement>(`[data-scrub="${k}"]`) ?? undefined;
        if (el) nodes.set(k, el);
      }
      return el;
    };
    const modules = new Map<ModuleId, HTMLElement>();
    device.querySelectorAll<HTMLElement>("[data-m]").forEach((el) => modules.set(el.dataset.m as ModuleId, el));

    // Escribe estilos solo cuando cambian: en móvil cada escritura cuesta repintado.
    const written = new WeakMap<HTMLElement, Record<string, string>>();
    const put = (el: HTMLElement, prop: string, value: string) => {
      let rec = written.get(el);
      if (!rec) written.set(el, (rec = {}));
      if (rec[prop] === value) return;
      rec[prop] = value;
      if (prop.startsWith("--")) el.style.setProperty(prop, value);
      else el.style[prop as "opacity"] = value;
    };

    /** Medidas del escenario según el modo (lado a lado o apilado); el CSS las recibe como variables. */
    const measure = () => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const header = document.querySelector("header")?.offsetHeight ?? 64;
      const probe = safeRef.current ? getComputedStyle(safeRef.current) : null;
      const safe = { left: parseFloat(probe?.paddingLeft ?? "0") || 0, right: parseFloat(probe?.paddingRight ?? "0") || 0 };
      const L = stageLayout(w, h, header, window.matchMedia(STACKED_QUERY).matches, safe);
      cams = camerasFor(w, h, L);
      const r = regionOf(w, h, L);
      const vars: Record<string, string> = {
        "--cap-x": `${L.capX}px`,
        "--cap-w": `${L.capW}px`,
        "--cap-h": `${L.capH}px`,
        "--cap-h-final": `${L.capHFinal}px`,
        "--cap-max-h": `${L.capMaxH}px`,
        "--rail-h": `${L.railH}px`,
        "--ax": `${(((r.x0 + r.x1) / 2 / w) * 100).toFixed(1)}%`,
        "--ay": `${(((r.y0 + r.y1) / 2 / h) * 100).toFixed(1)}%`,
      };
      for (const [k, v] of Object.entries(vars)) stage.style.setProperty(k, v);
    };

    const readScroll = () => {
      const rect = section.getBoundingClientRect();
      const total = Math.max(1, rect.height - window.innerHeight);
      target = clamp01(-rect.top / total) * LAST;
    };

    const paint = () => {
      const raw = shown;
      const p = reduce ? Math.round(raw) : plateau(raw);
      const c = CHAPTERS.map((_, i) => clamp01(1 - Math.abs(p - i) / 0.5));

      // Cámara
      const cam = cameraAt(cams, p);
      cam.rx += -py * 3;
      cam.ry += px * 4;
      device.style.transform = transformOf(cam);
      put(stage, "perspectiveOrigin", `${cam.cx.toFixed(0)}px ${cam.cy.toFixed(0)}px`);
      put(device, "--explode", c[0]!.toFixed(3));

      // Piezas: la protagonista se adelanta, el resto se atenúa.
      for (const [id, el] of modules) {
        let f = 0;
        let dim = 0;
        FOCUS.forEach((m, j) => {
          if (!m) return;
          if (m === id) f = Math.max(f, c[j]!);
          else if (j < LAST) dim += c[j]!;
        });
        put(el, "--f", f.toFixed(3));
        put(el, "opacity", (1 - 0.74 * Math.min(1, dim)).toFixed(3));
      }

      // Ambiente
      let w = 0;
      let r = 0;
      let g = 0;
      let bl = 0;
      c.forEach((k, i) => {
        const [tr, tg, tb] = TINTS[i]!;
        w += k;
        r += tr * k;
        g += tg * k;
        bl += tb * k;
      });
      if (w > 0) put(stage, "--tint", `${Math.round(r / w)} ${Math.round(g / w)} ${Math.round(bl / w)}`);
      put(stage, "--glow", (0.35 + 0.65 * Math.max(...c)).toFixed(2));

      // Textos
      capRefs.current.forEach((el, i) => {
        if (!el) return;
        const k = c[i]!;
        put(el, "opacity", k.toFixed(3));
        put(el, "transform", `translate3d(0, ${((i - p) * 36).toFixed(1)}px, 0)`);
        put(el, "visibility", k > 0.01 ? "visible" : "hidden");
        put(el, "pointerEvents", k > 0.6 ? "auto" : "none");
      });
      if (railRef.current) put(railRef.current, "--progress", (raw / LAST).toFixed(3));

      // Datos que corren con el scroll
      const d = dataRef.current;
      // 1 · Ventas: retrocede diez días y vuelve a hoy venta a venta.
      const k = raw < 0.4 ? 1 : raw < 0.7 ? 1 - span(raw, 0.4, 0.7) : span(raw, 0.74, 1.12);
      const t = STORY_START + k * (NOW - STORY_START);
      const key = `${k >= 1 ? "now" : Math.round(t / 600_000)}:${d.hero.available}`;
      if (key !== lastKey) {
        lastKey = key;
        const count = k >= 1 ? d.hero.available : heroAvailableAt(t);
        const countEl = node("count");
        const whenEl = node("when");
        const units = node("units");
        const saleEl = node("lastSale");
        if (countEl) countEl.textContent = String(count);
        if (whenEl) whenEl.textContent = k >= 1 ? `Hoy, ${fmtTime(NOW)}` : `${fmtDate(t)}, ${fmtTime(t)}`;
        if (units) {
          // Bajo el punto de reposición las piezas pasan a naranja.
          units.dataset.low = String(count <= Math.round(d.hero.a.reorderPoint));
          const cells = units.children;
          for (let i = 0; i < cells.length; i++) (cells[i] as HTMLElement).dataset.on = String(i < count);
        }
        const sale = heroRecentSales(t, 1)[0];
        if (saleEl && sale) saleEl.textContent = `Última venta: ${movementTitle(sale).toLowerCase()}, ${sale.qty} ${unitsWord(sale.qty, sale.sku)}`;
      }
      // 3 · Pronóstico: el futuro se descubre.
      put(device, "--draw", (raw < 2.3 || raw > 3.7 ? 1 : span(raw, 2.72, 3.22)).toFixed(3));
      // 4 · Reposición: el pedido se arma caja por caja.
      const fill = raw < 3.3 || raw > 4.7 ? 1 : span(raw, 3.72, 4.18);
      const qtyEl = node("orderQty");
      const packs = node("packs");
      if (qtyEl) qtyEl.textContent = String(Math.round(fill * d.recQty));
      if (packs) {
        const boxes = packs.querySelectorAll("i");
        const on = Math.ceil(fill * boxes.length - 0.001);
        boxes.forEach((b, i) => (b.dataset.on = String(i < on)));
      }
      // 5 · Crecimiento: las barras suben mientras la cámara se aleja.
      put(device, "--grow", (raw < 4.05 ? 1 : span(raw, 4.4, 4.85)).toFixed(3));

      const ch = Math.round(p);
      if (ch !== lastChapter) {
        lastChapter = ch;
        setChapter(ch);
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      const moving = shown !== target || Math.abs(tx - px) > 0.002 || Math.abs(ty - py) > 0.002;
      shown += (target - shown) * (reduce ? 1 : 1 - Math.exp(-dt * FOLLOW));
      if (Math.abs(target - shown) < 0.0004) shown = target;
      px += (tx - px) * (1 - Math.exp(-dt * 4));
      py += (ty - py) * (1 - Math.exp(-dt * 4));
      // Sin scroll, puntero ni datos nuevos no hay nada que repintar.
      if (moving || repaint.current) {
        repaint.current = false;
        paint();
      }
      frame = running ? requestAnimationFrame(loop) : 0;
    };

    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    const onPointer = (e: PointerEvent) => {
      if (reduce || e.pointerType !== "mouse") return;
      tx = (e.clientX / window.innerWidth - 0.5) * 2;
      ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    // Al girar el dispositivo (cambia el ancho) se conserva el capítulo en curso.
    // Los cambios solo de alto (barra de direcciones del móvil) no mueven el scroll.
    let lastWidth = window.innerWidth;
    const onResize = () => {
      const widthChanged = window.innerWidth !== lastWidth;
      lastWidth = window.innerWidth;
      const before = target;
      measure();
      if (widthChanged && before > 0 && before < LAST) {
        const top = section.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: top + ((section.offsetHeight - window.innerHeight) * before) / LAST, behavior: "auto" });
      }
      readScroll();
      paint();
    };

    measure();
    readScroll();
    shown = target;
    paint();
    device.dataset.ready = "true";

    const io = new IntersectionObserver(([e]) => (e?.isIntersecting ? start() : stop()));
    io.observe(section);
    window.addEventListener("scroll", readScroll, { passive: true });
    window.addEventListener("resize", onResize);
    stage.addEventListener("pointermove", onPointer);
    return () => {
      stage.removeEventListener("pointermove", onPointer);
      io.disconnect();
      stop();
      window.removeEventListener("scroll", readScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [reduce]);

  const go = (i: number) => {
    const section = sectionRef.current;
    if (!section) return;
    const top = section.getBoundingClientRect().top + window.scrollY;
    const total = section.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + (total * i) / LAST + 2, behavior: reduce ? "auto" : "smooth" });
  };

  // Una frase por capítulo: el panel cuenta el resto.
  const captions: { title: ReactNode; pill?: ReactNode; extra?: ReactNode }[] = [
    {
      title: "El CRM que controla tu inventario.",
      extra: (
        <p className={styles.cue}>
          <ArrowDown size={15} aria-hidden="true" /> Desliza para ver cómo funciona
        </p>
      ),
    },
    { title: "Cada venta descuenta stock al instante." },
    { title: "Te avisa antes del quiebre." },
    { title: "Pronostica cuánto vas a vender." },
    { title: "Repone con un clic." },
    {
      pill: (
        <span className={styles.aiPill}>
          <Sparkles size={14} aria-hidden="true" /> Impulsado por IA
        </span>
      ),
      title: "Estadísticas que te dicen qué hacer.",
      extra: (
        <>
          <Assistant active={chapter === LAST} data={data} act={act} undo={undo} dirty={dirty} />
          <a className={styles.contactLink} href="#contacto">
            Quiero Black CRM para mi negocio
          </a>
        </>
      ),
    },
  ];

  return (
    <section id="inicio" ref={sectionRef} className={styles.cinema} aria-label="Cómo funciona Black CRM">
      <div ref={stageRef} className={styles.stage} data-chapter={chapter}>
        <div className={styles.atmosphere} aria-hidden="true" />
        <div ref={safeRef} className={styles.safeProbe} aria-hidden="true" />
        <div ref={deviceRef} className={styles.device} data-interactive={chapter === LAST}>
          <Device data={data} interactive={chapter === LAST} panel={panel} onOrder={orderHero} />
        </div>
        <div className={styles.scrim} aria-hidden="true" />

        <div className={styles.captions}>
          {captions.map((cap, i) => (
            <div
              key={i}
              ref={(el) => {
                capRefs.current[i] = el;
              }}
              className={styles.caption}
              data-i={i}
              aria-hidden={chapter !== i}
            >
              {cap.pill}
              {i === 0 ? <h1 className={styles.capTitle}>{cap.title}</h1> : <h2 className={styles.capTitle}>{cap.title}</h2>}
              {cap.extra}
            </div>
          ))}
        </div>

        <nav ref={railRef} className={styles.rail} aria-label="Capítulos">
          {CHAPTERS.map((name, i) => (
            <button key={name} type="button" onClick={() => go(i)} aria-current={chapter === i ? "step" : undefined}>
              <span>{name}</span>
            </button>
          ))}
          <i className={styles.railFill} aria-hidden="true" />
        </nav>
      </div>
    </section>
  );
}
