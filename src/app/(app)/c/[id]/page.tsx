import Link from "next/link";
import { notFound } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";
import { conQs, leerFiltros, qs } from "@/lib/inbox/filtros";
import { listarEquipo, listarMensajes, listarRespuestasRapidas, obtenerConversacion, traspasoAbierto } from "@/lib/inbox/queries";
import { leerAjustesIA } from "@/lib/ia/asesora";
import { AvisoTraspaso } from "../../_bandeja/conversacion/traspaso";
import { ControlIA } from "../../_bandeja/conversacion/control-ia";
import { nombreContacto, plataforma } from "@/lib/inbox/etiquetas";
import { ventanaMensajes } from "@/lib/inbox/ventana";
import { plantillasUsables } from "@/lib/inbox/plantillas";
import { Avatar } from "@/components/ui/avatar";
import { BandejaShell } from "../../_bandeja/shell";
import { cambiarEstado, liberarParaVentas, tomar } from "../../_bandeja/acciones";
import { MarcoConversacion } from "../../_bandeja/conversacion/marco";
import { Desplazador } from "../../_bandeja/conversacion/desplazador";
import { Mensajes } from "../../_bandeja/conversacion/mensajes";
import { Composer } from "../../_bandeja/conversacion/composer";
import { Ficha } from "../../_bandeja/conversacion/ficha";
import { MarcarLeida } from "../../_bandeja/conversacion/marcar-leida";

