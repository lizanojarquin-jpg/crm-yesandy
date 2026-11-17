import Link from "next/link";
import { Avatar, CanalPunto } from "@/components/ui/avatar";
import { Chip, ChipEnlace } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { listarConversaciones, listarEquipo } from "@/lib/inbox/queries";
import { conQs, qs, type Filtros } from "@/lib/inbox/filtros";
import { nombreContacto, PLATAFORMAS, textoEtapa } from "@/lib/inbox/etiquetas";
import { horaCorta } from "@/lib/formato";
import { SelectEtapa } from "./select-etapa";

export async function ListaConversaciones({
  filtros,
  activeId,
  usuarioId,
  ruta,
}: {
  filtros: Filtros;
  activeId?: string;
  usuarioId: string;
  ruta: string;
}) {
  const [convs, equipo] = await Promise.all([listarConversaciones(filtros, usuarioId), listarEquipo()]);
  const nombres = new Map(equipo.map((p) => [p.id, p.display_name]));
  const q = qs(filtros);
  const enlace = (cambios: Partial<Filtros>) => conQs(ruta, qs(filtros, cambios));
  const hayFiltros = Boolean(filtros.canal || filtros.etapa || filtros.ver || filtros.cerradas);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 border-b border-border px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-semibold">{filtros.cerradas ? "Cerradas" : "Bandeja"}</h1>
          <span className="text-xs text-muted">{convs.length === 150 ? "150+" : convs.length} conversaciones</span>
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
          <ChipEnlace href={enlace({ ver: undefined })} activo={!filtros.ver}>Todas</ChipEnlace>
          <ChipEnlace href={enlace({ ver: filtros.ver === "sin_leer" ? undefined : "sin_leer" })} activo={filtros.ver === "sin_leer"}>
            Sin leer
          </ChipEnlace>
          <ChipEnlace href={enlace({ ver: filtros.ver === "mias" ? undefined : "mias" })} activo={filtros.ver === "mias"}>
            Mías
          </ChipEnlace>
          <ChipEnlace href={enlace({ ver: filtros.ver === "comentarios" ? undefined : "comentarios" })} activo={filtros.ver === "comentarios"}>
            Comentarios
          </ChipEnlace>
          <ChipEnlace href={enlace({ cerradas: !filtros.cerradas || undefined })} activo={Boolean(filtros.cerradas)}>
            Cerradas
          </ChipEnlace>
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
          {PLATAFORMAS.map((p) => (
            <ChipEnlace
              key={p.valor}
              href={enlace({ canal: filtros.canal === p.valor ? undefined : p.valor })}
              activo={filtros.canal === p.valor}
            >
              <CanalPunto canal={p.valor} />
              {p.texto}
            </ChipEnlace>
          ))}
          <SelectEtapa actual={filtros.etapa} base={qs(filtros, { etapa: undefined })} />
        </div>
      </div>

      {convs.length === 0 ? (
        <EmptyState
          titulo={hayFiltros ? "Nada con estos filtros" : "Todavía no hay conversaciones"}
          descripcion={
            hayFiltros
              ? "Prueba quitando algún filtro."
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
