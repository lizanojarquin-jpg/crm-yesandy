// Prueba en seco de la asesora IA: casos inventados, no envía nada a nadie.
// Uso: npx.cmd --yes tsx --conditions=react-server --env-file=.env.local scripts/probar-asesora.mts [n]
import { pensar, type Turno } from "../src/lib/ia/asesora";

const cli = (texto: string, extra: Partial<Turno> = {}): Turno => ({ de: "cliente", texto, ...extra });
const ia = (texto: string): Turno => ({ de: "ia", texto });

const casos: { nombre: string; canal?: "whatsapp" | "instagram" | "facebook"; etapa?: string; turnos: Turno[]; espera: string }[] = [
  {
    nombre: "Cumpleaños, primer mensaje",
    turnos: [cli("Hola buenas, ando buscando algo para el cumpleaños de mi hija el sábado")],
    espera: "saluda como asistente virtual y pregunta (edad/estilo/talla), sin pasar",
  },
  {
    nombre: "Cumpleaños, ya con datos → propone",
    etapa: "advising",
    turnos: [
      cli("Hola buenas, ando buscando algo para el cumpleaños de mi hija el sábado"),
      ia("¡Hola! Soy la asistente virtual de Almacén Yesandy 😊 ¡Qué lindo! ¿Cuántos años cumple tu hija?"),
      cli("12 años, le gusta lo casual"),
      ia("¡Perfecto! ¿Más o menos qué talla usa?"),
      cli("talla 12 o 14"),
    ],
    espera: "busca en ninos y propone 2-4 productos, cierra con '¿vamos bien?'",
  },
  {
    nombre: "Precio directo",
    turnos: [cli("Precio de los jeans barrel negro Denim Lovers?")],
    espera: "no da precio; pregunta talla o pasa a vendedora",
  },
  {
    nombre: "Envíos",
    turnos: [cli("Hola hacen envíos a Cartago?")],
    espera: "explica opciones y pide provincia, cantón, distrito y señas, sin pasar todavía",
  },
  {
    nombre: "Envíos con ubicación → traspaso",
    etapa: "advising",
    turnos: [
      cli("Hola hacen envíos a Cartago?"),
      ia("¡Hola! Sí hacemos envíos. Para cotizarte, ¿me indicas provincia, cantón, distrito y otras señas?"),
      cli("Cartago, Paraíso, Llanos de Santa Lucía, frente a la escuela"),
    ],
    espera: "pasa a vendedora para cotizar, sin inventar precio",
  },
  {
    nombre: "Cuánto tarda",
    turnos: [cli("Si pago hoy cuándo me llega?")],
    espera: "dice que normalmente sale al día siguiente de confirmar el pago",
  },
  {
    nombre: "Horario domingo",
    turnos: [cli("A qué hora abren el domingo?")],
    espera: "responde 9:00 a 3:00, sin pasar",
  },
  {
    nombre: "Mayoreo",
    turnos: [cli("Buenas, venden al por mayor?")],
    espera: "explica ₡50.000 o 3 unidades de la misma prenda",
  },
  {
    nombre: "Promo 30 %",
    turnos: [cli("Todavía está la promo del 30%?")],
    espera: "dice que no está vigente, sin inventar otra",
  },
  {
    nombre: "Audio",
    canal: "whatsapp",
    turnos: [cli(null as unknown as string, { otros: ["audio"] })],
    espera: "pide que lo escriba o pasa a vendedora",
  },
  {
    nombre: "Queja",
    turnos: [cli("Me llegó el pantalón con un hueco, quiero cambiarlo")],
    espera: "pasa a vendedora con empatía",
  },
  {
    nombre: "Elige opción → traspaso",
    etapa: "advising",
    canal: "instagram",
    turnos: [
      cli("Busco un suéter navideño para mi esposo"),
      ia("¡Hola! Soy la asistente virtual de Almacén Yesandy. ¿Para qué ocasión lo quieres y qué talla usa?"),
      cli("para la fiesta del trabajo, es talla L"),
      ia("¡Qué bien! Te envío unas opciones. ¿Me confirmas si vamos bien?"),
      cli("me gusta el segundo, lo tienen en L? cuánto cuesta?"),
    ],
    espera: "pasa a vendedora con resumen (esposo, fiesta trabajo, L)",
  },
];

const solo = process.argv[2] ? Number(process.argv[2]) : null;
let total = 0;
for (const [i, c] of casos.entries()) {
  if (solo && solo !== i + 1) continue;
  try {
    const d = await pensar({ turnos: c.turnos, canal: c.canal ?? "whatsapp", nombre: "Ana", etapa: c.etapa ?? "new" });
    total += d.costo;
    console.log(`\n#${i + 1} ${c.nombre}  (espera: ${c.espera})`);
    console.log(`  → ${d.texto}`);
    if (d.productos.length) console.log(`  fotos: ${d.productos.map((p) => p.name).join(" | ")}`);
    if (d.busquedas.length) console.log(`  búsquedas: ${d.busquedas.join("; ")}`);
    if (d.pasar) console.log(`  PASA A VENDEDORA: ${d.motivo}\n  resumen: ${JSON.stringify(d.resumen)}`);
    console.log(`  costo US$ ${d.costo.toFixed(5)}`);
  } catch (e) {
    console.log(`\n#${i + 1} ${c.nombre}: ERROR ${e instanceof Error ? e.message : e}`);
  }
}
console.log(`\nCosto total US$ ${total.toFixed(4)}`);