export const metadata = { title: "Conversación · CRM Yesandy" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Primer nombre "de verdad" del cliente (no teléfonos, emojis ni símbolos), con mayúscula inicial. */
function primerNombre(nombre: string | null) {
  const palabra = (nombre ?? "").split(/\s+/).find((p) => /^\p{L}[\p{L}'-]+$/u.test(p));
  return palabra ? palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase() : "";
}

export default async function ConversacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioActual();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const filtros = leerFiltros(await searchParams);
  const q = qs(filtros);

  const conv = await obtenerConversacion(id);
  if (!conv) notFound();
  const [mensajes, equipo, traspaso, ajustesIA, respuestas] = await Promise.all([
    listarMensajes(id),
    listarEquipo(),
    traspasoAbierto(id),
    leerAjustesIA(),
    listarRespuestasRapidas(),
  ]);
  const nombres = new Map(equipo.map((p) => [p.id, p.display_name]));
  const esAdmin = usuario.rol === "admin";
  // Todas ven todas las conversaciones, pero solo responde quien la tomó (o administración).
  const puedeResponder = esAdmin || conv.assigned_to === usuario.id;
  const miNombre = equipo.find((p) => p.id === usuario.id)?.public_name ?? "";

  const nombre = nombreContacto(conv.contacto, conv.contacto.contact_identities[0]?.handle);
  const canal = plataforma(conv.canal.platform);
  const esComentario = conv.kind === "comment";
  const ventana = esComentario
    ? { puede: true, aviso: null }
    : ventanaMensajes(conv.canal.platform, conv.last_inbound_at);
  const atiende = conv.assigned_to ? nombres.get(conv.assigned_to) : null;
  // Fuera de las 24 h de WhatsApp solo se puede escribir con una plantilla aprobada.
  const plantillas =
    !ventana.puede && conv.canal.platform === "whatsapp" ? await plantillasUsables(conv.canal.zernio_account_id) : undefined;

  const cabecera = (
    <>
      <Link
        href={conQs("/", q)}
        aria-label="Volver a la bandeja"
        className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-background lg:hidden"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m15 18-6-6 6-6" />
        </svg>
      </Link>
      <Avatar nombre={nombre} canal={conv.canal.platform} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{nombre}</p>
        <p className="truncate text-xs text-muted">
          {esComentario ? `Comentario en ${canal.texto}` : canal.texto}
          {atiende ? ` · atiende ${atiende}` : ""}
          {conv.status === "closed" ? " · cerrada" : ""}
        </p>
      </div>
      {esAdmin && conv.ai_attending && (
        <form action={liberarParaVentas.bind(null, conv.id)} className="hidden sm:block">
          <button className="inline-flex h-9 items-center rounded-lg border border-accent px-3 text-sm font-medium text-accent">
            Liberar para ventas
          </button>
        </form>
      )}
      {conv.assigned_to !== usuario.id && (esAdmin || (!conv.assigned_to && !conv.ai_attending)) && (
        <form action={tomar.bind(null, conv.id)}>
          <button className="inline-flex h-9 items-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground">
            Tomar
          </button>
        </form>
      )}
      {puedeResponder && (
        <form action={cambiarEstado.bind(null, conv.id, conv.status === "open" ? "closed" : "open")} className="hidden sm:block">
          <button className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium">
            {conv.status === "open" ? "Cerrar" : "Reabrir"}
          </button>
        </form>
      )}
    </>
  );

  const cuerpo = (
    <>
      {esComentario && conv.post_permalink && (
        <a
          href={conv.post_permalink}
          target="_blank"
          rel="noreferrer"
          className="border-b border-border bg-surface px-4 py-2 text-sm text-accent underline-offset-2 hover:underline"
        >
          Ver la publicación en {canal.texto} ↗
        </a>
      )}
      {traspaso && <AvisoTraspaso traspaso={traspaso} />}
      <Desplazador key={conv.id}>
        <Mensajes mensajes={mensajes} nombres={nombres} esAdmin={esAdmin} />
      </Desplazador>
      <MarcarLeida id={conv.id} sinLeer={conv.unread_count} />
    </>
  );

  return (
    <BandejaShell filtros={filtros} activeId={conv.id} usuarioId={usuario.id} ruta={`/c/${conv.id}`}>
      <MarcoConversacion
        cabecera={cabecera}
        cuerpo={cuerpo}
        pie={
          puedeResponder ? (
            <Composer
              key={conv.id}
              conversationId={conv.id}
              esComentario={esComentario}
              permitePrivado={esComentario && (conv.canal.platform === "facebook" || conv.canal.platform === "instagram")}
              puede={ventana.puede}
              aviso={ventana.aviso}
              plantillas={plantillas}
              primerNombre={primerNombre(conv.contacto.name)}
              respuestas={respuestas}
              vendedora={miNombre}
            />
          ) : (
            <div className="border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {conv.assigned_to ? (
                <p className="text-sm text-muted">
                  Esta conversación la atiende <b className="text-foreground">{atiende ?? "otra persona"}</b>. Solo esa persona y administración
                  pueden responder.
                </p>
              ) : conv.ai_attending ? (
                <p className="text-sm text-muted">
                  🤖 <b className="text-foreground">La asesora IA está atendiendo a este cliente.</b> Cuando esté listo para ventas, te llega un
                  aviso y aparece como «Lista para tomar».
                </p>
              ) : (
                <form action={tomar.bind(null, conv.id)} className="flex items-center gap-3">
                  <p className="flex-1 text-sm text-muted">Para responder, primero toma la conversación.</p>
                  <button className="h-10 shrink-0 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground">Tomar</button>
                </form>
              )}
            </div>
          )
        }
        ficha={
          <>
            <Ficha
              conv={conv}
              equipo={equipo}
              nombres={nombres}
              q={q}
              puedeEditar={puedeResponder}
              esAdmin={esAdmin}
              controlIA={
                puedeResponder && <ControlIA
                  conversationId={conv.id}
                  contactId={conv.contacto.id}
                  esComentario={esComentario}
                  aiMode={conv.ai_mode}
                  modoGlobal={ajustesIA.modo}
                  esPrueba={ajustesIA.contactosPrueba.includes(conv.contacto.id)}
                  esAdmin={usuario.rol === "admin"}
                  aiAttending={conv.ai_attending}
                />
              }
            />
            {puedeResponder && (
              <form
                action={cambiarEstado.bind(null, conv.id, conv.status === "open" ? "closed" : "open")}
                className="border-t border-border p-4 sm:hidden"
              >
                <button className="h-11 w-full rounded-lg border border-border text-sm font-medium">
                  {conv.status === "open" ? "Cerrar conversación" : "Reabrir conversación"}
                </button>
              </form>
            )}
          </>
        }
      />
    </BandejaShell>
  );
}
