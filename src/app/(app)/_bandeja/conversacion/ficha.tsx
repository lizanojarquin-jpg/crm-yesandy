import Link from "next/link";
import { Avatar, CanalPunto } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import type { ConversacionDetalle } from "@/lib/inbox/queries";
import { datosFicha } from "@/lib/inbox/queries";
import { nombreContacto, plataforma, textoEtapa } from "@/lib/inbox/etiquetas";
import { fechaInput, fechaLarga, horaCorta } from "@/lib/formato";
import { confirmarEtapa } from "../acciones";
import { AsignarSelector, DatosContactoForm, EtapaSelector } from "./ficha-controles";

export async function Ficha({
  conv,
  equipo,
  nombres,
  q,
}: {
  conv: ConversacionDetalle;
  equipo: { id: string; display_name: string }[];
  nombres: Map<string, string>;
  q: string;
}) {
  const c = conv.contacto;
  const { otras, etapas } = await datosFicha(c.id, conv.id);
  const nombre = nombreContacto(c, c.contact_identities[0]?.handle);

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center gap-3">
        <Avatar nombre={nombre} tamano="lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{nombre}</p>
          <ul className="mt-1 flex flex-col gap-1">
            {c.contact_identities.map((i, n) => (
              <li key={n} className="flex items-center gap-1.5 text-sm text-muted">
                <CanalPunto canal={i.platform} />
                {i.handle ? (i.platform === "whatsapp" ? i.handle : `@${i.handle}`) : plataforma(i.platform).texto}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <EtapaSelector contactId={c.id} etapa={c.stage} />
        {c.stage_pending_review && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-500/10 px-3 py-2">
            <p className="text-sm text-amber-800 dark:text-amber-200">La IA movió la etapa. ¿Es correcta?</p>
            <form action={confirmarEtapa.bind(null, c.id)}>
              <button className="h-9 rounded-lg bg-amber-600 px-3 text-sm font-medium text-white">Confirmar</button>
            </form>
          </div>
        )}
        <AsignarSelector conversationId={conv.id} asignada={conv.assigned_to} equipo={equipo} />
      </section>

      <section>
        <DatosContactoForm
          contactId={c.id}
          nombre={c.name ?? ""}
          telefono={c.phone ?? ""}
          seguimiento={fechaInput(c.follow_up_at)}
          notas={c.notes ?? ""}
          motivo={c.loss_reason ?? ""}
          mostrarMotivo={c.stage === "lost" || Boolean(c.loss_reason)}
        />
      </section>

      {otras.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Otras conversaciones</h3>
          <ul className="flex flex-col gap-1">
            {otras.map((o) => (
              <li key={o.id}>
                <Link
                  href={q ? `/c/${o.id}?${q}` : `/c/${o.id}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-background"
                >
                  <CanalPunto canal={o.canal.platform} />
                  {o.kind === "comment" ? "Comentarios" : "Mensajes"} en {plataforma(o.canal.platform).texto}
                  <span className="ml-auto text-xs text-muted">{horaCorta(o.last_message_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {etapas.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Historial de etapas</h3>
          <ol className="flex flex-col gap-2">
            {etapas.map((e) => (
              <li key={e.id} className="text-sm">
                <p>
                  {e.from_stage ? `${textoEtapa(e.from_stage)} → ` : ""}
                  <span className="font-medium">{textoEtapa(e.to_stage)}</span>
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  {fechaLarga(e.created_at)} ·{" "}
                  {e.source === "ai" ? "detectado por IA" : e.created_by ? nombres.get(e.created_by) ?? "equipo" : "equipo"}
                  {e.source === "ai" && !e.confirmed_at && <Chip tono="aviso">sin confirmar</Chip>}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
