"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { COOKIE_NOMBRE, DURACION_TURNO } from "@/lib/nombre-cliente";

export type Estado = { ok: boolean; mensaje: string } | null;

/** Guarda el nombre con que la persona se presenta a los clientes y la deja entrar. */
export async function confirmarNombre(_prev: Estado, fd: FormData): Promise<Estado> {
  const usuario = await getUsuarioActual();
  const nombre = String(fd.get("nombre") ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (nombre.length < 2 || nombre.length > 40 || !/^[\p{L}][\p{L} .'-]*$/u.test(nombre)) {
    return { ok: false, mensaje: "Escribe tu nombre (solo letras, entre 2 y 40)." };
  }
  // El perfil solo lo cambia el servidor; cada quien cambia únicamente el suyo.
  const { error } = await createAdminClient().from("profiles").update({ public_name: nombre }).eq("id", usuario.id);
  if (error) return { ok: false, mensaje: "No se pudo guardar. Intenta de nuevo." };

  (await cookies()).set(COOKIE_NOMBRE, usuario.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_TURNO,
  });
  const destino = String(fd.get("siguiente") ?? "/");
  redirect(destino.startsWith("/") && !destino.startsWith("//") ? destino : "/");
}
