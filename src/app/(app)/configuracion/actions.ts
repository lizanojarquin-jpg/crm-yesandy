"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { esPinValido } from "@/lib/usuarios";

export type EstadoPin = { ok: boolean; mensaje: string } | null;

export async function cambiarPin(
  userId: string,
  _prev: EstadoPin,
  formData: FormData,
): Promise<EstadoPin> {
  await requireAdmin(); // se verifica en el servidor, no solo en la pantalla

  const pin = String(formData.get("pin") ?? "");
  if (!esPinValido(pin)) return { ok: false, mensaje: "El PIN debe tener 6 números." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password: pin });
  if (error) {
    return {
      ok: false,
      mensaje: error.message.includes("weak") || error.message.includes("pwned")
        ? "Ese PIN es muy fácil de adivinar. Usa otro."
        : "No se pudo cambiar el PIN.",
    };
  }
  revalidatePath("/configuracion");
  return { ok: true, mensaje: "PIN actualizado." };
}
