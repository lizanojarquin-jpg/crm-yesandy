import Link from "next/link";
import { Avatar, CanalPunto } from "@/components/ui/avatar";
import { Chip, ChipEnlace } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { contarSinLeer, listarConversaciones, listarEquipo } from "@/lib/inbox/queries";
import { conQs, qs, type Filtros } from "@/lib/inbox/filtros";
import { nombreContacto, PLATAFORMAS, textoEtapa } from "@/lib/inbox/etiquetas";
import { horaCorta } from "@/lib/formato";
import { SelectEtapa } from "./select-etapa";
import { SelectVendedora } from "./select-vendedora";

export async function ListaConversaciones({
  filtros,
  activeId,
  usuarioId,
  ruta,
  esAdmin,
}: {
  filtros: Filtros;
  activeId?: string;
  usuarioId: string;
  ruta: string;
  esAdmin: boolean;
}) {
  // Solo administración filtra por vendedora.
  const f = esAdmin ? filtros : { ...filtros, vendedora: undefined };
  const [convs, equipo, sinLeer] = await Promise.all([listarConversaciones(f, usuarioId), listarEquipo(), contarSinLeer(f, usuarioId)]);
  const nombres = new Map(equipo.map((p) => [p.id, p.display_name]));
  const vendedora = f.vendedora === "libres" ? "Sin tomar" : f.vendedora ? nombres.get(f.vendedora) : null;
  const q = qs(f);
  const enlace = (cambios: Partial<Filtros>) => conQs(ruta, qs(f, cambios));
  const hayFiltros = Boolean(f.canal || f.etapa || f.ver || f.sinLeer || f.cerradas || f.buscar || f.vendedora);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-border px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between">
          <h1 className="min-w-0 truncate text-lg font-semibold">
            {f.buscar ? "Búsqueda" : f.cerradas ? "Cerradas" : "Bandeja"}
            {vendedora && <span className="font-normal text-muted"> · {vendedora}</span>}
          </h1>
          <span className="shrink-0 text-xs text-muted">{convs.length === 150 ? "150+" : convs.length} conversaciones</span>
        </div>
        {/* Buscar por nombre o teléfono: conserva los demás filtros. */}
        <form action={ruta} method="get" role="search" className="relative">
          {f.canal && <input type="hidden" name="canal" value={f.canal} />}
          {f.etapa && <input type="hidden" name="etapa" value={f.etapa} />}
          {f.ver && <input type="hidden" name="ver" value={f.ver} />}
          {f.sinLeer && <input type="hidden" name="sin_leer" value="1" />}
          {f.vendedora && <input type="hidden" name="vendedora" value={f.vendedora} />}
          <label htmlFor="buscar-chat" className="sr-only">
            Buscar chat por nombre o teléfono
          </label>
          <svg
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            id="buscar-chat"
            name="buscar"
            type="search"
            defaultValue={f.buscar ?? ""}
            key={f.buscar ?? ""}
            placeholder="Buscar por nombre o teléfono"
            enterKeyHint="search"
            className="h-10 w-full rounded-full border border-border bg-background pr-9 pl-9 text-base outline-none focus:border-accent"
          />
          {f.buscar && (
            <Link
              href={enlace({ buscar: undefined })}
              aria-label="Quitar búsqueda"
              className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted hover:text-foreground"
            >
              ✕
            </Link>
          )}
        </form>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
          {esAdmin && (
            <SelectVendedora
              actual={f.vendedora}
              base={qs(f, { vendedora: undefined })}
              equipo={equipo}
            />
          )}
          <ChipEnlace href={enlace({ ver: undefined, sinLeer: undefined })} activo={!f.ver && !f.sinLeer}>
            Todas
          </ChipEnlace>
          <ChipEnlace href={enlace({ ver: f.ver === "mias" ? undefined : "mias" })} activo={f.ver === "mias"}>
            Mías
          </ChipEnlace>
          {/* Se combina con "Mías": cada vendedora ve sus chats sin leer. */}
          <ChipEnlace href={enlace({ sinLeer: !f.sinLeer || undefined })} activo={Boolean(f.sinLeer)}>
            Sin leer
            {sinLeer > 0 && (
              <span
                className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
                  f.sinLeer ? "bg-accent-foreground text-accent" : "bg-accent text-accent-foreground"
                }`}
              >
                {sinLeer > 99 ? "99+" : sinLeer}
              </span>
            )}
          </ChipEnlace>
          <ChipEnlace href={enlace({ ver: f.ver === "comentarios" ? undefined : "comentarios" })} activo={f.ver === "comentarios"}>
            Comentarios
          </ChipEnlace>
          <ChipEnlace href={enlace({ cerradas: !f.cerradas || undefined })} activo={Boolean(f.cerradas)}>
            Cerradas
          </ChipEnlace>
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
          {PLATAFORMAS.map((p) => (
            <ChipEnlace
              key={p.valor}
              href={enlace({ canal: f.canal === p.valor ? undefined : p.valor })}
              activo={f.canal === p.valor}
            >
              <CanalPunto canal={p.valor} />
              {p.texto}
            </ChipEnlace>
          ))}
          <SelectEtapa actual={f.etapa} base={qs(f, { etapa: undefined })} />
        </div>
      </div>

      {convs.length === 0 ? (
        <EmptyState
          titulo={f.buscar ? `Ningún chat con «${f.buscar}»` : hayFiltros ? "Nada con estos filtros" : "Todavía no hay conversaciones"}
          descripcion={
            hayFiltros
              ? f.buscar
                ? "Prueba con otra parte del nombre o con el teléfono."
                : "Prueba quitando algún filtro."
              : "Los mensajes y comentarios de WhatsApp, Facebook, Instagram y TikTok aparecen aquí al llegar."
          }
        />
      ) : (
        <ul className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {convs.map((c) => {
            const nombre = nombreContacto(c.contacto, c.contacto.contact_identities[0]?.handle);
            const activa = c.id === activeId;
            const sinLeer = c.unread_count > 0;
            const atiende = c.assigned_to ? nombres.get(c.assigned_to) : null;
            return (
              <li key={c.id}>
                <Link
                  href={conQs(`/c/${c.id}`, q)}
                  aria-current={activa ? "page" : undefined}
                  className={`flex gap-3 border-b border-border/70 px-4 py-3 transition ${
                    activa ? "bg-accent/8" : "hover:bg-background lg:hover:bg-background"
                  }`}
                >
                  <Avatar nombre={nombre} canal={c.canal.platform} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className={`truncate ${sinLeer ? "font-semibold" : "font-medium"}`}>{nombre}</p>
                      <span className={`ml-auto shrink-0 text-xs ${sinLeer ? "font-semibold text-accent" : "text-muted"}`}>
                        {horaCorta(c.last_message_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={`flex-1 truncate text-sm ${sinLeer ? "text-foreground" : "text-muted"}`}>
                        {c.last_message_preview ?? "Sin mensajes"}
                      </p>
                      {sinLeer && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-foreground">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {c.kind === "comment" && <Chip>Comentario</Chip>}
                      <Chip tono={c.contacto.stage === "new" ? "neutro" : "acento"}>{textoEtapa(c.contacto.stage)}</Chip>
                      {c.contacto.stage_pending_review && <Chip tono="aviso">Por confirmar</Chip>}
                      {c.ai_attending && <Chip>IA atendiendo</Chip>}
                      {c.ai_mode === "handoff" && !c.assigned_to && <Chip tono="aviso">Lista para tomar</Chip>}
                      {atiende && <span className="text-[11px] text-muted">Atiende {atiende}</span>}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
