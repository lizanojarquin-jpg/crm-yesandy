// Prueba el clasificador de etapas con mensajes reales SIN escribir nada en la base.
// Uso: npx.cmd tsx --conditions=react-server --env-file=.env.local scripts/probar-clasificador.mts [cantidad]
import { createAdminClient } from "@/lib/supabase/admin";
import { clasificarMensaje } from "@/lib/ia/clasificador";

const cantidad = Number(process.argv[2] ?? 30);
const db = createAdminClient();

const { data: conImagen } = await db
  .from("attachments")
  .select("message_id")
  .eq("type", "image")
  .not("storage_path", "is", null)
  .order("created_at", { ascending: false })
  .limit(cantidad);
const { data: conTexto } = await db
  .from("messages")
  .select("id")
  .or("body.ilike.%sinpe%,body.ilike.%pedido%,body.ilike.%camino%,body.ilike.%transfer%,body.ilike.%gu_a%,body.ilike.%encomienda%,body.ilike.%llegó%,body.ilike.%comprobante%")
  .order("created_at", { ascending: false })
  .limit(cantidad);

const ids = [...new Set([...(conImagen ?? []).map((x) => x.message_id), ...(conTexto ?? []).map((x) => x.id)])];
let total = 0;
const cuenta: Record<string, number> = {};
for (const id of ids) {
  try {
    const r = await clasificarMensaje(id, { soloProbar: true });
    total += r.costo ?? 0;
    const c = r.clasificacion;
    const { data: m } = await db.from("messages").select("body, direction").eq("id", id).single();
    const clave = c ? `${c.etapa}/${c.adjunto}` : r.detalle ?? r.estado;
    cuenta[clave] = (cuenta[clave] ?? 0) + 1;
    if (c && (process.env.VER_TODO || c.etapa !== "ninguna" || c.adjunto === "payment_receipt" || c.adjunto === "shipping_guide")) {
      console.log(
        `${c.etapa.padEnd(16)} ${c.adjunto.padEnd(15)} ${c.confianza.toFixed(2)} ${m?.direction === "inbound" ? "CLIENTE" : "TIENDA "} "${(m?.body ?? "[imagen]").slice(0, 60).replace(/\n/g, " ")}" → ${c.motivo}`,
      );
    }
  } catch (e) {
    console.log("ERROR", id, e instanceof Error ? e.message : e);
  }
}
console.log("\nResumen:", JSON.stringify(cuenta));
console.log(`Mensajes: ${ids.length} · costo total: US$ ${total.toFixed(4)}`);
