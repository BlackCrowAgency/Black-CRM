import { CROW_LOGOTYPE, CROW_MARK } from "./marks";

/**
 * Símbolo de Crow CRM: un cuervo en vuelo que cruza su órbita. `size` es la
 * altura; el ancho sale de la proporción del trazo.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={(size * CROW_MARK.width) / CROW_MARK.height} height={size} viewBox={`0 0 ${CROW_MARK.width} ${CROW_MARK.height}`} aria-hidden="true">
      <path d={CROW_MARK.d} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

/** Símbolo y logotipo «Crow CRM» en línea, para la cabecera y el pie. */
export function Wordmark() {
  const height = 15;
  return (
    <span role="img" aria-label="Crow CRM" style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <Logo size={28} />
      <svg width={(height * CROW_LOGOTYPE.width) / CROW_LOGOTYPE.height} height={height} viewBox={`0 0 ${CROW_LOGOTYPE.width} ${CROW_LOGOTYPE.height}`} aria-hidden="true">
        <path d={CROW_LOGOTYPE.d} fill="currentColor" fillRule="evenodd" />
      </svg>
    </span>
  );
}
