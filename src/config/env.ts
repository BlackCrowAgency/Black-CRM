/**
 * Configuración pública (segura para el navegador).
 *
 * Next.js solo incrusta variables `NEXT_PUBLIC_*` cuando se leen de forma
 * literal, por eso cada una se lee explícitamente. Ninguna es obligatoria:
 * sin valores, Black CRM funciona como demo autónoma con datos ficticios.
 *
 * Las credenciales de integraciones viven en `src/server/env.ts` y nunca
 * deben importarse desde componentes cliente.
 */

export type BlackCrmMode = "demo" | "live";

const clean = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const publicEnv = {
  /** URL canónica del despliegue (metadata, sitemap, Open Graph). */
  siteUrl: clean(process.env.NEXT_PUBLIC_SITE_URL) ?? "http://localhost:3000",
  /** `demo`: dataset ficticio en el navegador. `live`: reservado para cargar datos desde la API propia. */
  mode: (process.env.NEXT_PUBLIC_BLACK_CRM_MODE === "live" ? "live" : "demo") as BlackCrmMode,
  /** Enlace de contacto de Black Crow para el cierre. */
  contactUrl: clean(process.env.NEXT_PUBLIC_CONTACT_URL),
  /** Sitio de Black Crow. */
  studioUrl: clean(process.env.NEXT_PUBLIC_BLACKCROW_URL),
} as const;
