"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type EstadoRespuesta = { ok: boolean; mensaje: string; n?: number } | null;

const leer = (fd: FormData) => ({
  title: String(fd.get("titulo") ?? "").trim().slice(0, 60),
  body: String(fd.get("texto") ?? "").trim().slice(0, 1500),
});

/** Crea (sin id) o edita una respuesta rápida. */
export async function guardarRespuesta(id: string | null, _prev: EstadoRespuesta, fd: FormData): Promise<EstadoRespuesta> {
  const usuario = await requireAdmin();
  const { title, body } = leer(fd);
  if (title.length < 2 || body.length < 2) return { ok: false, mensaje: "Escribe el nombre y el texto." };
  const sb = await createClient();
  if (id) {
    const { error } = await sb.from("quick_replies").update({ title, body, updated_by: usuario.id }).eq("id", id);
    if (error) return { ok: false, mensaje: "No se pudo guardar." };
  } else {
    const { data: ultima } = await sb.from("quick_replies").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const { error } = await sb
      .from("quick_replies")
      .insert({ title, body, sort_order: (ultima?.sort_order ?? 0) + 10, updated_by: usuario.id });
    if (error) return { ok: false, mensaje: "No se pudo guardar." };
  }
  revalidatePath("/configuracion");
  return { ok: true, mensaje: "Guardada", n: Date.now() };
}

export async function borrarRespuesta(id: string) {
  await requireAdmin();
  const sb = await createClient();
  await sb.from("quick_replies").delete().eq("id", id);
  revalidatePath("/configuracion");
}
