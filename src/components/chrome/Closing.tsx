import Image from "next/image";
import { site } from "@/config/site";
import { Wordmark } from "./Logo";
import styles from "./chrome.module.css";

/** Cierre como créditos: el producto, quién lo hizo y cómo pedir uno. */
export function Closing() {
  const { studio } = site;
  return (
    <section id="contacto" className={styles.closing} aria-labelledby="cierre-title">
      <div className={styles.closingGlow} aria-hidden="true" />
      <div className={styles.closingInner}>
        <a className={styles.crowMark} href={studio.url} target="_blank" rel="noopener noreferrer" aria-label={`${studio.name}, sitio web`}>
          <Image src="/brand/black-crow-icon.svg" alt="" width={2819} height={3275} unoptimized className={styles.crowIcon} />
        </a>
        <h2 id="cierre-title" className={styles.closingTitle}>
          Un CRM que entiende tu inventario y te dice qué hacer.
        </h2>

        <div className={styles.creditsCtas}>
          <a className={styles.closingCta} href={studio.contactUrl} target="_blank" rel="noopener noreferrer">
            Quiero un CRM así
          </a>
          <a className={styles.closingSecondary} href={studio.url} target="_blank" rel="noopener noreferrer">
            Conocer Black Crow
          </a>
        </div>
      </div>
      <footer className={styles.footer}>
        <Wordmark />
        <p className={styles.footerLinks}>
          <a href={`mailto:${studio.email}`}>{studio.email}</a>
          <span>
            © {new Date(Date.UTC(2026, 0, 1)).getUTCFullYear()}{" "}
            <a href={studio.url} target="_blank" rel="noopener noreferrer">
              Black Crow
            </a>
          </span>
        </p>
      </footer>
    </section>
  );
}
