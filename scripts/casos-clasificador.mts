// Casos inventados para probar el clasificador de etapas (no toca la base de datos).
// Uso: npx.cmd tsx --conditions=react-server --env-file=.env.local scripts/casos-clasificador.mts <carpeta con comprobante.png y guia.png>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clasificarContenido } from "@/lib/ia/clasificador";
import type { Etapa } from "@/lib/inbox/etiquetas";

const carpeta = process.argv[2] ?? ".";
const img = (f: string) => `data:image/png;base64,${readFileSync(join(carpeta, f)).toString("base64")}`;

type Caso = { nombre: string; actual: Etapa; historial: string; deCliente: boolean; texto: string; imagenes?: string[]; espera: string };

const casos: Caso[] = [
  { nombre: "Pedido confirmado", actual: "advising", historial: "CLIENTE: me llevo el suéter rojo talla M\nTIENDA: perfecto", deCliente: false, texto: "Listo Ana, voy a preparar tu pedido. ¿Por cuál método te gustaría pagar?", espera: "order_confirmed" },
  { nombre: "Apartado", actual: "new", historial: "CLIENTE: me aparta el jean 32 y la blusa negra?", deCliente: false, texto: "Claro, ya se lo aparto 😊", espera: "order_confirmed" },
  { nombre: "Comprobante (imagen)", actual: "order_confirmed", historial: "TIENDA: el total es ₡24.900 al SINPE 7287-XXXX", deCliente: true, texto: "", imagenes: ["comprobante.png"], espera: "payment_received" },
  { nombre: "Dice que pagó", actual: "order_confirmed", historial: "TIENDA: el total es ₡24.900", deCliente: true, texto: "Ya le hice el sinpe", espera: "payment_received" },
  { nombre: "Guía (imagen)", actual: "payment_received", historial: "CLIENTE: ya pagué", deCliente: false, texto: "Aquí está su guía", imagenes: ["guia.png"], espera: "shipped" },
  { nombre: "Va en camino", actual: "payment_received", historial: "", deCliente: false, texto: "Gracias por su compra, su pedido está de camino 🚚", espera: "shipped" },
  { nombre: "Ya llegó", actual: "shipped", historial: "TIENDA: su pedido va en camino", deCliente: true, texto: "Ya me llegó todo, muchas gracias!", espera: "delivered" },
  { nombre: "Pregunta métodos de pago", actual: "advising", historial: "", deCliente: true, texto: "¿Aceptan sinpe o transferencia?", espera: "ninguna" },
  { nombre: "Pregunta envíos", actual: "new", historial: "", deCliente: true, texto: "¿Hacen envíos a Limón por Correos?", espera: "ninguna" },
  { nombre: "Te envío fotos", actual: "new", historial: "CLIENTE: tienen pijamas?", deCliente: false, texto: "Claro, le envío fotos de las opciones", espera: "ninguna" },
];

let ok = 0;
let costo = 0;
for (const c of casos) {
  const { datos, costo: k } = await clasificarContenido({
    actual: c.actual,
    historial: c.historial,
    deCliente: c.deCliente,
    texto: c.texto,
    imagenes: (c.imagenes ?? []).map(img),
  });
  costo += k ?? 0;
  const bien = datos.etapa === c.espera && (datos.etapa === "ninguna" || datos.confianza >= 0.7);
  if (bien) ok++;
  console.log(`${bien ? "✔" : "✘"} ${c.nombre.padEnd(26)} → ${datos.etapa} (${datos.confianza}) ${datos.adjunto} · ${datos.motivo}`);
}
console.log(`\n${ok}/${casos.length} correctos · costo US$ ${costo.toFixed(4)}`);
