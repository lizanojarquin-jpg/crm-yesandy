import { getUsuarioActual } from "@/lib/auth";
import { leerFiltros } from "@/lib/inbox/filtros";
import { BandejaShell } from "./_bandeja/shell";

export const metadata = { title: "Bandeja · CRM Yesandy" };

export default async function BandejaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioActual();
  const filtros = leerFiltros(await searchParams);
  return (
    <BandejaShell filtros={filtros} usuarioId={usuario.id} ruta="/" esAdmin={usuario.rol === "admin"}>
      <div className="hidden items-center justify-center lg:flex">
        <div className="text-center">
          <p className="font-medium">Elige una conversación</p>
          <p className="text-sm text-muted">Los mensajes nuevos aparecen solos, sin recargar.</p>
        </div>
      </div>
    </BandejaShell>
  );
}
