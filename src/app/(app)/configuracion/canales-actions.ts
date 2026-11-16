"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getConnectUrl, registerWebhook, sendTestWebhook } from "@/lib/zernio/client";
import { importInboxHistory, syncChannelAccounts } from "@/lib/zernio/ingest";

export type Estado = { ok: boolean; mensaje: string } | null;

const PLATAFORMAS = ["whatsapp", "facebook", "instagram", "tiktok"];

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function conectarCanal(formData: FormData) {
  await requireAdmin();
  const platform = String(formData.get("platform"));
  if (!PLATAFORMAS.includes(platform)) throw new Error("Canal no válido");
  const authUrl = await getConnectUrl(platform, `${siteUrl()}/api/zernio/callback`);
  redirect(authUrl);
}

export async function sincronizarCanales(): Promise<Estado> {
  await requireAdmin();
  try {
    const n = await syncChannelAccounts();
    revalidatePath("/configuracion");
    return { ok: true, mensaje: `${n} canal(es) sincronizado(s).` };
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : "Error al sincronizar" };
  }
}

export async function importarHistorial(): Promise<Estado> {
  await requireAdmin();
  try {
    const r = await importInboxHistory();
    revalidatePath("/configuracion");
    return { ok: true, mensaje: `Importadas ${r.conversaciones} conversaciones y ${r.mensajes} mensajes nuevos.` };
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : "Error al importar" };
  }
}

export async function activarWebhook(): Promise<Estado> {
  await requireAdmin();
  const base = siteUrl();
  if (!base.startsWith("https://")) {
    return { ok: false, mensaje: "El webhook necesita la dirección pública del CRM (https). Se activa después de publicarlo en Vercel." };
  }
  try {
    const w = await registerWebhook(`${base}/api/webhooks/zernio`);
    await sendTestWebhook(w._id).catch(() => null);
    revalidatePath("/configuracion");
    return { ok: true, mensaje: "Webhook activo. Zernio envió un evento de prueba." };
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : "No se pudo registrar el webhook" };
  }
}
