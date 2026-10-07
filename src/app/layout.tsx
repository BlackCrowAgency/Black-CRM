import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { site } from "@/config/site";
import "./globals.css";

/** Una sola familia: semicondensada y ajustada en títulos y cifras, normal para leer. */
const instrument = Instrument_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: site.title,
  description: site.description,
  applicationName: site.name,
  authors: [{ name: site.studio.name }],
  creator: site.studio.name,
  keywords: ["control de stock", "inventario para tiendas", "stock e-commerce", "alertas de stock bajo", "reposición de productos", "software de inventario", "Black Crow"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: site.ogLocale,
    url: "/",
    siteName: site.name,
    title: site.title,
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: site.title,
    description: site.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#f6f7fa",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  // El contenido llega a los bordes; los márgenes seguros se aplican con env(safe-area-inset-*).
  viewportFit: "cover",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: site.name,
  description: site.description,
  url: site.url,
  inLanguage: site.locale,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  creator: { "@type": "Organization", name: site.studio.name },
  isAccessibleForFree: true,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={site.htmlLang} className={instrument.variable}>
      <body>
        <a href="#panel" className="skip-link">
          Saltar al panel
        </a>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {children}
      </body>
    </html>
  );
}
