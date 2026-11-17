// Vuelve a procesar eventos de Zernio guardados que quedaron ignorados o con error.
// Uso: npx.cmd tsx --conditions=react-server --env-file=.env.local scripts/reprocesar-eventos.mts ["texto del error"]
import { createAdminClient } from "@/lib/supabase/admin";
import { processZernioEvent } from "@/lib/zernio/ingest";

const filtro = process.argv[2] ?? "ignorado: mensaje no encontrado";
const db = createAdminClient();
const { data, error } = await db
  .from("webhook_events")
  .select("id, event_type, payload")
  .eq("error", filtro)
  .order("received_at");
if (error) throw error;

let ok = 0;
for (const ev of data ?? []) {
  try {
    const r = await processZernioEvent(ev.payload as { event?: string } & Record<string, unknown>);
    await db
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString(), error: r.status === "ignored" ? `ignorado: ${r.detail}` : null })
      .eq("id", ev.id);
    if (r.status !== "ignored") ok++;
    console.log(ev.event_type, r.status, r.detail ?? "");
  } catch (e) {
    console.log(ev.event_type, "ERROR", e instanceof Error ? e.message : e);
  }
}
console.log(`${ok} de ${data?.length ?? 0} eventos guardados.`);
