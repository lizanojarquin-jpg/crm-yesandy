// Prueba del flujo completo de la asesora sobre una conversación FALSA (no existe en Zernio):
// revisa modo pruebas, espera, historial, decisión y registro. El envío falla a propósito,
// así que no le llega nada a nadie. Al final borra todo y deja los ajustes como estaban.
// Uso: npx.cmd --yes tsx --conditions=react-server --env-file=.env.local scripts/prueba-asesora-flujo.mts
import { createAdminClient } from "../src/lib/supabase/admin";
import { responderConIA } from "../src/lib/ia/asesora";

const db = createAdminClient();
const { data: canal } = await db.from("channel_accounts").select("id").eq("platform", "whatsapp").single();
const { data: ajustes } = await db.from("app_settings").select("key, value").in("key", ["ai_modo", "ai_contactos_prueba"]);

const { data: contacto } = await db.from("contacts").insert({ name: "Prueba IA (borrar)" }).select("id").single();
const { data: conv } = await db
  .from("conversations")
  .insert({ contact_id: contacto!.id, channel_account_id: canal!.id, external_conversation_id: `prueba-ia-${crypto.randomUUID()}`, kind: "dm" })
  .select("id")
  .single();

const mensaje = async (body: string) =>
  (await db.from("messages").insert({ conversation_id: conv!.id, direction: "inbound", sender_type: "customer", body, delivery_status: "delivered" }).select("id").single()).data!.id;

try {
  // 1. IA apagada: no hace nada.
  await db.from("app_settings").upsert({ key: "ai_modo", value: "apagada" }, { onConflict: "key" });
  const m1 = await mensaje("Hola, busco un regalo para mi mamá");
  console.log("Apagada →", await responderConIA(m1, { esperaMs: 0 }));

  // 2. Modo pruebas sin el contacto: no responde.
  await db.from("app_settings").upsert({ key: "ai_modo", value: "pruebas" }, { onConflict: "key" });
  await db.from("app_settings").upsert({ key: "ai_contactos_prueba", value: [] }, { onConflict: "key" });
  console.log("Pruebas, contacto no incluido →", await responderConIA(m1, { esperaMs: 0 }));

  // 3. Dos mensajes seguidos: el primero se omite, el segundo responde (el envío falla: conversación falsa).
  await db.from("app_settings").upsert({ key: "ai_contactos_prueba", value: [contacto!.id] }, { onConflict: "key" });
  const m2 = await mensaje("Hola, busco un regalo para mi mamá");
  const m3 = await mensaje("le gustan los perfumes");
  const [r2, r3] = await Promise.all([responderConIA(m2, { esperaMs: 1500 }), responderConIA(m3, { esperaMs: 1500 })]);
  console.log("Primer mensaje →", r2);
  console.log("Segundo mensaje →", r3);

  // 4. El mismo mensaje dos veces (webhook repetido): la segunda no hace nada.
  console.log("Repetido →", await responderConIA(m3, { esperaMs: 0 }));

  // 5. Una persona del equipo escribió hace un rato: la IA no se mete.
  await db.from("messages").insert({ conversation_id: conv!.id, direction: "outbound", sender_type: "agent", body: "Hola, con gusto le ayudo", delivery_status: "sent", created_at: new Date(Date.now() - 60_000).toISOString() });
  const m4 = await mensaje("ok gracias, y en qué horario están?");
  console.log("Con vendedora atendiendo →", await responderConIA(m4, { esperaMs: 0 }));

  const { data: runs } = await db.from("ai_runs").select("status, detail, cost_usd").eq("conversation_id", conv!.id).order("created_at");
  console.log("\nRegistro:", JSON.stringify(runs, null, 1));
} finally {
  await db.from("contacts").delete().eq("id", contacto!.id); // borra conversación, mensajes y registro en cascada
  for (const a of ajustes ?? []) await db.from("app_settings").upsert({ key: a.key, value: a.value }, { onConflict: "key" });
  const { data: final } = await db.from("app_settings").select("key, value").in("key", ["ai_modo", "ai_contactos_prueba"]);
  console.log("\nAjustes restaurados:", JSON.stringify(final));
}
