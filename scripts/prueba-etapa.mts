// Prueba de punta a punta del seguimiento automático en una conversación de prueba:
// inserta un mensaje inventado, lo clasifica (escribe la etapa) y con "limpiar" deja todo como estaba.
// Uso: npx.cmd tsx --conditions=react-server --env-file=.env.local scripts/prueba-etapa.mts <conversationId> [limpiar]
import { createAdminClient } from "@/lib/supabase/admin";
import { clasificarMensaje } from "@/lib/ia/clasificador";

const [conv, accion] = process.argv.slice(2);
const db = createAdminClient();
const ID_PRUEBA = "prueba-fase5-sinpe";

const { data: c } = await db.from("conversations").select("contact_id, last_message_at, last_message_preview, unread_count").eq("id", conv).single();
if (!c) throw new Error("No existe la conversación");

if (accion === "limpiar") {
  const { data: m } = await db.from("messages").select("id").eq("external_message_id", ID_PRUEBA).maybeSingle();
  if (m) {
    await db.from("stage_events").delete().eq("evidence_message_id", m.id);
    await db.from("messages").delete().eq("id", m.id);
  }
  const { data: ultimo } = await db
    .from("messages")
    .select("body, created_at")
    .eq("conversation_id", conv)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  await db.from("conversations").update({ last_message_at: ultimo?.created_at, last_message_preview: ultimo?.body, unread_count: 0 }).eq("id", conv);
  await db.from("contacts").update({ stage: "new", stage_pending_review: false }).eq("id", c.contact_id);
  console.log("Limpio.");
} else {
  const { data: m, error } = await db
    .from("messages")
    .insert({
      conversation_id: conv,
      direction: "inbound",
      sender_type: "customer",
      body: "Listo, ya le hice el SINPE por los 24.900 (mensaje de prueba)",
      external_message_id: ID_PRUEBA,
      delivery_status: "delivered",
    })
    .select("id")
    .single();
  if (error) throw error;
  const r = await clasificarMensaje(m.id);
  const { data: contacto } = await db.from("contacts").select("stage, stage_pending_review").eq("id", c.contact_id).single();
  console.log("Resultado:", r.estado, r.clasificacion?.etapa, r.clasificacion?.confianza, "·", r.clasificacion?.motivo);
  console.log("Contacto ahora:", contacto);
}
