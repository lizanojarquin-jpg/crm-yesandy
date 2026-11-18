import Link from "next/link";
import { getUsuarioActual } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui/avatar";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { nombreContacto, textoEtapa, type Etapa, type Plataforma } from "@/lib/inbox/etiquetas";
import { fechaInput, fechaLarga, horaCorta } from "@/lib/formato";
import { confirmarEtapa } from "../_bandeja/acciones";

export const metadata = { title: "Seguimiento · CRM Yesandy" };

type Fila = {
  id: string;
  name: string | null;
  phone: string | null;
  stage: Etapa;
  stage_pending_review: boolean;
  follow_up_at: string | null;
  contact_identities: { handle: string | null }[];
  conversations: { id: string; last_message_at: string | null; canal: { platform: Plataforma } }[];
};

const CAMPOS =
  "id, name, phone, stage, stage_pending_review, follow_up_at, contact_identities(handle), " +
  "conversations(id, last_message_at, canal:channel_accounts(platform))";

const EN_CURSO: Etapa[] = ["order_confirmed", "payment_received", "shipped"];

export default async function SeguimientoPage() {
  await getUsuarioActual();
  const sb = await createClient();
  const hoy = fechaInput(new Date().toISOString());
  const finHoy = `${hoy}T23:59:59-06:00`;
  const en7 = new Date(new Date(finHoy).getTime() + 7 * 86_400_000).toISOString();

  const [porConfirmar, paraHoy, proximos, enCurso] = await Promise.all([
    sb.from("contacts").select(CAMPOS).eq("stage_pending_review", true).order("updated_at", { ascending: false }).limit(50).returns<Fila[]>(),
    sb
      .from("contacts")
      .select(CAMPOS)
      .lte("follow_up_at", finHoy)
      .not("stage", "in", "(delivered,lost)")
      .order("follow_up_at")
      .limit(50)
      .returns<Fila[]>(),
    sb.from("contacts").select(CAMPOS).gt("follow_up_at", finHoy).lte("follow_up_at", en7).order("follow_up_at").limit(50).returns<Fila[]>(),
    sb.from("contacts").select(CAMPOS).in("stage", EN_CURSO).order("updated_at", { ascending: false }).limit(150).returns<Fila[]>(),
  ]);

  // Lo que detectó la IA (motivo) para cada contacto por confirmar.
  const pendientes = porConfirmar.data ?? [];
  const { data: notas } = pendientes.length
    ? await sb
        .from("stage_events")
        .select("contact_id, note, created_at")
        .eq("source", "ai")
        .is("confirmed_at", null)
        .in("contact_id", pendientes.map((p) => p.id))
        .order("created_at", { ascending: false })
    : { data: [] };
  const motivo = new Map<string, string>();
  for (const n of notas ?? []) if (n.note && !motivo.has(n.contact_id)) motivo.set(n.contact_id, n.note);

  // Conversaciones que la asesora IA pasó a vendedora y nadie ha tomado.
  const { data: traspasos } = await sb
    .from("ai_handoffs")
    .select(
      "id, reason, summary, created_at, conversacion:conversations!inner(id, contacto:contacts!inner(name, phone, contact_identities(handle)), canal:channel_accounts!inner(platform))",
    )
    .is("taken_by", null)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<
      {
        id: string;
        reason: string;
        summary: { prendas?: string; talla?: string; ocasion?: string };
        created_at: string;
        conversacion: {
          id: string;
          contacto: { name: string | null; phone: string | null; contact_identities: { handle: string | null }[] };
          canal: { platform: Plataforma };
        };
      }[]
    >();

  const nada =
    !traspasos?.length && !pendientes.length && !paraHoy.data?.length && !proximos.data?.length && !enCurso.data?.length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-semibold">Seguimiento</h1>
      <p className="text-sm text-muted">Lo que pasó o detectó la IA, a quién escribirle hoy y los pedidos en curso.</p>

      {nada && (
        <EmptyState
          titulo="Sin clientes en seguimiento"
          descripcion="Cuando la IA detecte un pedido, un comprobante o una guía, o cuando pongas una fecha de seguimiento en la ficha, aparecen aquí."
        />
      )}

      {traspasos && traspasos.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 flex items-baseline gap-2">
            <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">La IA pasó a vendedora</h2>
            <span className="text-xs text-muted">{traspasos.length}</span>
          </div>
          <p className="mb-2 text-xs text-muted">Clientes que la asesora IA dejó listos para confirmar talla, color y precio.</p>
          <ul className="overflow-hidden rounded-xl border border-border bg-surface">
            {traspasos.map((t) => {
              const c = t.conversacion;
              const nombre = nombreContacto(c.contacto, c.contacto.contact_identities[0]?.handle);
              const extra = [t.summary?.prendas, t.summary?.talla && `talla ${t.summary.talla}`, t.summary?.ocasion].filter(Boolean).join(" · ");
              return (
                <li key={t.id} className="flex gap-3 border-b border-border/70 px-4 py-3 last:border-b-0">
                  <Avatar nombre={nombre} canal={c.canal.platform} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <Link href={`/c/${c.id}`} className="truncate font-medium hover:underline">
                        {nombre}
                      </Link>
                      <span className="ml-auto shrink-0 text-xs text-muted">{horaCorta(t.created_at)}</span>
                    </div>
                    <p className="text-xs text-muted">{t.reason}</p>
                    {extra && <p className="text-xs text-muted italic">{extra}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Seccion titulo="Por confirmar" ayuda="La IA movió la etapa. Revisa la conversación y confirma." filas={pendientes}>
        {(f) => (
          <>
            {motivo.get(f.id) && <p className="text-xs text-muted italic">{motivo.get(f.id)}</p>}
            <form action={confirmarEtapa.bind(null, f.id)} className="mt-1">
              <button className="h-8 rounded-lg bg-amber-600 px-3 text-xs font-medium text-white">Confirmar {textoEtapa(f.stage)}</button>
            </form>
          </>
        )}
      </Seccion>

      <Seccion titulo="Escribir hoy" ayuda="Fecha de seguimiento hoy o atrasada." filas={paraHoy.data ?? []}>
        {(f) => (
          <p className={`text-xs ${f.follow_up_at && fechaInput(f.follow_up_at) < hoy ? "text-danger" : "text-muted"}`}>
            {f.follow_up_at && fechaInput(f.follow_up_at) < hoy ? `Atrasado desde el ${fechaLarga(f.follow_up_at)}` : "Hoy"}
          </p>
        )}
      </Seccion>

      <Seccion titulo="Próximos 7 días" filas={proximos.data ?? []}>
        {(f) => <p className="text-xs text-muted">{f.follow_up_at ? fechaLarga(f.follow_up_at) : ""}</p>}
      </Seccion>

      {EN_CURSO.map((etapa) => (
        <Seccion key={etapa} titulo={textoEtapa(etapa)} filas={(enCurso.data ?? []).filter((f) => f.stage === etapa && !f.stage_pending_review)} />
      ))}
    </div>
  );
}

function Seccion({
  titulo,
  ayuda,
  filas,
  children,
}: {
  titulo: string;
  ayuda?: string;
  filas: Fila[];
  children?: (f: Fila) => React.ReactNode;
}) {
  if (!filas.length) return null;
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">{titulo}</h2>
        <span className="text-xs text-muted">{filas.length}</span>
      </div>
      {ayuda && <p className="mb-2 text-xs text-muted">{ayuda}</p>}
      <ul className="overflow-hidden rounded-xl border border-border bg-surface">
        {filas.map((f) => {
          const ultima = [...f.conversations].sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""))[0];
          const nombre = nombreContacto(f, f.contact_identities[0]?.handle);
          return (
            <li key={f.id} className="flex gap-3 border-b border-border/70 px-4 py-3 last:border-b-0">
              <Avatar nombre={nombre} canal={ultima?.canal.platform} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  {ultima ? (
                    <Link href={`/c/${ultima.id}`} className="truncate font-medium hover:underline">
                      {nombre}
                    </Link>
                  ) : (
                    <p className="truncate font-medium">{nombre}</p>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-muted">{horaCorta(ultima?.last_message_at)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <Chip tono={f.stage_pending_review ? "aviso" : "acento"}>{textoEtapa(f.stage)}</Chip>
                </div>
                {children?.(f)}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
