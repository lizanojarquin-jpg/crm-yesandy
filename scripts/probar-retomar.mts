// Prueba en seco de "retomar clientes que esperan": horas hábiles y qué conversaciones retomaría hoy.
// No envía nada. Uso: npx.cmd --yes tsx --conditions=react-server --env-file=.env.local scripts/probar-retomar.mts
import { minutosHabiles, retomarConversaciones } from "../src/lib/ia/retomar";

const casos: [string, string, string, number][] = [
  // [descripción, desde, hasta, minutos esperados]
  ["lunes 10:00 → 16:00", "2026-11-23T10:00:00-06:00", "2026-11-23T16:00:00-06:00", 360],
  ["lunes 18:00 → martes 9:30 (cierra 19:00, abre 8:30)", "2026-11-23T18:00:00-06:00", "2026-11-24T09:30:00-06:00", 60 + 60],
  ["noche completa: lunes 20:00 → martes 8:00", "2026-11-23T20:00:00-06:00", "2026-11-24T08:00:00-06:00", 0],
  ["sábado 17:00 → domingo 11:00 (domingo abre 9:00)", "2026-11-28T17:00:00-06:00", "2026-11-29T11:00:00-06:00", 120 + 120],
  ["domingo 14:00 → lunes 9:00 (domingo cierra 15:00)", "2026-11-29T14:00:00-06:00", "2026-11-30T09:00:00-06:00", 60 + 30],
];
let fallas = 0;
for (const [nombre, a, b, esperado] of casos) {
  const m = minutosHabiles(new Date(a), new Date(b));
  const ok = m === esperado;
  if (!ok) fallas++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}: ${m} min (esperado ${esperado})`);
}

// Qué haría hoy si la regla ya rigiera (desde hace 2 días), sin enviar nada.
const hoy = await retomarConversaciones({
  forzar: true,
  soloProbar: true,
  verTexto: process.argv.includes("--texto"),
  desde: new Date(Date.now() - 2 * 86400e3).toISOString(),
});
console.log("\nEn seco (si ya rigiera):", hoy.length, "→", hoy.slice(0, 10).join("\n  "));
const real = await retomarConversaciones({ forzar: true, soloProbar: true });
console.log("Con la fecha real de inicio (24-nov):", real.join(", "));
process.exit(fallas ? 1 : 0);
