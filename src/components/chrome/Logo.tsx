/**
 * Marca de Black CRM: una estantería de 3 × 3 con una unidad por reponer.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => {
        const x = (i % 3) * 7.5 + 0.5;
        const y = Math.floor(i / 3) * 7.5 + 0.5;
        if (i === 2) return <rect key={i} x={x + 0.75} y={y + 0.75} width={4.5} height={4.5} rx={1.4} fill="none" stroke="#f76b15" strokeWidth={1.5} />;
        return <rect key={i} x={x} y={y} width={6} height={6} rx={1.8} fill={i === 4 ? "#12a594" : "currentColor"} />;
      })}
    </svg>
  );
}

export function Wordmark() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <Logo />
      <span style={{ fontFamily: "var(--font-display)", fontVariationSettings: "'wdth' 88", fontWeight: 650, fontSize: 20, letterSpacing: "-0.03em", lineHeight: 1 }}>Black CRM</span>
    </span>
  );
}
