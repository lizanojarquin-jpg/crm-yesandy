// Comprueba que se rescatan las respuestas rotas del modelo (saltos de línea repetidos, JSON cortado).
// Uso: npx.cmd --yes tsx --conditions=react-server scripts/probar-reparar-json.mts
import { repararJSON } from "../src/lib/ia/openrouter";

const casos: [string, string][] = [
  ["cortado con saltos", `{"etapa": "ninguna", "adjunto": "product_photo", "confianza": 1, "motivo": "La tienda envía una foto de un su${"\\n".repeat(120)}\\`],
  ["bien formado", `{"etapa": "payment_received", "adjunto": "payment_receipt", "confianza": 0.95, "motivo": "Comprobante SINPE"}`],
  ["con texto alrededor", "```json\n{\"etapa\": \"shipped\", \"adjunto\": \"ninguno\", \"confianza\": 0.8, \"motivo\": \"va en camino\"}\n```"],
  ["basura", "no hay json aquí"],
];
let fallas = 0;
for (const [nombre, texto] of casos) {
  const r = repararJSON(texto) as { etapa?: string } | null;
  const esperado = nombre !== "basura";
  const ok = esperado ? Boolean(r?.etapa) : r === null;
  if (!ok) fallas++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}: ${JSON.stringify(r)?.slice(0, 120)}`);
}
process.exit(fallas ? 1 : 0);
