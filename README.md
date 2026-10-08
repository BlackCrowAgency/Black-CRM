# Crow CRM

Demo de Black Crow: control de inventario en tiempo real para negocios que
venden productos físicos.

**Venta → stock → alerta → reposición.** Cada venta actualiza el stock; Crow CRM
detecta los productos en riesgo y propone la reposición antes del quiebre.

El negocio es ficticio: **Rumbo**, una tienda urbana con venta online y a
mayoristas (zapatillas, polos, mochilas y accesorios). Productos, proveedores,
ventas y personas son inventados; las ilustraciones de producto se dibujaron
para esta demo (SVG propio, sin fotos de terceros).

## Empezar

```bash
npm install
npm run dev
```

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo (Turbopack). |
| `npm run build` / `npm start` | Build de producción y servidor. |
| `npm run typecheck` | TypeScript estricto. |
| `npm run lint` | ESLint (Next, React Hooks y accesibilidad), sin advertencias. |
| `npm test` | Pruebas del motor de datos y de las integraciones (Vitest). |
| `npm run check` | Todo lo anterior en cadena. |

Node 22.12 o superior. No necesita variables de entorno (ver `.env.example`).

## Estructura de la página

Una sola escena cinematográfica (`src/components/cinema`) y un cierre breve.

El panel de Crow CRM ocupa el centro de un escenario fijo y se transforma con el
scroll (una transformación 3D tipo cámara, más profundidad por pieza). Cada
capítulo lleva una sola frase; el panel cuenta el resto.

| Capítulo | Frase | Qué hace el panel |
| --- | --- | --- |
| Inventario | El CRM que controla tu inventario. | Se abre despiezado en 3D. |
| Ventas | Cada venta descuenta stock al instante. | El stock de Zapatillas Urban retrocede diez días y vuelve a hoy venta a venta (42 → 11). |
| Alertas | Te avisa antes del quiebre. | Adelanta la alerta de quiebre. |
| Pronóstico | Pronostica cuánto vas a vender. | El gráfico descubre la proyección. |
| Reposición | Repone con un clic. | El pedido se arma caja por caja. |
| Estadísticas | Estadísticas que te dicen qué hacer. (Impulsado por IA) | Panel completo y utilizable, con el asistente Crow CRM IA. |

**Crow CRM IA** responde tres preguntas con los datos del motor y, al pedirle la
acción, la ejecuta sobre el panel contando cada paso:

- «¿Qué repongo esta semana?» → crea los pedidos sugeridos: la alerta pasa a
  «Reposición en camino», el pedido a «Pedido creado», el pronóstico sube y
  bajan las alertas activas.
- «¿Qué está creciendo?» → el módulo de crecimiento cambia a la vista por
  categoría.
- «¿Qué no se vende?» → activa una promoción del 20 % y el módulo de stock la
  muestra.

Cada acción se puede deshacer: tras el resultado aparece «Deshacer» (cancela los
pedidos, vuelve a las ventas mensuales o retira la promoción) y, mientras el
panel tenga cambios, «Restablecer panel» lo devuelve al estado inicial. Las
piezas que cambian se resaltan unos segundos. El botón del pedido del panel
también crea el pedido directamente. No hay hojas ni fichas emergentes.

**Créditos**: el cierre muestra el monograma de Black Crow (`public/brand`) con «Quiero un CRM así» (WhatsApp de Black Crow con el mensaje
escrito, o `NEXT_PUBLIC_CONTACT_URL`) y «Conocer Black Crow»
(`https://www.blackcrow.agency`, o `NEXT_PUBLIC_BLACKCROW_URL`).

**Imagen para compartir** (`src/app/opengraph-image.tsx`, reutilizada en
`twitter-image.tsx`): 1200 × 630, generada en el build con Instrument Sans
(cortes estáticos en `src/app/og`, licencia OFL) y datos reales del motor:
titular, sello «Impulsado por IA», adelanto del panel y la recomendación de la
IA. En producción, definir `NEXT_PUBLIC_SITE_URL` para que las URL de la imagen
sean absolutas.

## Stack

| Pieza | Por qué |
| --- | --- |
| **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript** estricto | Mismo ecosistema que Black Crow. La página se prerenderiza como estática (rápida, buena para SEO) y las rutas de API de la versión real conviven en el proyecto. Despliegue directo en Vercel. |
| **Transformaciones 3D de CSS** | El panel es HTML real (nítido y accesible) movido por una cámara 3D; sin motor 3D ni dependencias. El scroll solo escribe variables CSS y la transformación de la cámara en cada fotograma. |
| **CSS Modules** con tokens | Identidad propia (iris, teal, naranja y violeta para la IA; Instrument Sans semicondensada en títulos) sin peso extra. |
| **Zustand** | Estado compartido pequeño: escena, asistente y pedidos leen lo mismo. |
| **d3-scale / d3-shape** | Escalas y curvas para gráficas SVG propias. |
| **lucide-react** | Iconos con *tree-shaking*. |
| **zod** | Validación de configuración y de eventos externos. |
| **Vitest** | Pruebas del motor y de las integraciones. |

