import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { FormularioNombre } from "./formulario";

export const metadata = { title: "Tu nombre · CRM Yesandy" };

export default async function BienvenidaPage({ searchParams }: { searchParams: Promise<{ siguiente?: string }> }) {
  const usuario = await getUsuarioActual();
  const { siguiente } = await searchParams;
  const sb = await createClient();
  const { data: perfil } = await sb.from("profiles").select("public_name").eq("id", usuario.id).maybeSingle();

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold tracking-[0.2em] text-accent uppercase">Almacén Yesandy</p>
          <h1 className="mt-2 text-2xl font-semibold">¡Hola, {usuario.nombre}!</h1>
        </div>
        <FormularioNombre actual={perfil?.public_name ?? ""} siguiente={siguiente ?? "/"} />
      </div>
    </main>
  );
}
