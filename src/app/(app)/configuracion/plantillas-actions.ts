"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTemplate, ZernioError } from "@/lib/zernio/client";
import { contarVariables, plantillasDe } from "@/lib/inbox/plantillas";

export type EstadoPlantilla = { ok: boolean; mensaje: string; n?: number } | null;

async function cuentaWhatsApp() {
  const { data } = await createAdminClient()
    .from("channel_accounts")
    .select("zernio_account_id")
    .eq("platform", "whatsapp")
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();
  return data?.zernio_account_id ?? null;
}

/** Nombre técnico que pide Meta: minúsculas, números y guiones bajos, empezando con letra. */
function nombreTecnico(titulo: string) {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "p_$1")
    .slice(0, 60);
}

export async function crearPlantilla(_prev: EstadoPlantilla, fd: FormData): Promise<EstadoPlantilla> {
  await requireAdmin();
  const titulo = String(fd.get("titulo") ?? "").trim();
  const texto = String(fd.get("texto") ?? "").trim();
  const categoria = fd.get("categoria") === "MARKETING" ? "MARKETING" : "UTILITY";
  const ejemplos = fd.getAll("ejemplo").map((e) => String(e).trim());

  const name = nombreTecnico(titulo);
  if (!name) return { ok: false, mensaje: "Ponle un nombre a la plantilla." };
  if (texto.length < 10 || texto.length > 1024) return { ok: false, mensaje: "El texto debe tener entre 10 y 1024 caracteres." };
  const n = contarVariables(texto);
  const usados = [...texto.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  if (usados.some((x, _, a) => !a.includes(x - 1) && x !== 1)) {
    return { ok: false, mensaje: "Los datos deben ir en orden: {{1}}, {{2}}, {{3}}…" };
  }
  if (/^\s*\{\{\d+\}\}|\{\{\d+\}\}\s*$/.test(texto)) {
    return { ok: false, mensaje: "Meta no acepta que el texto empiece o termine con un dato {{n}}." };
  }
  if (ejemplos.slice(0, n).some((e) => !e) || ejemplos.length < n) {
    return { ok: false, mensaje: "Escribe un ejemplo para cada dato (Meta los pide para revisar)." };
  }

  const accountId = await cuentaWhatsApp();
  if (!accountId) return { ok: false, mensaje: "WhatsApp no está conectado." };
  try {
    await createTemplate({ accountId, name, category: categoria, language: "es", text: texto, examples: ejemplos.slice(0, n) });
  } catch (e) {
    const detalle = e instanceof ZernioError ? JSON.stringify(e.body ?? e.message).slice(0, 300) : String(e);
    return { ok: false, mensaje: `Meta no recibió la plantilla: ${detalle}` };
  }
  await plantillasDe(accountId, { fresco: true }).catch(() => null);
  revalidatePath("/configuracion");
  return { ok: true, mensaje: `Enviada a revisión como "${name}". Meta responde en menos de 24 horas.`, n: Date.now() };
}

export async function actualizarPlantillas() {
  await requireAdmin();
  const accountId = await cuentaWhatsApp();
  if (accountId) await plantillasDe(accountId, { fresco: true }).catch(() => null);
  revalidatePath("/configuracion");
}
