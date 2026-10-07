import type { ReactNode } from "react";
import type { ProductArt as Art } from "@/domain/types";

/**
 * Ilustraciones de producto dibujadas para la demo (SVG propio, sin fotos
 * de terceros). Estilo «foto de catálogo»: objeto centrado, sombra suave y
 * fondo de estudio teñido. En la versión real se reemplazan por las fotos
 * del catálogo (Shopify, WooCommerce o el ERP) con el mismo componente.
 */

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}

/** Aclara (amount > 0) u oscurece (amount < 0) un color. */
export function shade(hex: string, amount: number) {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `rgb(${f(r)} ${f(g)} ${f(b)})`;
}

type Draw = (a: Art) => ReactNode;

const sneakerBase = (variant: "low" | "runner" | "court" | "trail"): Draw =>
  function drawSneaker(a) {
    const sole = variant === "runner" ? (a.detail ?? "#ff7a45") : variant === "trail" ? shade(a.main, -0.45) : "#fbfaf7";
    const upper = a.main;
    const soleTop = variant === "runner" ? 100 : 106;
    const lace = a.detail ?? shade(upper, -0.55);
    return (
      <g>
        {/* suela */}
        <path d={`M20 ${soleTop} L184 ${soleTop} L184 112 C184 121 177 127 166 127 L36 127 C26 127 20 121 20 112 Z`} fill={sole} stroke={shade(sole, -0.14)} strokeWidth="1.5" />
        {variant === "trail" &&
          [30, 46, 62, 78, 94, 110, 126, 142, 158, 172].map((x) => <rect key={x} x={x} y={124} width={9} height={6} rx={2} fill={shade(sole, -0.3)} />)}
        {variant === "runner" && <path d="M26 112 C66 104 116 118 180 106" fill="none" stroke={shade(sole, 0.35)} strokeWidth="3.5" strokeLinecap="round" />}
        {variant !== "runner" && <path d="M22 114 L182 114" stroke={variant === "low" ? a.accent : shade(sole, -0.18)} strokeWidth="2.5" strokeLinecap="round" />}
        {/* empeine */}
        <path
          d={`M24 ${soleTop} C20 90 22 74 32 64 C38 58 46 56 54 58 L70 62 C74 52 82 44 94 42 C102 41 108 45 112 50 L146 ${variant === "court" ? 78 : 74} C163 81 177 90 182 ${soleTop} Z`}
          fill={upper}
          stroke={shade(upper, -0.1)}
          strokeWidth="1.2"
        />
        {/* puntera */}
        <path d={`M146 ${variant === "court" ? 78 : 74} C163 81 177 90 182 ${soleTop} L150 ${soleTop} C152 94 150 84 146 ${variant === "court" ? 78 : 74} Z`} fill={shade(upper, variant === "court" ? -0.05 : 0.3)} />
        {/* contrafuerte del talón */}
        <path d={`M24 ${soleTop} C20 90 22 76 30 67 L46 72 C42 84 44 96 52 ${soleTop} Z`} fill={a.accent} />
        {/* boca */}
        <path d="M36 64 C46 58 60 60 70 64 C64 70 48 72 36 68 Z" fill={shade(upper, -0.55)} />
        {/* lengüeta */}
        <path d="M72 62 C76 52 84 46 94 44 L100 51 C90 53 82 59 78 66 Z" fill={shade(upper, 0.18)} />
        {/* cordones */}
        {[0, 1, 2, 3].map((i) => (
          <path key={i} d={`M${86 + i * 11} ${62 + i * 6} L${95 + i * 11} ${54 + i * 6}`} stroke={lace} strokeWidth="3.2" strokeLinecap="round" />
        ))}
        {/* sello lateral */}
        <rect x="92" y="84" width="30" height="9" rx="4.5" fill={a.accent} />
        {variant === "court" && [0, 1, 2, 3, 4].map((i) => <circle key={i} cx={154 + i * 5} cy={92 + (i % 2) * 4} r={1.3} fill={shade(upper, -0.28)} />)}
        <path d={`M56 ${soleTop - 6} C90 ${soleTop - 9} 124 ${soleTop - 9} 150 ${soleTop - 6}`} fill="none" stroke={shade(upper, -0.14)} strokeWidth="1.2" />
      </g>
    );
  };

