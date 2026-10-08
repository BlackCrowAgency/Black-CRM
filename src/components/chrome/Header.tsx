import { Wordmark } from "./Logo";
import styles from "./chrome.module.css";

export function Header() {
  return (
    <header className={styles.header}>
      <a href="#inicio" className={styles.brand} aria-label="Crow CRM, inicio">
        <Wordmark />
      </a>
      <nav aria-label="Secciones" className={styles.nav}>
        <a href="#contacto" className={styles.navCta}>
          Hablar con nosotros
        </a>
      </nav>
    </header>
  );
}
