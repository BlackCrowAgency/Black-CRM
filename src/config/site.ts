import { publicEnv } from "./env";

/** Constantes editoriales del sitio. Lo que depende del despliegue viene de `publicEnv`. */
export const site = {
  name: "Black CRM",
  title: "Black CRM — CRM de inventario impulsado por IA",
  description:
    "Black CRM es el CRM que controla tu inventario en tiempo real: avisa antes del quiebre, pronostica la demanda y te dice qué hacer con IA.",
  locale: "es-PE",
  htmlLang: "es",
  ogLocale: "es_PE",
  currency: "PEN",
  url: publicEnv.siteUrl,
  /** El estudio que hizo Black CRM: créditos y contacto (datos públicos de Black Crow). */
  studio: {
    name: "Black Crow",
    url: publicEnv.studioUrl ?? "https://www.blackcrow.agency",
    city: "Lima, Perú",
    email: "hello@blackcrow.agency",
    instagram: "https://www.instagram.com/blackcrow.agency/",
    /** «Quiero un CRM así»: por defecto, el WhatsApp de Black Crow con el mensaje ya escrito. */
    contactUrl: publicEnv.contactUrl ?? `https://wa.me/51959201985?text=${encodeURIComponent("Hola, Black Crow. Vi Black CRM y quiero un CRM así para mi negocio.")}`,
  },
} as const;