const draws: Record<Art["kind"], Draw> = {
  sneaker: sneakerBase("low"),
  runner: sneakerBase("runner"),
  court: sneakerBase("court"),
  trail: sneakerBase("trail"),
  hightop: (a) => (
    <g>
      <path d="M30 112 Q28 126 44 126 L160 126 Q178 126 178 112 Z" fill="#fbfaf7" stroke="#e2ddd3" strokeWidth="1.5" />
      <path d="M30 116 L178 116" stroke={a.main} strokeWidth="2.5" />
      <path d="M38 112 C36 84 38 52 50 40 L84 40 C88 56 96 66 112 72 L146 86 C162 92 176 100 178 112 Z" fill={a.main} />
      <path d="M146 86 C162 92 176 100 178 112 L144 112 C146 102 146 94 146 86 Z" fill="#fbfaf7" />
      <path d="M50 40 L84 40" stroke={shade(a.main, -0.4)} strokeWidth="5" strokeLinecap="round" />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={82 + i * 9} cy={50 + i * 5.2} r={2.6} fill="#fbfaf7" stroke={shade(a.main, -0.3)} strokeWidth="1" />
      ))}
      <circle cx="56" cy="78" r="9" fill="#fbfaf7" />
      <circle cx="56" cy="78" r="5" fill={a.main} />
      <path d="M40 60 C40 80 42 100 44 112" stroke={shade(a.main, -0.2)} strokeWidth="1.2" fill="none" />
    </g>
  ),
  slide: (a) => (
    <g>
      <path d="M26 112 Q26 124 40 124 L164 124 Q180 124 180 110 Q180 102 168 100 L40 100 Q26 100 26 112 Z" fill={a.main} />
      <path d="M30 104 L176 104" stroke={shade(a.main, 0.25)} strokeWidth="2" />
      <path d="M70 102 C70 72 86 58 112 58 C140 58 152 74 152 102 Z" fill={a.accent} />
      <path d="M78 102 C80 78 92 68 112 68 C132 68 142 80 144 102" fill="none" stroke={shade(a.accent, -0.12)} strokeWidth="2" />
      <rect x="100" y="76" width="24" height="10" rx="5" fill={a.main} />
    </g>
  ),
  boot: (a) => (
    <g>
      <path d="M40 114 L40 128 L76 128 L80 118 L172 118 L176 128 L176 114 Z" fill={a.detail ?? "#3a2a20"} />
      <path d="M46 114 C44 80 46 44 56 26 L96 26 C100 52 104 70 122 80 L154 90 C168 95 176 104 176 114 Z" fill={a.main} />
      <path d="M58 40 L94 40 L96 70 C88 74 70 74 60 70 Z" fill={a.accent} />
      <path d="M56 26 L96 26" stroke={shade(a.main, -0.35)} strokeWidth="5" strokeLinecap="round" />
      <rect x="60" y="18" width="12" height="12" rx="3" fill={shade(a.main, -0.25)} />
      <path d="M48 104 C80 100 130 100 174 106" stroke={shade(a.main, -0.25)} strokeWidth="1.5" fill="none" />
    </g>
  ),
  tee: (a) => <Tee a={a} />,
  "tee-stripes": (a) => <Tee a={a} pattern="stripes" />,
  "tee-print": (a) => <Tee a={a} pattern="print" />,
  longsleeve: (a) => <Tee a={a} long />,
  hoodie: (a) => (
    <g>
      <path d="M58 44 L40 60 L26 118 L44 122 L58 80 L58 136 L142 136 L142 80 L156 122 L174 118 L160 60 L142 44 Z" fill={a.main} />
      <path d="M70 40 C70 22 130 22 130 40 L130 54 C120 46 80 46 70 54 Z" fill={shade(a.main, -0.12)} />
      <path d="M78 50 C86 62 114 62 122 50" fill={shade(a.main, -0.35)} />
      <path d="M92 60 L90 82 M108 60 L110 82" stroke={shade(a.main, 0.45)} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M74 104 L126 104 L132 128 L68 128 Z" fill={shade(a.main, -0.08)} />
      <path d="M58 132 L142 132" stroke={shade(a.main, -0.2)} strokeWidth="5" />
      <path d="M26 116 L44 120 M156 120 L174 116" stroke={shade(a.main, -0.2)} strokeWidth="5" strokeLinecap="round" />
    </g>
  ),
  backpack: (a) => (
    <g>
      <path d="M84 30 C84 16 116 16 116 30" fill="none" stroke={shade(a.main, -0.3)} strokeWidth="6" strokeLinecap="round" />
      <rect x="56" y="30" width="88" height="106" rx="26" fill={a.main} />
      <path d="M56 70 C56 44 76 30 100 30 C124 30 144 44 144 70 Z" fill={shade(a.main, 0.08)} />
      <path d="M62 68 C70 50 130 50 138 68" fill="none" stroke={a.accent} strokeWidth="3" strokeLinecap="round" />
      <rect x="70" y="84" width="60" height="40" rx="14" fill={shade(a.main, -0.12)} />
      <path d="M78 92 L122 92" stroke={a.accent} strokeWidth="3" strokeLinecap="round" />
      <rect x="96" y="88" width="10" height="9" rx="2" fill={a.accent} />
      <path d="M56 60 L48 112 M144 60 L152 112" stroke={shade(a.main, -0.3)} strokeWidth="5" strokeLinecap="round" />
    </g>
  ),
  rolltop: (a) => (
    <g>
      <rect x="58" y="34" width="84" height="102" rx="18" fill={a.main} />
      <rect x="54" y="26" width="92" height="20" rx="10" fill={shade(a.main, -0.15)} />
      <path d="M100 30 L100 70" stroke={a.accent} strokeWidth="6" strokeLinecap="round" />
      <rect x="92" y="64" width="16" height="12" rx="3" fill={a.accent} />
      <rect x="70" y="90" width="60" height="34" rx="10" fill={shade(a.main, -0.1)} />
      <path d="M58 56 L50 116 M142 56 L150 116" stroke={shade(a.main, -0.3)} strokeWidth="5" strokeLinecap="round" />
    </g>
  ),
  laptopbag: (a) => (
    <g>
      <path d="M88 30 C88 18 112 18 112 30" fill="none" stroke={shade(a.main, -0.3)} strokeWidth="6" strokeLinecap="round" />
      <rect x="50" y="30" width="100" height="106" rx="16" fill={a.main} />
      <path d="M58 44 C58 38 64 36 70 36 L130 36 C136 36 142 38 142 44" fill="none" stroke={a.accent} strokeWidth="2.5" />
      <rect x="64" y="58" width="72" height="62" rx="10" fill={shade(a.main, -0.1)} />
      <path d="M64 78 L136 78" stroke={a.accent} strokeWidth="2.5" />
      <rect x="128" y="74" width="6" height="10" rx="2" fill={a.accent} />
    </g>
  ),
  minibag: (a) => (
    <g>
      <path d="M86 44 C86 30 114 30 114 44" fill="none" stroke={shade(a.main, -0.25)} strokeWidth="5" strokeLinecap="round" />
      <rect x="64" y="44" width="72" height="88" rx="28" fill={a.main} />
      <path d="M64 76 C64 56 80 44 100 44 C120 44 136 56 136 76 L136 92 C124 98 76 98 64 92 Z" fill={shade(a.main, -0.08)} />
      <circle cx="100" cy="92" r="5" fill={a.accent} />
      <rect x="80" y="104" width="40" height="20" rx="8" fill={shade(a.main, 0.15)} />
    </g>
  ),
  tote: (a) => (
    <g>
      <path d="M74 60 C74 24 126 24 126 60" fill="none" stroke={a.accent} strokeWidth="6" strokeLinecap="round" />
      <path d="M86 62 C86 36 114 36 114 62" fill="none" stroke={shade(a.accent, -0.15)} strokeWidth="5" strokeLinecap="round" />
      <path d="M50 60 L150 60 L158 136 L42 136 Z" fill={a.main} />
      <path d="M50 60 L150 60" stroke={shade(a.main, -0.15)} strokeWidth="4" />
      <rect x="82" y="88" width="36" height="22" rx="4" fill="none" stroke={a.accent} strokeWidth="2" />
    </g>
  ),
  fannypack: (a) => (
    <g>
      <path d="M20 86 C40 78 60 80 70 84 M130 84 C140 80 160 78 180 86" fill="none" stroke={shade(a.main, -0.4)} strokeWidth="6" strokeLinecap="round" />
      <path d="M58 82 C58 66 142 66 142 82 L142 104 C142 122 58 122 58 104 Z" fill={a.main} />
      <path d="M62 86 C80 76 120 76 138 86" fill="none" stroke={a.accent} strokeWidth="3" strokeLinecap="round" />
      <rect x="126" y="80" width="10" height="10" rx="2" fill={a.accent} />
      <path d="M70 102 C90 108 110 108 130 102" fill="none" stroke={shade(a.main, -0.2)} strokeWidth="2" />
      <rect x="164" y="80" width="14" height="12" rx="3" fill="#2b2b2b" />
    </g>
  ),
  duffel: (a) => (
    <g>
      <path d="M78 58 C78 36 122 36 122 58" fill="none" stroke={shade(a.main, -0.3)} strokeWidth="6" strokeLinecap="round" />
      <rect x="36" y="56" width="128" height="72" rx="34" fill={a.main} />
      <ellipse cx="46" cy="92" rx="12" ry="34" fill={a.accent} />
      <ellipse cx="154" cy="92" rx="12" ry="34" fill={a.accent} />
      <path d="M58 64 L142 64" stroke={shade(a.main, 0.4)} strokeWidth="2.5" strokeDasharray="5 4" />
      <rect x="84" y="88" width="32" height="14" rx="4" fill={shade(a.main, 0.15)} />
    </g>
  ),
  headphones: (a) => (
    <g>
      <path d="M52 92 C48 42 152 42 148 92" fill="none" stroke={a.main} strokeWidth="11" strokeLinecap="round" />
      <path d="M58 80 C60 52 140 52 142 80" fill="none" stroke={shade(a.main, 0.25)} strokeWidth="3" strokeLinecap="round" />
      <rect x="36" y="80" width="34" height="50" rx="16" fill={a.main} />
      <rect x="130" y="80" width="34" height="50" rx="16" fill={a.main} />
      <rect x="62" y="86" width="12" height="38" rx="6" fill={shade(a.main, 0.2)} />
      <rect x="126" y="86" width="12" height="38" rx="6" fill={shade(a.main, 0.2)} />
      <circle cx="53" cy="105" r="7" fill={a.accent} />
      <circle cx="147" cy="105" r="7" fill={a.accent} />
    </g>
  ),
  cap: (a) => (
    <g>
      <path d="M44 104 C44 58 74 40 104 40 C134 40 156 60 156 100 Z" fill={a.main} />
      <path d="M104 40 C96 58 94 80 96 102" fill="none" stroke={shade(a.main, -0.2)} strokeWidth="2" />
      <path d="M130 46 C136 62 138 80 138 100" fill="none" stroke={shade(a.main, -0.2)} strokeWidth="2" />
      <circle cx="104" cy="40" r="5" fill={shade(a.main, -0.25)} />
      <path d="M150 100 C168 100 186 106 186 114 C186 120 164 118 150 114 Z" fill={shade(a.main, -0.25)} />
      <path d="M40 100 C70 96 130 96 158 100 L158 110 C130 106 70 106 40 110 Z" fill={shade(a.main, -0.12)} />
      <rect x="64" y="66" width="26" height="16" rx="4" fill={a.accent} />
    </g>
  ),
  socks: (a) => (
    <g>
      <g transform="translate(18 -4) rotate(8 110 80)">
        <path d="M86 30 L114 30 L114 92 C114 102 120 108 130 110 L148 114 C160 117 160 134 146 134 L112 132 C96 131 86 120 86 104 Z" fill={shade(a.main, -0.08)} />
        <rect x="86" y="30" width="28" height="12" rx="3" fill={a.detail ?? a.accent} />
      </g>
      <path d="M64 30 L94 30 L94 92 C94 102 100 108 110 110 L130 114 C142 117 142 136 126 136 L90 134 C74 133 64 122 64 106 Z" fill={a.main} />
      <rect x="64" y="30" width="30" height="14" rx="3" fill={a.accent} />
      <path d="M64 48 L94 48" stroke={a.accent} strokeWidth="3" />
      <path d="M114 112 C124 112 134 118 134 128 C126 134 112 132 106 124 Z" fill={a.accent} opacity="0.9" />
    </g>
  ),
  bottle: (a) => (
    <g>
      <rect x="82" y="22" width="36" height="22" rx="6" fill={shade(a.main, -0.3)} />
      <path d="M80 44 L120 44 C126 48 128 54 128 62 L128 132 C128 138 122 142 116 142 L84 142 C78 142 72 138 72 132 L72 62 C72 54 74 48 80 44 Z" fill={a.main} />
      <rect x="80" y="54" width="8" height="74" rx="4" fill={shade(a.main, 0.35)} opacity="0.8" />
      <rect x="72" y="92" width="56" height="18" fill={a.accent} opacity="0.9" />
      <rect x="94" y="16" width="12" height="8" rx="3" fill={shade(a.main, -0.45)} />
    </g>
  ),
  sunglasses: (a) => (
    <g>
      <path d="M32 74 L20 66 M168 74 L180 66" stroke={a.accent} strokeWidth="4" strokeLinecap="round" />
      <path d="M30 72 C30 66 36 64 46 64 L84 64 C92 64 94 70 92 80 C88 100 78 108 62 108 C44 108 32 96 30 72 Z" fill={a.main} />
      <path d="M170 72 C170 66 164 64 154 64 L116 64 C108 64 106 70 108 80 C112 100 122 108 138 108 C156 108 168 96 170 72 Z" fill={a.main} />
      <path d="M92 70 C96 64 104 64 108 70" fill="none" stroke={a.accent} strokeWidth="4" strokeLinecap="round" />
      <path d="M30 66 L92 66 M108 66 L170 66" stroke={a.accent} strokeWidth="4" strokeLinecap="round" />
      <path d="M44 76 L60 92 M124 76 L140 92" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.35" />
    </g>
  ),
  watch: (a) => (
    <g>
      <rect x="82" y="14" width="36" height="44" rx="8" fill={a.main} />
      <rect x="82" y="104" width="36" height="44" rx="8" fill={a.main} />
      <circle cx="100" cy="81" r="34" fill={a.accent} />
      <circle cx="100" cy="81" r="28" fill="#fbfaf7" />
      <path d="M100 81 L100 62 M100 81 L114 88" stroke={a.main} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="100" cy="81" r="3" fill={a.main} />
      <rect x="132" y="76" width="8" height="10" rx="2" fill={shade(a.accent, -0.2)} />
    </g>
  ),
  wallet: (a) => (
    <g>
      <rect x="112" y="40" width="44" height="30" rx="4" fill="#e9b949" transform="rotate(-8 134 55)" />
      <rect x="44" y="52" width="116" height="80" rx="12" fill={a.main} />
      <rect x="50" y="58" width="104" height="68" rx="9" fill="none" stroke={shade(a.main, 0.35)} strokeWidth="1.5" strokeDasharray="4 3" />
      <path d="M44 84 L160 84" stroke={shade(a.main, -0.25)} strokeWidth="2" />
      <rect x="130" y="88" width="22" height="14" rx="4" fill={a.accent} />
    </g>
  ),
  beanie: (a) => (
    <g>
      <circle cx="100" cy="30" r="14" fill={a.accent} />
      <path d="M48 104 C48 58 72 38 100 38 C128 38 152 58 152 104 Z" fill={a.main} />
      {[64, 80, 96, 112, 128].map((x) => (
        <path key={x} d={`M${x} 56 C${x - 2} 72 ${x - 2} 88 ${x} 104`} stroke={shade(a.main, -0.15)} strokeWidth="2" fill="none" />
      ))}
      <rect x="42" y="100" width="116" height="32" rx="10" fill={shade(a.main, -0.1)} />
      {[52, 64, 76, 88, 100, 112, 124, 136, 148].map((x) => (
        <path key={x} d={`M${x} 104 L${x} 128`} stroke={shade(a.main, -0.28)} strokeWidth="2" />
      ))}
    </g>
  ),
  belt: (a) => (
    <g>
      <path d="M30 90 C30 60 170 60 170 90 C170 120 30 120 30 90 Z" fill="none" stroke={a.main} strokeWidth="16" />
      <rect x="136" y="74" width="30" height="32" rx="5" fill="none" stroke={a.accent} strokeWidth="5" />
    </g>
  ),
};

