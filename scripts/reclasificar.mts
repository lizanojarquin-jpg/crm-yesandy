// Vuelve a pasar por el seguimiento automático los mensajes de un rango de horas (p. ej. si falló).
// Uso: npx.cmd --yes tsx --conditions=react-server --env-file=.env.local scripts/reclasificar.mts <desde ISO> <hasta ISO>
import { createAdminClient } from "../src/lib/supabase/admin";
import { clasificarMensaje } from "../src/lib/ia/clasificador";

const [desde, hasta] = process.argv.slice(2);
if (!desde || !hasta) {
  console.error("Uso: reclasificar.mts <desde ISO> <hasta ISO>");
  process.exit(1);
}
const { data } = await createAdminClient()
  .from("messages")
  .select("id")
  .gte("created_at", desde)
  .lt("created_at", hasta)
  .order("created_at")
  .limit(2000);
const estados: Record<string, number> = {};
let costo = 0;
for (const m of data ?? []) {
  try {
    const r = await clasificarMensaje(m.id);
    estados[r.estado] = (estados[r.estado] ?? 0) + 1;
    costo += r.costo ?? 0;
  } catch (e) {
    estados.error = (estados.error ?? 0) + 1;
    console.log("error", m.id, e instanceof Error ? e.message.slice(0, 100) : e);
  }
}
console.log(`Mensajes revisados: ${data?.length ?? 0}`, JSON.stringify(estados), `costo US$ ${costo.toFixed(4)}`);
