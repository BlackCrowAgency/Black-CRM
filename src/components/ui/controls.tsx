"use client";

import { CircleCheck, CircleAlert, CirclePause, Info, Layers, PackageCheck, TrendingDown, TrendingUp, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import type { SimpleState } from "@/domain/simple";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { useInView } from "@/hooks/useInView";
import { useReducedMotion } from "@/hooks/useMediaQuery";
import { useBlackCrm, type Toast } from "@/store/blackCrm";
import styles from "./ui.module.css";

/* ---------- Botones ---------- */

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "dark";
  size?: "sm" | "md";
}

export function Button({ variant = "secondary", size = "md", className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={`${styles.button} ${className ?? ""}`} data-variant={variant} data-size={size} {...rest} />;
}

export function IconButton({ label, className, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type={type} className={`${styles.iconButton} ${className ?? ""}`} aria-label={label} title={label} {...rest} />;
}

/* ---------- Segmentado (radiogroup) ---------- */

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(v: T): void;
  className?: string;
}

export function Segmented<T extends string>({ label, value, options, onChange, className }: SegmentedProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={`${styles.segmented} ${className ?? ""}`}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={i === index ? 0 : -1}
          className={styles.segment}
          onClick={() => onChange(o.value)}
          onKeyDown={onKey}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Chip de filtro ---------- */

export function FilterChip({ pressed, onClick, children, count }: { pressed: boolean; onClick(): void; children: ReactNode; count?: number }) {
  return (
    <button type="button" className={styles.chip} aria-pressed={pressed} onClick={onClick}>
      {children}
      {count !== undefined && <span className={styles.chipCount}>{count}</span>}
    </button>
  );
}

/* ---------- Estado simple ---------- */

export const STATE_META: Record<SimpleState, { label: string; tone: "mint" | "primary" | "tangerine" | "red" | "slate"; icon: LucideIcon }> = {
  agotado: { label: "Agotado", tone: "red", icon: CircleAlert },
  reponer: { label: "Requiere reposición", tone: "tangerine", icon: TriangleAlert },
  pocas: { label: "Stock bajo", tone: "tangerine", icon: TrendingDown },
  en_camino: { label: "Reposición en camino", tone: "mint", icon: PackageCheck },
  rapido: { label: "Alta demanda", tone: "primary", icon: TrendingUp },
  demasiado: { label: "Sobrestock", tone: "slate", icon: Layers },
  sin_ventas: { label: "Sin ventas en 30 días", tone: "slate", icon: CirclePause },
  bien: { label: "Stock saludable", tone: "mint", icon: CircleCheck },
};

export function StateBadge({ state }: { state: SimpleState }) {
  const meta = STATE_META[state];
  const Icon = meta.icon;
  return (
    <span className={styles.badge} data-tone={meta.tone}>
      <Icon size={14} strokeWidth={2.4} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/* ---------- Número animado ---------- */

export function AnimatedNumber({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) {
  const [initial] = useState(() => format(value));
  const ref = useAnimatedNumber<HTMLSpanElement>(value, format);
  return (
    <span ref={ref} className={className}>
      {initial}
    </span>
  );
}

/**
 * Cifra que cuenta desde cero la primera vez que aparece en pantalla y
 * después sigue los cambios en vivo. El HTML del servidor ya trae el valor.
 */
export function CountUp({ value, format, className, duration = 1100 }: { value: number; format: (v: number) => string; className?: string; duration?: number }) {
  const [initial] = useState(() => format(value));
  const [ref, inView] = useInView<HTMLSpanElement>(0.3);
  const shown = useRef<number | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || !inView) return;
    const from = shown.current ?? 0;
    if (reduce || from === value || !Number.isFinite(value)) {
      shown.current = value;
      el.textContent = format(value);
      return;
    }
    const first = shown.current === null;
    const length = first ? duration : 520;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / length);
      const eased = 1 - Math.pow(1 - t, first ? 4 : 3);
      const v = from + (value - from) * eased;
      shown.current = v;
      el.textContent = format(v);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value, format, duration, reduce, ref]);

  return (
    <span ref={ref} className={className}>
      {initial}
    </span>
  );
}

/* ---------- Unidades como piezas ---------- */

/** Color de pieza legible sobre blanco a partir de la ilustración del producto. */
export function swatchOf(art: { main: string; accent: string }) {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  return lum(art.main) > 0.82 ? art.accent : art.main;
}

interface UnitsProps {
  available: number;
  /** Piezas visibles (cada pieza puede representar varias unidades). */
  slots: number;
  perUnit?: number;
  cols: number;
  size?: number;
  gap?: number;
  swatch: string;
  ghost?: number;
  tone?: "low" | "out";
  label: string;
}

/**
 * El stock como piezas en una estantería: una venta apaga una pieza, una
 * reposición la vuelve a encender. Cada pieza puede valer varias unidades.
 */
export function UnitGrid({ available, slots, perUnit = 1, cols, size = 10, gap = 4, swatch, ghost = 0, tone, label }: UnitsProps) {
  const filled = Math.min(slots, Math.ceil(Math.max(0, available) / perUnit));
  const ghosts = Math.min(slots - filled, Math.ceil(ghost / perUnit));
  return (
    <div
      className={styles.units}
      style={{ "--cols": cols, "--size": `${size}px`, "--gap": `${gap}px`, "--swatch": swatch } as React.CSSProperties}
      role="img"
      aria-label={label}
    >
      {Array.from({ length: slots }, (_, i) => (
        <span
          key={i}
          className={styles.unit}
          data-on={i < filled || (i >= filled && i < filled + ghosts)}
          data-ghost={i >= filled && i < filled + ghosts}
          data-tone={i < filled ? tone : undefined}
          style={{ "--i": i - filled } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/* ---------- Hoja (dialog nativo) ---------- */

export function Sheet({ open, onClose, label, children }: { open: boolean; onClose(): void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const onClosed = () => {
      const el = opener.current as HTMLElement | null;
      if (el && document.contains(el)) el.focus();
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClosed);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onClosed);
    };
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      aria-label={label}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <>
          <div className={styles.sheetHead}>
            <IconButton label="Cerrar" onClick={onClose}>
              <X size={20} />
            </IconButton>
          </div>
          <div className={styles.sheetBody}>{children}</div>
        </>
      )}
    </dialog>
  );
}

/* ---------- Avisos ---------- */

const TOAST_ICON = { info: Info, ok: CircleCheck, warn: TriangleAlert } as const;

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useBlackCrm((s) => s.dismiss);
  const openProduct = useBlackCrm((s) => s.openProduct);
  useEffect(() => {
    const id = window.setTimeout(() => dismiss(toast.id), 5200);
    return () => window.clearTimeout(id);
  }, [toast.id, dismiss]);
  const Icon = TOAST_ICON[toast.tone];
  return (
    <div className={styles.toast} data-tone={toast.tone}>
      <Icon size={17} aria-hidden="true" />
      <div>
        <p className={styles.toastTitle}>{toast.title}</p>
        {toast.body &&
          (toast.sku ? (
            <button type="button" className={styles.toastBody} onClick={() => openProduct(toast.sku!)}>
              {toast.body}
            </button>
          ) : (
            <p className={styles.toastBody}>{toast.body}</p>
          ))}
      </div>
      <button type="button" aria-label="Cerrar aviso" onClick={() => dismiss(toast.id)} style={{ color: "var(--ink-3)" }}>
        <X size={15} />
      </button>
    </div>
  );
}

export function Toasts() {
  const toasts = useBlackCrm((s) => s.toasts);
  return (
    <div className={styles.toasts} role="status" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
