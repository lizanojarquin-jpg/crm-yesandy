"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarCatalogo } from "@/lib/ia/catalogo";

export type EstadoIA = { ok: boolean; mensaje: string; n?: number } | null;

const MODOS = ["apagada", "pruebas", "encendida"] as const;

/** Apagada, solo con contactos de prueba, o encendida para todos. */
export async function cambiarModoIA(fd: FormData) {
  const usuario = await requireAdmin();
  const modo = String(fd.get("modo") ?? "");
  if (!MODOS.includes(modo as (typeof MODOS)[number])) return;
  await createAdminClient()
    .from("app_settings")
    .upsert({ key: "ai_modo", value: modo, updated_by: usuario.id }, { onConflict: "key" });
  revalidatePath("/configuracion");
}

export async function sincronizarCatalogoAccion(): Promise<void> {
  await requireAdmin();
  await sincronizarCatalogo().catch((e) => console.error("catálogo", e));
  revalidatePath("/configuracion");
}

/** Edita un tema del conocimiento del negocio (horario, pagos, envíos…). */
export async function guardarConocimiento(key: string, _prev: EstadoIA, fd: FormData): Promise<EstadoIA> {
  const usuario = await requireAdmin();
  const contenido = String(fd.get("contenido") ?? "").trim();
  if (contenido.length < 3 || contenido.length > 2000) return { ok: false, mensaje: "Escribe entre 3 y 2000 caracteres." };
  const { error } = await createAdminClient()
    .from("business_knowledge")
    .update({ content: contenido, updated_by: usuario.id })
    .eq("key", key);
  if (error) return { ok: false, mensaje: "No se pudo guardar." };
  revalidatePath("/configuracion");
  return { ok: true, mensaje: "Guardado", n: Date.now() };
}