## Cómo funciona

- **Catálogo** (`src/domain/catalog.ts`): 31 productos con precio, costo,
  proveedor, caja de compra, ritmo de venta e ilustración.
- **Generador** (`src/domain/generator.ts`): de forma determinista crea 26
  semanas de ventas diarias y 28 días de movimientos detallados (ventas en
  tienda, online y mayoristas, recepciones, devoluciones y ajustes) respetando
  el stock en cada momento.
- **Libro de movimientos** (`src/domain/ledger.ts`): el stock es la suma de
  movimientos, así la escena, el asistente y la API siempre coinciden.
- **Motor** (`analysis.ts`, `forecast.ts`, `engine.ts`): ritmo de venta,
  pronóstico (Holt-Winters amortiguado con estacionalidad semanal y anual),
  fecha probable de quiebre y reposición sugerida por cajas.
- **Rendimiento** (`perf.ts`): ingresos por día y canal, unidades y más vendidos
  a partir de los mismos movimientos.
- **Crecimiento** (`growth.ts`): ingresos diarios y semanales, rendimiento por
  categoría (30 días frente a los 30 anteriores, margen, días de stock,
  tendencia de 12 semanas) y ventas que protege la reposición sugerida. La
  tienda crece alrededor de un 5 % mensual en el dataset.
- **Estados** (`simple.ts`): stock saludable, alta demanda, stock bajo,
  requiere reposición, agotado, reposición en camino, sobrestock, sin ventas.
- **En vivo** (`live.ts`): desde la carga, cada segundo avanza unos minutos de
  operación (más rápido de noche) con ventas, devoluciones y recepciones
  programadas. Se puede pausar.

## Responsive

La escena tiene dos modos, decididos por la misma condición en CSS y en la
cámara (`STACKED_QUERY` en `src/components/cinema/layout.ts`):

| Pantalla | Modo | Cómo se ve |
| --- | --- | --- |
| Escritorio y laptop (≥ 1000 px) | Lado a lado | Texto a la izquierda, panel en la zona libre a la derecha (nunca debajo del texto). |
| Tableta o móvil en horizontal | Lado a lado compacto | Títulos más pequeños, cabecera de 52 px en pantallas bajas, asistente con desplazamiento interno si no cabe. |
| Tableta o móvil en vertical | Apilado | Panel arriba, frase abajo; en el cierre el asistente ocupa la parte inferior (55 % en tabletas, 74 % en móviles). |

`stageLayout()` calcula las medidas (columna de texto, alturas, barra de
capítulos, área segura de la muesca) y las pasa al CSS como variables
(`--cap-x`, `--cap-w`, `--cap-h`, `--cap-h-final`, `--cap-max-h`, `--rail-h`),
así texto y cámara nunca se pisan. Los títulos escalan con el ancho y con el
alto (`min(clamp(…), …svh)`). Al girar el dispositivo se conserva el capítulo.

Táctil: capítulos como barras con área de 44 px, chips y botones del asistente
de 40–42 px en pantallas táctiles (`pointer: coarse`), hover solo con ratón y
márgenes `env(safe-area-inset-*)` (`viewportFit: "cover"`).

## Accesibilidad y rendimiento

- Página estática, fuente autoalojada con `next/font` (Instrument Sans con
  eje de anchura), sin imágenes rasterizadas.
- La escena solo anima mientras está en pantalla, no repinta si el scroll, el
  puntero y los datos están quietos, y solo escribe estilos que cambian.
- `prefers-reduced-motion`: los capítulos cambian sin transición de cámara.
- Los textos de cada capítulo son HTML real; la barra de capítulos es
  navegable con teclado y el panel solo recibe interacción en el capítulo final.

## Versión real

La estructura para conectar tienda online, POS, almacén, ERP, proveedores y
base de datos está en `src/server` y `src/app/api`, y se activa con variables
de entorno. Ver [docs/INTEGRACIONES.md](docs/INTEGRACIONES.md),
[docs/schema.sql](docs/schema.sql) y [.env.example](.env.example).

## Despliegue

Vercel sin configuración adicional (`npm run build`). En producción, definir
`NEXT_PUBLIC_SITE_URL` con el dominio final.
