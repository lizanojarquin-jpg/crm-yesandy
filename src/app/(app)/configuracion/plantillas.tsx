import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { cuerpo, plantillasDe } from "@/lib/inbox/plantillas";
import { actualizarPlantillas } from "./plantillas-actions";
import { NuevaPlantillaForm } from "./nueva-plantilla-form";

const ESTADO: Record<string, { texto: string; tono: "acento" | "aviso" | "neutro" }> = {
  APPROVED: { texto: "Aprobada", tono: "acento" },
  PENDING: { texto: "En revisión", tono: "aviso" },
  IN_APPEAL: { texto: "En apelación", tono: "aviso" },
  REJECTED: { texto: "Rechazada", tono: "neutro" },
  PAUSED: { texto: "Pausada", tono: "neutro" },
  DISABLED: { texto: "Desactivada", tono: "neutro" },
};

export async function Plantillas() {
  const { data: cuenta } = await createAdminClient()
    .from("channel_accounts")
    .select("zernio_account_id")
    .eq("platform", "whatsapp")
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();
  if (!cuenta) return <p className="text-sm text-muted">Conecta WhatsApp para usar plantillas.</p>;

  let lista: Awaited<ReturnType<typeof plantillasDe>> = [];
  let error = false;
  try {
    lista = await plantillasDe(cuenta.zernio_account_id);
  } catch {
    error = true;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        WhatsApp solo deja escribir libremente hasta 24 horas después del último mensaje del cliente. Después, solo con una plantilla que Meta
        haya aprobado. Meta cobra cada plantilla entregada (unos centavos de dólar): las de <b>Utilidad</b> (pedidos, pagos, envíos) cuestan
        menos que las de <b>Marketing</b> (ofertas, novedades).
      </p>
      {error && <p className="text-sm text-danger">No se pudieron leer las plantillas de Meta.</p>}
      {lista.map((p) => {
        const e = ESTADO[p.status] ?? { texto: p.status, tono: "neutro" as const };
        return (
          <Card key={`${p.name}|${p.language}`} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{p.name}</p>
              <Chip tono={e.tono}>{e.texto}</Chip>
              <span className="text-xs text-muted">
                {p.category === "MARKETING" ? "Marketing" : p.category === "UTILITY" ? "Utilidad" : p.category} · {p.language}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap text-muted">{cuerpo(p)}</p>
          </Card>
        );
      })}
      {!lista.length && !error && <p className="text-sm text-muted">Todavía no hay plantillas.</p>}
      <form action={actualizarPlantillas}>
        <button className="text-sm font-medium text-accent">Actualizar estados</button>
      </form>
      <Card>
        <NuevaPlantillaForm />
      </Card>
    </div>
  );
}