function Tee({ a, pattern, long = false }: { a: Art; pattern?: "stripes" | "print"; long?: boolean }) {
  const body = long
    ? "M66 36 L84 28 Q100 38 116 28 L134 36 L156 52 L170 128 L152 132 L138 72 L138 136 L62 136 L62 72 L48 132 L30 128 L44 52 Z"
    : "M62 36 L84 28 Q100 38 116 28 L138 36 L166 60 L150 80 L138 70 L138 136 L62 136 L62 70 L50 80 L34 60 Z";
  const id = `tee-${a.kind}-${a.main.replace("#", "")}-${a.accent.replace("#", "")}`;
  return (
    <g>
      <defs>
        <clipPath id={id}>
          <path d={body} />
        </clipPath>
      </defs>
      <path d={body} fill={a.main} stroke={shade(a.main, -0.08)} strokeWidth="1.2" />
      {pattern === "stripes" && (
        <g clipPath={`url(#${id})`}>
          {[46, 62, 78, 94, 110, 126].map((y) => (
            <rect key={y} x="20" y={y} width="160" height="7" fill={a.accent} />
          ))}
        </g>
      )}
      {pattern === "print" && (
        <g>
          <path d="M80 92 L94 70 L102 82 L110 72 L122 92 Z" fill={a.accent} />
          <circle cx="112" cy="66" r="4" fill={shade(a.main, 0.6)} />
          <rect x="80" y="96" width="42" height="4" rx="2" fill={a.accent} />
        </g>
      )}
      <path d="M84 28 Q100 46 116 28" fill="none" stroke={shade(a.main, -0.22)} strokeWidth="4" strokeLinecap="round" />
      <path d="M62 70 L62 136 M138 70 L138 136" stroke={shade(a.main, -0.1)} strokeWidth="1" />
      <path d="M76 110 C88 116 112 116 124 110" fill="none" stroke={shade(a.main, -0.12)} strokeWidth="1.2" opacity="0.7" />
    </g>
  );
}

interface Props {
  art: Art;
  label: string;
  className?: string;
  /** Sin fondo (para fichas pequeñas sobre otra superficie). */
  bare?: boolean;
}

export function ProductArt({ art, label, className, bare = false }: Props) {
  return (
    <svg className={className} viewBox="0 0 200 160" role="img" aria-label={label}>
      {!bare && <rect width="200" height="160" fill={art.bg} />}
      <ellipse cx="102" cy="142" rx="64" ry="7" fill="rgb(60 40 20 / 0.12)" />
      {draws[art.kind](art)}
    </svg>
  );
}
