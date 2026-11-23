"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { leerLecciones, pensar, type Turno } from "@/lib/ia/asesora";

export type Estado = { ok: boolean; mensaje: string; n?: number } | null;

// ---------------------------------------------------------------------
// Chat de práctica: la IA responde igual que a un cliente, sin enviar nada.
// ---------------------------------------------------------------------
export type RespuestaPractica = {
  ok: boolean;
  error?: string;
  texto?: string;
  productos?: { nombre: string; imagen: string | null; enlace: string | null }[];
  pasa?: boolean;
  motivo?: string;
  costo?: number;
};

export async function practicar(
  turnos: { de: "cliente" | "ia"; texto: string }[],
  incluirPropuestas: boolean,
): Promise<RespuestaPractica> {
  await requireAdmin();
  const limpios = turnos
    .slice(-30)
    .map((t) => ({ de: t.de === "ia" ? "ia" : "cliente", texto: String(t.texto ?? "").slice(0, 1500) }) as Turno)
    .filter((t) => t.texto?.trim());
  if (!limpios.length || limpios[limpios.length - 1].de !== "cliente") return { ok: false, error: "Escribe un mensaje como cliente." };
  try {
    const d = await pensar({
      turnos: limpios,
      canal: "whatsapp",
      nombre: null,
      etapa: limpios.some((t) => t.de === "ia") ? "advising" : "new",
      lecciones: await leerLecciones(incluirPropuestas),
    });
    return {
      ok: true,
      texto: d.texto,
      productos: d.productos.map((p) => ({ nombre: p.name, imagen: p.image_url, enlace: p.product_url })),
      pasa: d.pasar,
      motivo: d.motivo,
      costo: d.costo,
    };
  } catch (e) {
    console.error("práctica", e);
    return { ok: false, error: "La IA no pudo responder. Intenta de nuevo." };
  }
}

// ---------------------------------------------------------------------
// Lecciones: reglas y correcciones
// ---------------------------------------------------------------------
const texto = (fd: FormData, k: string, max: number) => {
  const v = String(fd.get(k) ?? "").trim().slice(0, max);
  return v || null;
};

/** Solo administración enseña a la IA; lo que guarda queda activo de una vez. */
export async function crearLeccion(_prev: Estado, fd: FormData): Promise<Estado> {
  const usuario = await requireAdmin();
  const kind = fd.get("kind") === "correccion" ? "correccion" : "regla";
  const content = texto(fd, "content", 2000);
  if (!content || content.length < 3) {
    return { ok: false, mensaje: kind === "regla" ? "Escribe la regla." : "Escribe lo que debió responder." };
  }
  const messageId = texto(fd, "message_id", 40);
  const esAdmin = usuario.rol === "admin";
  const sb = await createClient();
  const { error } = await sb.from("ai_lessons").insert({
    kind,
    content,
    reason: texto(fd, "reason", 500),
    situation: kind === "correccion" ? texto(fd, "situation", 1000) : null,
    original_reply: kind === "correccion" ? texto(fd, "original_reply", 2000) : null,
    source_message_id: messageId && /^[0-9a-f-]{36}$/i.test(messageId) ? messageId : null,
    created_by: usuario.id,
    status: esAdmin ? "activa" : "propuesta",
    approved_by: esAdmin ? usuario.id : null,
    approved_at: esAdmin ? new Date().toISOString() : null,
  });
  if (error) return { ok: false, mensaje: "No se pudo guardar." };
  revalidatePath("/entrenar");
  return {
    ok: true,
    mensaje: esAdmin ? "Guardado. La IA ya lo aplica." : "Enviado. Un administrador lo revisa antes de que la IA lo aplique.",
    n: Date.now(),
  };
}

export async function cambiarEstadoLeccion(id: string, estado: "activa" | "archivada") {
  const usuario = await requireAdmin();
  const sb = await createClient();
  await sb
    .from("ai_lessons")
    .update(
      estado === "activa"
        ? { status: "activa", approved_by: usuario.id, approved_at: new Date().toISOString() }
        : { status: "archivada" },
    )
    .eq("id", id);
  revalidatePath("/entrenar");
}

export async function borrarLeccion(id: string) {
  await requireAdmin();
  const sb = await createClient();
  await sb.from("ai_lessons").delete().eq("id", id);
  revalidatePath("/entrenar");
}

export async function editarLeccion(id: string, _prev: Estado, fd: FormData): Promise<Estado> {
  await requireAdmin();
  const content = texto(fd, "content", 2000);
  if (!content || content.length < 3) return { ok: false, mensaje: "El texto está vacío." };
  const sb = await createClient();
  const { error } = await sb.from("ai_lessons").update({ content, reason: texto(fd, "reason", 500) }).eq("id", id);
  if (error) return { ok: false, mensaje: "No se pudo guardar." };
  revalidatePath("/entrenar");
  return { ok: true, mensaje: "Guardado", n: Date.now() };
}

// ---------------------------------------------------------------------
// Información del negocio
// ---------------------------------------------------------------------
export async function guardarTema(key: string, _prev: Estado, fd: FormData): Promise<Estado> {
  const usuario = await requireAdmin();
  const content = texto(fd, "contenido", 2000);
  if (!content || content.length < 3) return { ok: false, mensaje: "Escribe entre 3 y 2000 caracteres." };
  const { error } = await createAdminClient()
    .from("business_knowledge")
    .update({ content, updated_by: usuario.id })
    .eq("key", key);
  if (error) return { ok: false, mensaje: "No se pudo guardar." };
  revalidatePath("/entrenar");
  return { ok: true, mensaje: "Guardado. La IA ya lo usa.", n: Date.now() };
}

const clave = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

export async function crearTema(_prev: Estado, fd: FormData): Promise<Estado> {
  const usuario = await requireAdmin();
  const titulo = texto(fd, "titulo", 80);
  const content = texto(fd, "contenido", 2000);
  if (!titulo || !clave(titulo)) return { ok: false, mensaje: "Ponle un título al tema." };
  if (!content || content.length < 3) return { ok: false, mensaje: "Escribe la información." };
  const db = createAdminClient();
  const { data: ultimo } = await db.from("business_knowledge").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from("business_knowledge").insert({
    key: `${clave(titulo)}_${Date.now().toString(36)}`,
    title: titulo,
    content,
    sort_order: (ultimo?.sort_order ?? 0) + 10,
    updated_by: usuario.id,
  });
  if (error) return { ok: false, mensaje: "No se pudo guardar." };
  revalidatePath("/entrenar");
  return { ok: true, mensaje: "Tema agregado. La IA ya lo usa.", n: Date.now() };
}

export async function borrarTema(key: string) {
  await requireAdmin();
  await createAdminClient().from("business_knowledge").delete().eq("key", key);
  revalidatePath("/entrenar");
}
