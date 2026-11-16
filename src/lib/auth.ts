import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Rol } from "@/lib/usuarios";

export type UsuarioActual = {
  id: string;
  nombre: string;
  rol: Rol;
};

// Capa de acceso: lee y valida la sesión en el servidor una vez por solicitud.
// getClaims() verifica la firma del token; no confía en la cookie a ciegas.
export const getUsuarioActual = cache(async (): Promise<UsuarioActual> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  const meta = (claims.app_metadata ?? {}) as { role?: Rol; display_name?: string };
  if (meta.role !== "admin" && meta.role !== "seller") redirect("/login");

  return {
    id: claims.sub,
    nombre: meta.display_name ?? "Usuario",
    rol: meta.role,
  };
});

export async function requireAdmin(): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual();
  if (usuario.rol !== "admin") redirect("/");
  return usuario;
}
