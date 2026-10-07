import { Closing } from "@/components/chrome/Closing";
import { Header } from "@/components/chrome/Header";
import { Experience } from "@/components/inventory/Inventory";

/**
 * Venta → stock → alerta → reposición: el flujo en vivo arriba y el panel
 * del administrador debajo, sobre el mismo motor de datos.
 */
export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Experience />
        <Closing />
      </main>
    </>
  );
}
