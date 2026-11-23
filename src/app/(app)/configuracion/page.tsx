import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { CambiarPinForm } from "./cambiar-pin-form";
import { Canales } from "./canales";
import { Plantillas } from "./plantillas";
import { Asesora } from "./asesora";
import { RespuestasRapidas } from "./respuestas";

export const metadata = { title: "Configuración · CRM Yesandy" };

export default async function ConfiguracionPage({
  searchParams,
}: {
  searchParams: Promise<{ conectado?: string; error?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 100 });
  const usuarios = (data?.users ?? [])
    .map((u) => ({
      id: u.id,
      nombre: (u.app_metadata?.display_name as string) ?? u.email ?? "",
      rol: u.app_metadata?.role as string | undefined,
      ultimoIngreso: u.last_sign_in_at,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-semibold">Configuración</h1>
      <p className="text-sm text-muted">Solo el administrador ve esta pantalla.</p>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Equipo</h2>
        {error && <p className="text-sm text-danger">No se pudo cargar el equipo.</p>}
        <div className="flex flex-col gap-3">
          {usuarios.map((u) => (
            <Card key={u.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{u.nombre}</p>
                <p className="text-xs text-muted">
                  {u.rol === "admin" ? "Administrador" : u.rol === "seller" ? "Vendedora" : "Sin rol"}
                  {" · "}
                  {u.ultimoIngreso
                    ? `último ingreso ${new Date(u.ultimoIngreso).toLocaleString("es-CR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Costa_Rica" })}`
                    : "nunca ha entrado"}
                </p>
              </div>
              <CambiarPinForm userId={u.id} />
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Canales</h2>
        <Canales conectado={sp.conectado} error={sp.error} />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Respuestas rápidas</h2>
        <RespuestasRapidas />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Asesora IA</h2>
        <Asesora />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Plantillas de WhatsApp</h2>
        <Plantillas />
      </section>
    </div>
  );
}
