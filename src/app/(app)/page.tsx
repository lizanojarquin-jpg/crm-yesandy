import { getUsuarioActual } from "@/lib/auth";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Bandeja · CRM Yesandy" };

export default async function BandejaPage() {
  const usuario = await getUsuarioActual();
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-semibold">Hola, {usuario.nombre}</h1>
      <p className="text-sm text-muted">Bandeja de conversaciones</p>
      <EmptyState
        titulo="Todavía no hay conversaciones"
        descripcion="Cuando se conecten WhatsApp, Facebook, Instagram y TikTok, los mensajes van a aparecer aquí."
      />
    </div>
  );
}
