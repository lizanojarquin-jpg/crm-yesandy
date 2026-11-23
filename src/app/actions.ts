"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_NOMBRE } from "@/lib/nombre-cliente";

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // La próxima vez que entre, vuelve a preguntar con qué nombre se presenta.
  (await cookies()).delete(COOKIE_NOMBRE);
  redirect("/login");
}
