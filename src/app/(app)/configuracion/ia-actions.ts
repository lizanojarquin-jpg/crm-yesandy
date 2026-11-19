"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sincronizarCatalogo } from "@/lib/ia/catalogo";

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
