"use server";

import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Guarda un reporte del celular (falla al enviar o resultado de la revisión). Nunca falla. */
export async function guardarDiagnostico(r: { contexto: string; detalle?: string; entorno: Record<string, unknown> }) {
  try {
    const usuario = await getUsuarioActual();
    const sb = await createClient();
    // Solo datos del navegador (modelo, sistema, qué soporta); nada de mensajes de clientes.
    const texto = JSON.stringify(r.entorno ?? {});
    const entorno = texto.length <= 4000 ? JSON.parse(texto) : { recortado: texto.slice(0, 4000) };
    await sb.from("device_reports").insert({
      profile_id: usuario.id,
      context: String(r.contexto ?? "").slice(0, 80) || "sin contexto",
      detail: r.detalle ? String(r.detalle).slice(0, 2000) : null,
      device: entorno,
    });
  } catch (e) {
    console.error("diagnostico", e);
  }
}
