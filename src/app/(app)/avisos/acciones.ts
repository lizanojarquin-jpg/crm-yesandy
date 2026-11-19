"use server";

import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisar } from "@/lib/push";

type Suscripcion = { endpoint: string; keys: { p256dh: string; auth: string } };

const valida = (s: Suscripcion) =>
  typeof s?.endpoint === "string" &&
  s.endpoint.startsWith("https://") &&
  s.endpoint.length < 1000 &&
  typeof s.keys?.p256dh === "string" &&
  typeof s.keys?.auth === "string" &&
  s.keys.p256dh.length < 200 &&
  s.keys.auth.length < 100;

/** Guarda este dispositivo para recibir avisos. */
export async function guardarSuscripcion(s: Suscripcion, dispositivo: string) {
  const usuario = await getUsuarioActual();
  if (!valida(s)) return { ok: false };
  // Si el mismo navegador lo usaba otra persona, el aviso ahora es para quien inició sesión.
  await createAdminClient().from("push_subscriptions").delete().eq("endpoint", s.endpoint);
  const sb = await createClient();
  const { error } = await sb.from("push_subscriptions").insert({
    profile_id: usuario.id,
    endpoint: s.endpoint,
    p256dh: s.keys.p256dh,
    auth: s.keys.auth,
    user_agent: dispositivo.slice(0, 300),
  });
  return { ok: !error };
}

export async function quitarSuscripcion(endpoint: string) {
  await getUsuarioActual();
  const sb = await createClient();
  await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}

/** Manda un aviso de prueba a los dispositivos de quien lo pide. */
export async function avisoDePrueba() {
  const usuario = await getUsuarioActual();
  const n = await avisar(
    { titulo: "Avisos activados ✅", cuerpo: "Así te van a llegar los mensajes nuevos del CRM.", url: "/", tag: "prueba" },
    [usuario.id],
  );
  return { enviados: n };
}
