"use client";

import { Check, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fmtMoney, fmtPct } from "@/domain/format";
import { productGrowth, protectedSales } from "@/domain/growth";
import { needsRestock, whenText } from "@/domain/simple";
import { NOW } from "@/domain/time";
import { useReducedMotion } from "@/hooks/useMediaQuery";
import { useEngine } from "@/components/inventory/EngineProvider";
import { unitsWord } from "@/components/inventory/words";
import type { CinemaData } from "./data";
import styles from "./cinema.module.css";

export type QuestionId = "reponer" | "crece" | "quieto";

const QUESTIONS: { id: QuestionId; label: string }[] = [
  { id: "reponer", label: "¿Qué repongo esta semana?" },
  { id: "crece", label: "¿Qué está creciendo?" },
  { id: "quieto", label: "¿Qué no se vende?" },
];

interface Reply {
  q: QuestionId;
  text: string;
  /** Acción que el asistente ejecuta sobre el panel, con los pasos que va mostrando. */
  action?: { label: string; steps: string[] };
}

type Phase = "idle" | "thinking" | "answer" | "acting" | "done" | "undoing" | "undone";

const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}` : (names[0] ?? ""));

/**
 * Crow CRM IA: responde con los datos del panel y, al pedirle la acción, la
 * ejecuta sobre el panel de la derecha contando cada paso.
 */
export function Assistant({
  active,
  data,
  act,
  undo,
  dirty,
}: {
  active: boolean;
  data: CinemaData;
  act(q: QuestionId): string;
  /** Deshace una acción (o todas con "all") y devuelve el mensaje. */
  undo(q: QuestionId | "all"): string;
  /** El panel tiene cambios hechos en la sesión. */
  dirty: boolean;
}) {
  const { views } = useEngine();
  const reduce = useReducedMotion();
  const [reply, setReply] = useState<Reply | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [typed, setTyped] = useState(0);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState("");
  const [undoTarget, setUndoTarget] = useState<QuestionId | "all" | null>(null);
  const [undoResult, setUndoResult] = useState("");

  const replies = useMemo((): Record<QuestionId, Reply> => {
    const restock = views.filter(needsRestock).sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99));
    const reponer: Reply = restock.length
      ? {
          q: "reponer",
          text: `${list(
            restock
              .slice(0, 3)
              .map((v, i) => `${v.product.name} (${v.rec!.qty} ${unitsWord(v.rec!.qty, v.sku)}${i === 0 && v.runOutAt ? `, se agota ${whenText(v.runOutAt, NOW)}` : ""})`),
          )}. Reponerlos protege ${fmtMoney(protectedSales(views))} en ventas de las próximas dos semanas.`,
          action: {
            label: restock.length === 1 ? "Crear el pedido" : `Crear los ${restock.length} pedidos`,
            steps: ["Calculando cantidades por caja", `Enviando ${restock.length === 1 ? "el pedido" : `${restock.length} pedidos`} a proveedores`],
          },
        }
      : { q: "reponer", text: "Nada urgente: el stock cubre la demanda estimada de las próximas dos semanas." };

    const top = data.categories[0];
    const fastest = views
      .filter((v) => v.soldMonth >= 15)
      .map((v) => ({ v, g: productGrowth(v.sku) }))
      .sort((a, b) => b.g - a.g)[0];
    const crece: Reply = {
      q: "crece",
      text: `${top ? `${top.name} lidera con ${fmtPct(top.growth, true)} frente al mes anterior.` : ""}${fastest ? ` El producto que más acelera es ${fastest.v.product.name} (${fmtPct(fastest.g, true)}).` : ""}`.trim(),
      action: { label: "Ver por categoría en el panel", steps: [`Comparando ${data.categories.length} categorías`] },
    };

    const idle = data.idle;
    const quieto: Reply = idle
      ? {
          q: "quieto",
          text: `${idle.name} tiene ${idle.why} y ${fmtMoney(idle.value)} inmovilizados. Una promoción del 20 % liberaría caja sin romper margen.`,
          action: { label: "Activar promoción del 20 %", steps: ["Buscando stock sin rotación", `Aplicando 20 % de descuento a ${idle.name}`] },
        }
      : { q: "quieto", text: "Todo el catálogo se está moviendo: no hay stock inmovilizado." };

    return { reponer, crece, quieto };
  }, [views, data.categories, data.idle]);

  const ask = (q: QuestionId) => {
    setReply(replies[q]);
    setPhase("thinking");
    setTyped(0);
    setStep(0);
    setResult("");
    setUndoTarget(null);
    setUndoResult("");
  };

  const startUndo = (target: QuestionId | "all") => {
    setUndoTarget(target);
    setUndoResult("");
    setPhase("undoing");
  };

  // Al llegar a las estadísticas el asistente responde solo la primera pregunta.
  const autoStart = active && !reply;
  useEffect(() => {
    if (!autoStart) return;
    const first = replies.reponer;
    const id = window.setTimeout(() => {
      setReply(first);
      setPhase("thinking");
    }, 450);
    return () => window.clearTimeout(id);
  }, [autoStart, replies]);

  // Pensando → respuesta
  useEffect(() => {
    if (phase !== "thinking") return;
    const id = window.setTimeout(() => setPhase("answer"), reduce ? 0 : 750);
    return () => window.clearTimeout(id);
  }, [phase, reduce]);

  // Escritura progresiva
  const text = reply?.text ?? "";
  useEffect(() => {
    if (phase !== "answer" || reduce) return;
    let i = 0;
    const id = window.setInterval(() => {
      i = Math.min(text.length, i + 2);
      setTyped(i);
      if (i >= text.length) window.clearInterval(id);
    }, 16);
    return () => window.clearInterval(id);
  }, [phase, text, reduce]);

  // Acción: muestra cada paso y al final la ejecuta sobre el panel.
  useEffect(() => {
    if (phase !== "acting" || !reply?.action) return;
    const total = reply.action.steps.length;
    const id = window.setTimeout(
      () => {
        if (step < total) setStep(step + 1);
        else {
          setResult(act(reply.q));
          setPhase("done");
        }
      },
      reduce ? 0 : 800,
    );
    return () => window.clearTimeout(id);
  }, [phase, step, reply, act, reduce]);

  // Deshacer: muestra el paso y devuelve el panel a su estado anterior.
  useEffect(() => {
    if (phase !== "undoing" || !undoTarget) return;
    const id = window.setTimeout(
      () => {
        setUndoResult(undo(undoTarget));
        setPhase("undone");
      },
      reduce ? 0 : 800,
    );
    return () => window.clearTimeout(id);
  }, [phase, undoTarget, undo, reduce]);

  const busy = phase === "acting" || phase === "undoing";
  const shown = phase === "answer" ? (reduce ? text.length : Math.min(typed, text.length)) : text.length;
  const answered = phase !== "idle" && phase !== "thinking";
  const typedAll = answered && shown >= text.length;
  const steps = reply?.action?.steps ?? [];

  return (
    <div className={styles.assistant}>
      <p className={styles.assistantHead}>
        <Sparkles size={16} aria-hidden="true" />
        Crow CRM IA
        {dirty && !busy ? (
          <button type="button" className={styles.resetPanel} onClick={() => startUndo("all")}>
            <RotateCcw size={13} aria-hidden="true" /> Restablecer panel
          </button>
        ) : (
          <span>Pregúntale a tu CRM</span>
        )}
      </p>
      <div className={styles.questions} role="group" aria-label="Preguntas sugeridas">
        {QUESTIONS.map((x) => (
          <button key={x.id} type="button" aria-pressed={reply?.q === x.id} disabled={busy} onClick={() => ask(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className={styles.answer}>
        {phase === "idle" && <p className={styles.answerIdle}>Pregunta lo que necesites saber de tu inventario.</p>}
        {reply && (
          <p className={styles.logLine} data-state={phase === "thinking" ? "run" : "done"}>
            {phase === "thinking" ? <LoaderCircle size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
            {phase === "thinking" ? "Analizando ventas, stock y pronósticos" : `Analicé ${views.length} productos y 6 meses de ventas`}
          </p>
        )}
        {answered && (
          <p className={styles.answerText} aria-hidden="true">
            {text.slice(0, shown)}
            {!typedAll && <i className={styles.caret} />}
          </p>
        )}
        <p className="sr-only" aria-live="polite">
          {answered ? text : ""} {result} {undoResult}
        </p>

        {(phase === "acting" || result) &&
          steps.slice(0, phase === "done" ? steps.length : step + 1).map((label, i) => {
            const running = phase === "acting" && i === step;
            return (
              <p key={label} className={styles.logLine} data-state={running ? "run" : "done"}>
                {running ? <LoaderCircle size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                {label}
              </p>
            );
          })}
        {result && phase !== "acting" && (
          <div className={styles.resultRow}>
            <p className={styles.result}>{result}</p>
            {phase === "done" && (
              <button type="button" className={styles.undoButton} onClick={() => startUndo(reply!.q)}>
                <RotateCcw size={13} aria-hidden="true" /> Deshacer
              </button>
            )}
          </div>
        )}
        {(phase === "undoing" || phase === "undone") && (
          <p className={styles.logLine} data-state={phase === "undoing" ? "run" : "done"}>
            {phase === "undoing" ? <LoaderCircle size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
            {undoTarget === "all" ? "Restableciendo el panel" : "Deshaciendo los cambios en el panel"}
          </p>
        )}
        {phase === "undone" && undoResult && <p className={styles.resultUndo}>{undoResult}</p>}

        {phase === "answer" && typedAll && reply?.action && (
          <button type="button" className={styles.answerAction} onClick={() => setPhase("acting")}>
            {reply.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
