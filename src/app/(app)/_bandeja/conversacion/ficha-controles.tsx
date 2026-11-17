"use client";

import { useActionState, useId, useTransition } from "react";
import { asignar, cambiarEtapa, guardarContacto, type Estado } from "../acciones";
import { ETAPAS, type Etapa } from "@/lib/inbox/etiquetas";
import { Button } from "@/components/ui/button";

const selectCls =
  "h-11 w-full rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent disabled:opacity-60";

export function EtapaSelector({ contactId, etapa }: { contactId: string; etapa: Etapa }) {
  const id = useId();
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        Etapa
      </label>
      <select
        id={id}
        value={etapa}
        disabled={pendiente}
        onChange={(e) => {
          const v = e.target.value as Etapa;
          iniciar(() => cambiarEtapa(contactId, v));
        }}
        className={selectCls}
      >
        {ETAPAS.map((e) => (
          <option key={e.valor} value={e.valor}>
            {e.texto}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AsignarSelector({
  conversationId,
  asignada,
  equipo,
}: {
  conversationId: string;
  asignada: string | null;
  equipo: { id: string; display_name: string }[];
}) {
  const id = useId();
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        La atiende
      </label>
      <select
        id={id}
        value={asignada ?? ""}
        disabled={pendiente}
        onChange={(e) => {
          const v = e.target.value || null;
          iniciar(() => asignar(conversationId, v));
        }}
        className={selectCls}
      >
        <option value="">Nadie todavía</option>
        {equipo.map((p) => (
          <option key={p.id} value={p.id}>
            {p.display_name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DatosContactoForm({
  contactId,
  nombre,
  telefono,
  seguimiento,
  notas,
  motivo,
  mostrarMotivo,
}: {
  contactId: string;
  nombre: string;
  telefono: string;
  seguimiento: string;
  notas: string;
  motivo: string;
  mostrarMotivo: boolean;
}) {
  const id = useId();
  const [estado, accion, pendiente] = useActionState<Estado, FormData>(guardarContacto.bind(null, contactId), null);
  const campo = "h-11 w-full rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent";
  return (
    <form action={accion} className="flex flex-col gap-3" key={`${nombre}|${telefono}|${seguimiento}|${notas}|${motivo}`}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-n`} className="text-sm font-medium">Nombre</label>
        <input id={`${id}-n`} name="nombre" defaultValue={nombre} maxLength={120} className={campo} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-t`} className="text-sm font-medium">Teléfono</label>
        <input id={`${id}-t`} name="telefono" type="tel" defaultValue={telefono} maxLength={40} className={campo} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-s`} className="text-sm font-medium">Fecha de seguimiento</label>
        <input id={`${id}-s`} name="seguimiento" type="date" defaultValue={seguimiento} className={campo} />
      </div>
      {mostrarMotivo && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-m`} className="text-sm font-medium">Por qué se perdió</label>
          <input id={`${id}-m`} name="motivo" defaultValue={motivo} maxLength={300} className={campo} />
        </div>
      )}
      {!mostrarMotivo && <input type="hidden" name="motivo" value={motivo} />}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-o`} className="text-sm font-medium">Notas</label>
        <textarea
          id={`${id}-o`}
          name="notas"
          defaultValue={notas}
          rows={4}
          maxLength={4000}
          placeholder="Talla, gustos, lo que pidió…"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar"}
        </Button>
        {estado && <p className={`text-sm ${estado.ok ? "text-muted" : "text-danger"}`}>{estado.mensaje}</p>}
      </div>
    </form>
  );
}
